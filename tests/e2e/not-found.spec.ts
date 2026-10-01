import { expect, test } from "@playwright/test";

// No backend calls: a malformed share token never reaches the API, and unmatched URLs are 404s.

test("a malformed or truncated share link shows the Korean share failure state with a way out", async ({ page }) => {
  await page.goto("/shared/abc");
  await expect(page.getByRole("heading", { name: "공유 결과를 열 수 없어요" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("링크 주소가 잘렸거나 올바르지 않아요");
  await expect(page.getByText("This page could not be found.")).toHaveCount(0);
  await page.getByRole("link", { name: "나도 명식 보기" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("an unknown URL shows the Korean not-found page with a link home", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "페이지를 찾을 수 없어요" })).toBeVisible();
  await expect(page.getByText("This page could not be found.")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await page.getByRole("link", { name: "홈으로 가기" }).click();
  await expect(page).toHaveURL(/\/$/);
});
