import { expect, test } from "@playwright/test";
import { INITIAL_BIRTH } from "@/lib/fixtures";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
});

test("completes routed onboarding and stores the local report", async ({ page }) => {
  await page.getByRole("button", { name: "내 흐름 살펴보기" }).click();
  await expect(page).toHaveURL(/\/birth$/);
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page).toHaveURL(/\/report$/, { timeout: 5_000 });
  await expect(page.getByRole("navigation", { name: "전체 서비스" }).getByRole("link")).toHaveCount(29);

  await page.getByRole("link", { name: "관심 주제로 더 보기" }).click();
  await page.getByRole("radio", { name: /일 · 커리어/ }).click();
  await page.getByRole("button", { name: "일 · 커리어 내용 보기" }).click();
  await expect(page).toHaveURL(/\/report\/topics\/career$/);
  await page.getByRole("link", { name: "이 해석 저장하기" }).click();
  await page.getByRole("radio", { name: /도움이 됐어요/ }).click();
  await page.getByLabel("상세 사유").selectOption("too_generic");
  await page.getByRole("button", { name: "평가 저장하기" }).click();
  await page.getByRole("button", { name: "이 기기에 결과 저장" }).click();

  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem("sajurium-saju-report")))).toBe(true);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "이 기기에 저장한 결과 이어보기" })).toBeVisible();
});

test("recovers from the explicit one-time calculation failure", async ({ page }) => {
  await page.goto("/?calculation=fail");
  await page.getByRole("button", { name: "내 흐름 살펴보기" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByRole("heading", { name: "결과를 불러오지 못했어요" })).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "다시 준비하기" }).click();
  await expect(page).toHaveURL(/\/report$/, { timeout: 5_000 });
});

test("supports keyboard-only entry into the birth flow", async ({ page }) => {
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(() => document.activeElement?.textContent?.trim());
    if (label === "생년월일 입력하기") break;
  }
  await expect(page.getByRole("button", { name: "내 흐름 살펴보기" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/birth$/);
});

test("continues without persistently saving birth data", async ({ page }) => {
  await page.getByRole("button", { name: "내 흐름 살펴보기" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page).toHaveURL(/\/report$/, { timeout: 5_000 });
  await page.goto("/report/save?topic=career&feedback=helpful");
  await page.getByRole("link", { name: "저장하지 않고 계속 보기" }).click();
  await expect(page).toHaveURL(/\/report$/);
  const persistence = await page.evaluate(() => ({
    localBirthDraft: localStorage.getItem("sajurium-birth-draft"),
    profile: localStorage.getItem("sajurium-profile"),
    report: localStorage.getItem("sajurium-saju-report"),
    transientDraft: sessionStorage.getItem("sajurium-birth-draft"),
  }));
  expect(persistence.localBirthDraft).toBeNull();
  expect(persistence.profile).toBeNull();
  expect(persistence.report).toBeNull();
  expect(persistence.transientDraft).toBeNull();
});

test("surfaces unavailable report storage instead of treating it as empty", async ({ page }) => {
  const storedReport = JSON.stringify({
    version: 1,
    savedAt: "2026-08-25T00:00:00.000Z",
    birth: { ...INITIAL_BIRTH, displayName: "보존", birthDate: "1991-01-01", birthTime: "11:00" },
    topic: "career",
    feedback: null,
  });
  await page.evaluate((raw) => localStorage.setItem("sajurium-saju-report", raw), storedReport);
  await page.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Object.defineProperty(window, "__restoreReportRead", { value: () => { Storage.prototype.getItem = original; }, configurable: true });
    Storage.prototype.getItem = function getItem(key) {
      if (key === "sajurium-saju-report") throw new Error("injected unavailable report storage");
      return original.call(this, key);
    };
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "저장한 리포트를 읽을 수 없어요" })).toBeVisible();
  await expect(page.getByRole("button", { name: "내 흐름 살펴보기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "손상 데이터 초기화" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "다시 확인하기" })).toBeVisible();
  expect(await page.evaluate(() => {
    (window as typeof window & { __restoreReportRead?: () => void }).__restoreReportRead?.();
    return localStorage.getItem("sajurium-saju-report");
  })).toBe(storedReport);
});

test("preserves data when transaction-journal access or all storage reads are denied", async ({ page }) => {
  const storedReport = JSON.stringify({
    version: 1,
    savedAt: "2026-08-25T00:00:00.000Z",
    birth: { ...INITIAL_BIRTH, displayName: "전체보존", birthDate: "1992-06-18", birthTime: "14:30" },
    topic: "career",
    feedback: null,
  });
  await page.evaluate((raw) => localStorage.setItem("sajurium-saju-report", raw), storedReport);
  await page.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Object.defineProperty(window, "__restoreAllReads", { value: () => { Storage.prototype.getItem = original; }, configurable: true });
    Storage.prototype.getItem = function getItem() {
      throw new Error("injected browser-wide storage denial");
    };
  });
  await page.goto("/");
  await expect(page.getByText("브라우저 저장소 사용 불가")).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 확인하기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "손상 데이터 초기화" })).toHaveCount(0);
  expect(await page.evaluate(() => {
    (window as typeof window & { __restoreAllReads?: () => void }).__restoreAllReads?.();
    return localStorage.getItem("sajurium-saju-report");
  })).toBe(storedReport);
});

test("does not confuse an older report with the current onboarding result", async ({ page }) => {
  await page.evaluate((birth) => {
    localStorage.setItem("sajurium-saju-report", JSON.stringify({
      version: 1,
      savedAt: "2026-08-24T00:00:00.000Z",
      birth: { ...birth, displayName: "이전", birthDate: "1988-03-03", birthTime: "08:00" },
      topic: "love",
      feedback: "unclear",
    }));
  }, INITIAL_BIRTH);
  await page.reload();
  await page.getByRole("button", { name: "내 흐름 살펴보기" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page).toHaveURL(/\/report$/, { timeout: 5_000 });
  await page.goto("/report/save?topic=career&feedback=helpful");
  await expect(page.getByRole("button", { name: "이 기기에 결과 저장" })).toBeVisible();
  await page.getByRole("button", { name: "이 기기에 결과 저장" }).click();
  await expect(page.getByRole("heading", { name: "이 기기에 저장했어요" })).toBeVisible();
  expect(await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("sajurium-saju-report") ?? "null");
    return { displayName: saved?.birth?.displayName, topic: saved?.topic, feedback: saved?.feedback };
  })).toEqual({ displayName: "서연", topic: "career", feedback: "helpful" });
});
