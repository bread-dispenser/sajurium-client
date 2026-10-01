import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createServerReport } from "./birth-helpers";

// Every test here talks to the real backend that `build:integration` points at.
const API = process.env.SAJURIUM_E2E_API_URL ?? "http://localhost:8000";

type Journey = { profileId: string; chartId: string; reportId: string };

async function session(page: Page): Promise<{ token: string; journey: Journey; userId: string }> {
  const { token, journey } = await page.evaluate(() => ({
    token: JSON.parse(localStorage.getItem("sajurium.sasaju-auth.v1") ?? "null")?.accessToken as string,
    journey: JSON.parse(localStorage.getItem("sajurium.server-journey.v1") ?? "null") as Journey,
  }));
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { sub: string };
  return { token, journey, userId: payload.sub };
}

async function api(request: APIRequestContext, token: string, path: string) {
  const response = await request.get(`${API}/api/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: response.status(), body: response.ok() ? await response.json() : null };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test("shares only the chosen fields and asks before adding a birth field", async ({ page, request }) => {
  await createServerReport(page, "공유 선택");
  const { token } = await session(page);
  await page.goto("/share");
  await expect(page.getByRole("switch", { name: /^한 줄 요약/ })).toBeChecked();
  await expect(page.getByRole("switch", { name: /^일주/ })).toBeChecked();
  await expect(page.getByRole("switch", { name: /^오행 균형/ })).toBeChecked();
  await expect(page.getByRole("switch", { name: /^출생일/ })).not.toBeChecked();
  await expect(page.getByRole("switch", { name: /^출생 시간/ })).not.toBeChecked();

  await page.getByRole("switch", { name: /^출생일/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "출생일은 링크를 받은 누구나 보게 돼요" })).toBeVisible();
  await page.getByRole("button", { name: "출생일 담기" }).click();
  await expect(page.getByRole("switch", { name: /^출생일/ })).toBeChecked();
  await page.getByRole("switch", { name: /^오행 균형/ }).click();
  await page.getByRole("button", { name: "링크 만들기" }).click();

  const shareUrl = await page.getByLabel("공유 링크").inputValue();
  expect(shareUrl).toMatch(/\/shared\/[A-Za-z0-9_-]+$/);
  const links = (await api(request, token, "/share-links")).body as Array<{ include: string[] }>;
  expect(links[0].include).toEqual(["summary", "day_pillar", "birth_date"]);

  await page.evaluate(() => localStorage.clear());
  await page.goto(new URL(shareUrl).pathname);
  await expect(page.getByRole("heading", { name: "한 줄 요약" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "일주" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "출생 정보" })).toBeVisible();
  await expect(page.getByText("양력 1992년 6월 18일")).toBeVisible();
  await expect(page.getByRole("heading", { name: "오행 균형" })).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(/오후 \d+시|서울/);
});
