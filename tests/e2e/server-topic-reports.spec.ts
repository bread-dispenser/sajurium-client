import { expect, test } from "@playwright/test";
import { createServerReport, fillBirthStepOne } from "./birth-helpers";

// Every test here talks to the real backend that `build:integration` points at.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test("renders the server topic report: free sections with evidence and locked paid titles", async ({ page }) => {
  await createServerReport(page, "주제 리포트");
  await page.goto("/report/topics/career");

  await expect(page.getByRole("heading", { level: 1, name: "커리어 리포트" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("예시", { exact: true })).toHaveCount(0);
  const free = page.getByRole("region", { name: "커리어 무료 미리보기" });
  await expect(free.getByRole("heading", { level: 2 })).toHaveText(["강점", "주의할 점", "지금의 흐름"]);
  await expect(free.getByRole("article", { name: "지금의 흐름" })).toContainText("대운");
  await expect(free.getByRole("article", { name: "강점" }).getByRole("list", { name: "이렇게 읽었어요" }).getByRole("listitem").first()).toBeVisible();

  const locked = page.getByRole("list", { name: "구매하면 열리는 내용" });
  await expect(locked.getByRole("listitem").filter({ hasText: "일에서 반복되는 패턴" })).toBeVisible();
  await expect(page.getByRole("button", { name: "결제 준비 중" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "리포트 구성 보기" })).toHaveAttribute("href", "/products/career-report");

  // The topic endpoint dedupes: opening the screen again returns the same report.
  const feedback = page.getByRole("link", { name: "도움됐어요" });
  const firstHref = await feedback.getAttribute("href");
  expect(firstHref).toMatch(/reportId=\d+&topic=career&reportKind=topic/);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "커리어 리포트" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: "도움됐어요" })).toHaveAttribute("href", firstHref!);
});

test("leaves out hour-dependent topic sections when the birth time is unknown", async ({ page }) => {
  await page.goto("/birth");
  await fillBirthStepOne(page, { name: "시간 모름", sijin: null });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("출생지").fill("서울");
  await page.getByRole("button", { name: "명식 계산하기", exact: true }).click();
  await expect(page).toHaveURL(/\/report$/, { timeout: 15_000 });

  await page.goto("/report/topics/love");
  const free = page.getByRole("region", { name: "연애 무료 미리보기" });
  await expect(free.getByRole("article", { name: "제외된 범위" })).toContainText("시주로 보는 내면의 관계 욕구", { timeout: 15_000 });
  await expect(page.getByRole("list", { name: "구매하면 열리는 내용" })).not.toContainText("시주로 보는 내면의 관계 욕구");
});

test("renders the server decade report with the current period highlighted", async ({ page }) => {
  await createServerReport(page, "대운 리포트");
  await page.goto("/reports/decade");

  const heading = page.getByRole("heading", { level: 1, name: /^지금은 \d+세부터 \d+세까지 이어지는 \S+ 대운이에요$/ });
  await expect(heading).toBeVisible({ timeout: 15_000 });
  const ganji = (await heading.textContent())!.match(/이어지는 (\S+) 대운이에요/)![1];

  const periods = page.getByRole("list", { name: "대운 구간" }).getByRole("listitem");
  expect(await periods.count()).toBeGreaterThan(1);
  const current = page.getByRole("list", { name: "대운 구간" }).locator('li[aria-current="step"]');
  await expect(current).toHaveCount(1);
  await expect(current).toContainText(`${ganji} 대운`);
  await expect(current).toContainText("지금");

  await expect(page.getByText(new RegExp(`지금은 ${ganji} 대운`))).toBeVisible();
  await expect(page.getByRole("list", { name: "이렇게 읽었어요" }).first()).toBeVisible();
  const locked = page.getByRole("list", { name: "구매하면 열리는 내용" });
  await expect(locked).toContainText("다음 대운 준비");
  await expect(locked).toContainText("구간별 심층 해설");
});
