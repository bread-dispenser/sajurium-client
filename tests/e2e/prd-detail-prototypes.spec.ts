import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServerReport } from "./birth-helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test("keeps unsupported production surfaces explicitly unavailable", async ({ page }) => {
  const cases = [
    ["/platform-labs", "플랫폼 랩은 아직 제공되지 않아요"],
    ["/admin/operations", "운영 작업은 아직 제공되지 않아요"],
    ["/admin/analytics", "운영 분석은 아직 제공되지 않아요"],
  ] as const;

  for (const [route, heading] of cases) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByRole("link", { name: "홈으로 돌아가기" })).toBeVisible();
  }

  // 주문 내역과 알림 정책은 이제 실제 화면이다. 결제 일시중지 공개와 설정으로의 안내는 그대로 확인한다.
  await page.goto("/billing");
  await expect(page.getByText("결제는 준비 중이에요. 지난 주문과 환불 내역은 계속 볼 수 있어요.")).toBeVisible();
  await page.goto("/notifications/policy");
  await expect(page.getByRole("heading", { name: "알림 설정은 설정 화면에 있어요" })).toBeVisible();
  await expect(page.getByRole("link", { name: "알림 설정 열기" })).toHaveAttribute("href", "/settings#notifications");
});

test("creates and deactivates a server-backed share link", async ({ page }) => {
  await createServerReport(page, "공유 확인");
  await page.goto("/share");
  await expect(page.getByRole("heading", { name: "기본 사주 리포트를 링크로 보내요" })).toBeVisible();
  await page.getByRole("button", { name: "링크 만들기" }).click();
  await expect(page.getByLabel("공유 링크")).toHaveValue(/\/shared\//);
  await page.getByRole("link", { name: "내가 만든 공유 링크 보기" }).click();
  await expect(page).toHaveURL(/\/share\/links$/);
  const activeLink = page.getByRole("listitem").filter({ hasText: "볼 수 있어요" }).first();
  await expect(activeLink).toBeVisible();
  await activeLink.getByRole("button", { name: "비활성화" }).click();
  await expect(page.getByRole("status")).toContainText("링크를 비활성화했어요");
  await expect(page.getByRole("region", { name: "닫힌 링크" }).getByRole("listitem").filter({ hasText: "비활성화함" }).first()).toBeVisible();
});

test("loads and updates notification preferences through the API", async ({ page }) => {
  await page.goto("/settings");
  const preferences = page.getByRole("region", { name: "알림" });
  await expect(preferences.getByRole("heading", { name: "알림" })).toBeVisible();
  const firstPreference = preferences.getByRole("switch").first();
  await expect(firstPreference).toBeVisible();
  const before = await firstPreference.isChecked();
  await firstPreference.setChecked(!before);
  await expect(firstPreference).toBeChecked({ checked: !before });
  await page.reload();
  await expect(page.getByRole("region", { name: "알림" }).getByRole("switch").first()).toBeChecked({ checked: !before });
});

test("shows server notifications without linking to an external deep link", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.route("**/api/v1/notifications", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
      { id: 1, topic: "report_ready", title: "리포트가 준비됐어요", body: "결과를 확인해 주세요.", status: "SENT", created_at: "2026-09-23T10:00:00Z", deep_link: "/report" },
      { id: 2, topic: "notice", title: "외부 링크는 열지 않아요", status: "SENT", created_at: "2026-09-23T10:00:00Z", deep_link: "https://example.org" },
    ]) });
  });
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "리포트가 준비됐어요" })).toBeVisible();
  await expect(page.getByText("리포트 완성, 9월 23일")).toBeVisible();
  await expect(page.getByRole("link", { name: "내용 보기" })).toHaveAttribute("href", "/report");
  await expect(page.getByRole("heading", { name: "외부 링크는 열지 않아요" })).toBeVisible();
  await expect(page.getByRole("link", { name: "내용 보기" })).toHaveCount(1);
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 320);
  await page.screenshot({ path: testInfo.outputPath("notifications.png"), fullPage: true });
});

test("downloads an authenticated account export with the saved profile", async ({ page }) => {
  await createServerReport(page, "공유 확인");
  await page.goto("/settings/privacy");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "내 데이터 내려받기" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("sajurium-account-export.json");
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(exported.data.profiles[0].nickname).toBe("공유 확인");
  expect(exported.data.user.hashed_password).toBeUndefined();
});

test("offers a retry after the notification settings request fails", async ({ page }) => {
  let failed = false;
  await page.route("**/api/v1/notification-preferences", async (route) => {
    if (route.request().method() === "GET" && !failed) {
      failed = true;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await page.goto("/settings");
  const preferences = page.getByRole("region", { name: "알림" });
  await expect(preferences.getByRole("alert")).toBeVisible();
  await expect(preferences.getByRole("switch")).toHaveCount(0);
  await preferences.getByRole("button", { name: "다시 시도" }).click();
  await expect(preferences.getByRole("switch").first()).toBeVisible();
});

test("keeps an invalid public share token private and non-indexable", async ({ page }) => {
  await page.goto("/shared/V7m2Q9x4Ka8Nz3Rt");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("heading", { name: "공유 결과를 열 수 없어요" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/1992-06-18|14:30|서울/);
});
