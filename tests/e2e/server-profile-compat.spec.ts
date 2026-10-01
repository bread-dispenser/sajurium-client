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

test("edits my birth information into a new chart while the old report stays", async ({ page, request }) => {
  await createServerReport(page, "수정 확인");
  const before = await session(page);
  await page.goto("/settings");
  await page.getByRole("link", { name: /출생 정보 수정/ }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("note")).toContainText("수정하면 새 명식이 만들어지고 이전 리포트는 그대로 남아요.");
  await expect(page.getByLabel("부를 이름")).toHaveValue("수정 확인");
  await expect(page.getByLabel("태어난 날")).toHaveValue("18");
  await expect(page.getByRole("button", { name: /^미시/ })).toHaveAttribute("aria-pressed", "true");

  await page.getByLabel("태어난 날").fill("19");
  await page.getByRole("button", { name: "새 명식으로 저장하기" }).click();
  await expect(page.getByRole("heading", { name: "새 명식으로 저장했어요" })).toBeVisible({ timeout: 15_000 });

  const after = await session(page);
  expect(after.journey.profileId).toBe(before.journey.profileId);
  expect(after.journey.chartId).not.toBe(before.journey.chartId);
  expect(after.journey.reportId).not.toBe(before.journey.reportId);
  expect((await api(request, after.token, `/profiles/${after.journey.profileId}`)).body).toMatchObject({ birth_day: 19 });
  expect((await api(request, after.token, `/reports/${before.journey.reportId}`)).status).toBe(200);
  const oldChart = (await api(request, after.token, `/charts/${before.journey.chartId}`)).body as { day_gan: string; day_ji: string };
  const newChart = (await api(request, after.token, `/charts/${after.journey.chartId}`)).body as { day_gan: string; day_ji: string };
  expect(`${newChart.day_gan}${newChart.day_ji}`).not.toBe(`${oldChart.day_gan}${oldChart.day_ji}`);

  await page.getByRole("link", { name: "새 명식 보기" }).click();
  await expect(page).toHaveURL(/\/report$/);

  await page.goto("/people");
  await page.getByRole("link", { name: "수정 확인 출생 정보 수정" }).click();
  await expect(page).toHaveURL(new RegExp(`/people/${after.journey.profileId}/edit$`));
  await expect(page.getByLabel("태어난 날")).toHaveValue("19");
});

test("opens a stored compatibility result straight from the server", async ({ page }) => {
  await page.goto("/compatibility/result/999999999");
  await expect(page.getByRole("heading", { name: "궁합 결과를 찾을 수 없어요" })).toBeVisible();
});
