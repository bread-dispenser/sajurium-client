import { expect, test } from "@playwright/test";

async function createServerReport(page: import("@playwright/test").Page) {
  await page.goto("/birth");
  await page.getByLabel("이름 또는 닉네임").fill("장기 흐름 확인");
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

test("presents the real account login surface", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  await expect(page.getByLabel("이메일")).toBeVisible();
  await expect(page.getByLabel("비밀번호")).toBeVisible();
  await expect(page.getByRole("button", { name: "로그인", exact: true })).toBeEnabled();
  await expect(page.getByText(/소셜 로그인은 제공자 자격증명이 연결되면/)).toBeVisible();
});

test("renders the annual flow from the persisted server chart", async ({ page }) => {
  await createServerReport(page);
  await page.goto("/reports/year");
  await expect(page.getByRole("heading", { name: "올해 흐름" })).toBeVisible();
  await expect(page.getByText(/서버에 저장된 명식과 기간 기준/)).toBeVisible();
});

test("keeps unsupported former prototype routes explicit", async ({ page }) => {
  const cases = [
    ["/calendar", "시기 캘린더는 아직 제공되지 않아요"],
    ["/reports/decade", "10년 리포트는 아직 제공되지 않아요"],
    ["/admin", "운영 콘솔은 아직 제공되지 않아요"],
    ["/share", "공유 카드 미리보기는 제공되지 않아요"],
    ["/life-log", "라이프 로그는 아직 제공되지 않아요"],
  ] as const;

  for (const [route, heading] of cases) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});
