import { expect, test } from "@playwright/test";

async function createServerReport(page: import("@playwright/test").Page) {
  await page.goto("/birth");
  await page.getByLabel("이름 또는 닉네임").fill("공유 확인");
  await page.getByLabel("생년월일").fill("1992-06-18");
  await page.getByLabel("출생지").fill("서울");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page).toHaveURL(/\/report$/);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test("keeps unsupported production surfaces explicitly unavailable", async ({ page }) => {
  const cases = [
    ["/profile", "내 프로필 편집은 준비 중입니다"],
    ["/billing", "결제 복구 센터는 아직 제공되지 않아요"],
    ["/notifications/policy", "알림 정책 미리보기는 제공되지 않아요"],
    ["/platform-labs", "플랫폼 랩은 아직 제공되지 않아요"],
    ["/admin/operations", "운영 작업은 아직 제공되지 않아요"],
    ["/admin/analytics", "운영 분석은 아직 제공되지 않아요"],
  ] as const;

  for (const [route, heading] of cases) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByRole("link", { name: "홈으로 돌아가기" })).toBeVisible();
  }
});

test("creates and deactivates a server-backed share link", async ({ page }) => {
  await createServerReport(page);
  await page.goto("/share/links");
  await page.getByRole("button", { name: "현재 리포트 공유 링크 만들기" }).click();
  const activeLink = page.locator(".signal-row").filter({ hasText: "활성 링크" }).first();
  await expect(activeLink).toBeVisible();
  await expect(activeLink.locator("code")).toContainText("/shared/");
  await activeLink.getByRole("button", { name: "비활성화" }).click();
  await expect(page.locator(".signal-row").filter({ hasText: "비활성 링크" }).first()).toBeVisible();
});

test("loads and updates notification preferences through the API", async ({ page }) => {
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "받고 싶은 소식" })).toBeVisible();
  const firstPreference = page.locator('input[type="checkbox"]').first();
  const before = await firstPreference.isChecked();
  await firstPreference.setChecked(!before);
  await expect(firstPreference).toBeChecked({ checked: !before });
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
  await page.goto("/notifications");
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByRole("heading", { name: "받고 싶은 소식" })).toBeVisible();
});

test("keeps an invalid public share token private and non-indexable", async ({ page }) => {
  await page.goto("/shared/V7m2Q9x4Ka8Nz3Rt");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("heading", { name: "공유 결과를 열 수 없어요" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/1992-06-18|14:30|서울/);
});
