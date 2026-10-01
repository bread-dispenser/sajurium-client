import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createServerReport } from "./birth-helpers";

// Every test here talks to the real backend that `build:integration` points at.
const API = process.env.SAJURIUM_E2E_API_URL ?? "http://localhost:8000";

async function accessToken(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("sajurium.sasaju-auth.v1") ?? "null")?.accessToken as string);
}

async function api(request: APIRequestContext, token: string, path: string) {
  const response = await request.get(`${API}/api/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: response.status(), body: response.ok() ? await response.json() : null };
}

/** Saves a second person without a birth time, so the result is limited by the unknown hour. */
async function addPerson(page: Page, name: string) {
  await page.goto("/people/new");
  await page.getByLabel("이름 또는 별칭").fill(name);
  await page.getByLabel("태어난 해").fill("1991");
  await page.getByLabel("태어난 달").fill("3");
  await page.getByLabel("태어난 날").fill("2");
  await page.getByLabel("출생지").fill("부산");
  await page.getByLabel(`${name}님의 동의를 받았거나 이 정보를 저장할 권한이 있어요 (필수)`).check();
  await page.getByRole("button", { name: "사람 저장하기" }).click();
  await expect(page).toHaveURL(/\/people$/);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test("shows perspective summaries on the result and shares them without birth data", async ({ page, browser, request }) => {
  await createServerReport(page, "서연");
  await addPerson(page, "민준");
  await page.goto("/compatibility");
  await page.getByRole("button", { name: "궁합 보기" }).click();
  await expect(page).toHaveURL(/\/compatibility\/result\/\d+$/, { timeout: 15_000 });
  const resultId = page.url().split("/").at(-1);

  // Perspectives: title, summary and readable evidence, never the raw keys.
  await expect(page.getByRole("heading", { name: "관점별로 보면" })).toBeVisible();
  for (const title of ["대화 방식", "갈등이 생기는 지점", "서로에게 힘이 되는 부분"]) {
    await expect(page.getByRole("heading", { name: title, level: 3 })).toBeVisible();
  }
  const talkEvidence = page.getByRole("list", { name: "대화 방식의 근거" });
  await expect(talkEvidence).toContainText("서연님 일간");
  await expect(talkEvidence).toContainText("민준님 일간");
  await expect(page.getByRole("list", { name: "갈등이 생기는 지점의 근거" })).toContainText(/기운 서연님 \d+개, 민준님 \d+개/);
  await expect(page.locator("main")).not.toContainText(/communication|friction|day_gan|five_elements|_controls_|_generates_/);
  await expect(page.getByRole("note")).toContainText("출생 시간을 모르는 분이 있어 시주는 빼고 살폈어요.");
  await expect(page.getByRole("list", { name: "결제하면 열리는 내용" })).toBeVisible();

  // Share: both fields on by default, 7 days, then a link to copy.
  await page.getByRole("button", { name: "결과 공유하기" }).click();
  await expect(page.getByRole("switch", { name: /^관계 요약/ })).toBeChecked();
  await expect(page.getByRole("switch", { name: /^관점별 요약/ })).toBeChecked();
  await page.getByRole("button", { name: "7일" }).click();
  await page.getByRole("button", { name: "링크 만들기" }).click();
  const shareUrl = await page.getByLabel("공유 링크").inputValue();
  expect(shareUrl).toMatch(/\/shared\/[A-Za-z0-9_-]+$/);

  const links = (await api(request, await accessToken(page), "/share-links")).body as Array<{ target_type: string; target_id: number; include: string[] }>;
  expect(links[0]).toMatchObject({ target_type: "compatibility", target_id: Number(resultId), include: ["summary", "dimensions"] });

  // The public page in a fresh browser context: no session, no stored journey.
  const visitor = await browser.newContext();
  try {
    const shared = await visitor.newPage();
    await shared.goto(shareUrl);
    await expect(shared.getByRole("heading", { name: "연인 궁합", level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(shared.getByText("서연님과 민준님의 관계를 연인 관계로 살펴보고 공유한 요약이에요.")).toBeVisible();
    await expect(shared.getByRole("heading", { name: "관계 요약" })).toBeVisible();
    const views = shared.getByRole("region", { name: "관점별 요약" });
    for (const title of ["대화 방식", "갈등이 생기는 지점", "서로에게 힘이 되는 부분"]) {
      await expect(views.getByRole("heading", { name: title })).toBeVisible();
    }
    await expect(shared.getByRole("heading", { name: "출생 정보" })).toHaveCount(0);
    await expect(shared.locator("main")).not.toContainText(/1992|1991|6월 18일|3월 2일|서울|부산|오후 \d+시/);
  } finally {
    await visitor.close();
  }
});
