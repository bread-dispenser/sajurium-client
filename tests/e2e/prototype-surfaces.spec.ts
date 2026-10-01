import { expect, test } from "@playwright/test";
import { createServerReport } from "./birth-helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test("presents the real account login surface", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  await expect(page.getByLabel("이메일")).toBeVisible();
  await expect(page.getByLabel("비밀번호")).toBeVisible();
  await expect(page.getByRole("button", { name: "로그인", exact: true })).toBeEnabled();
  await expect(page.getByText(/소셜 로그인은 준비 중이에요/)).toBeVisible();
});

test("renders the annual flow from the persisted server chart", async ({ page }) => {
  await createServerReport(page, "장기 흐름 확인");
  await page.goto("/reports/year");
  await expect(page.getByRole("heading", { level: 1, name: /^\d{4}년 \S+년$/ })).toBeVisible();
  await expect(page.getByText(/서버에 저장된 명식과 기간 기준/)).toBeVisible();
});

test("keeps unsupported former prototype routes explicit", async ({ page }) => {
  const cases = [
    ["/admin", "운영 콘솔은 아직 제공되지 않아요"],
    ["/life-log", "라이프 로그는 아직 제공되지 않아요"],
  ] as const;

  for (const [route, heading] of cases) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("former prototype routes now render real screens with honest empty states", async ({ page }) => {
  // 시기 캘린더, 10년 흐름, 공유 카드는 이제 실제 화면이다. 명식이 없을 때 가짜 결과 대신 빈 상태를 보여 주는지 본다.
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { level: 1, name: /^\d{4}년 \d{1,2}월$/ })).toBeVisible();
  await page.goto("/reports/decade");
  await expect(page.getByRole("heading", { name: "대운을 보려면 명식이 필요해요" })).toBeVisible();
  await expect(page.getByRole("list", { name: "대운 구간" })).toHaveCount(0);
  await page.goto("/share");
  await expect(page.getByRole("heading", { name: "공유할 리포트가 아직 없어요" })).toBeVisible();
});
