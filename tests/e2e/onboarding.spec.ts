import { expect, test } from "@playwright/test";
import { INITIAL_BIRTH } from "@/lib/fixtures";
import { submitBirth } from "./birth-helpers";

const START_LINK = { name: "내 명식 계산하기" } as const;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
});

test("completes routed onboarding and stores the local report", async ({ page }) => {
  await page.getByRole("link", START_LINK).click();
  await expect(page).toHaveURL(/\/birth$/);
  await submitBirth(page);
  await expect(page).toHaveURL(/\/report$/, { timeout: 5_000 });
  await expect(page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link")).toHaveCount(5);

  await page.getByRole("link", { name: /관심 주제로 더 보기/ }).click();
  await expect(page).toHaveURL(/\/report\/topics$/);
  await page.getByRole("link", { name: /^커리어/ }).click();
  await expect(page).toHaveURL(/\/report\/topics\/career$/);
  await page.getByRole("link", { name: "도움됐어요" }).click();
  await expect(page).toHaveURL(/\/report\/feedback\?/);
  await page.getByRole("button", { name: "도움이 됐어요" }).click();
  await expect(page.getByRole("button", { name: "도움이 됐어요" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "내용이 너무 일반적이에요" }).click();
  await page.getByRole("button", { name: "피드백 보내기" }).click();
  await expect(page).toHaveURL(/\/report\/save\?topic=career&feedback=helpful$/);
  await page.getByRole("button", { name: "이 기기에 결과 저장" }).click();

  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem("sajurium-saju-report")))).toBe(true);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "이 기기에 저장한 결과 이어보기" })).toBeVisible();
});

test("recovers from the explicit one-time calculation failure", async ({ page }) => {
  await page.goto("/?calculation=fail");
  await expect(page.getByRole("link", START_LINK)).toHaveAttribute("href", "/birth?calculation=fail");
  await page.getByRole("link", START_LINK).click();
  await submitBirth(page);
  await expect(page.getByRole("heading", { name: "결과를 불러오지 못했어요" })).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "다시 계산하기" }).click();
  await expect(page).toHaveURL(/\/report$/, { timeout: 5_000 });
});

test("supports keyboard-only entry into the birth flow", async ({ page }) => {
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(() => document.activeElement?.textContent?.trim());
    if (label === "내 명식 계산하기") break;
  }
  await expect(page.getByRole("link", START_LINK)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/birth$/);
});

test("continues without persistently saving birth data", async ({ page }) => {
  await page.getByRole("link", START_LINK).click();
  await submitBirth(page);
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
  await expect(page.getByRole("link", START_LINK)).toHaveCount(0);
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
  await expect(page.getByText(/저장소 접근이 차단되어 데이터를 확인할 수 없어요/)).toBeVisible();
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
  await page.getByRole("link", START_LINK).click();
  await submitBirth(page);
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

test("keeps ordering unavailable after calculation while payments are paused", async ({ page }) => {
  await page.getByRole("link", START_LINK).click();
  await submitBirth(page);
  await expect(page).toHaveURL(/\/report$/, { timeout: 5_000 });
  await page.goto("/checkout/consult-5");
  await expect(page.getByRole("status")).toContainText("결제와 주문은 준비 중이에요");
  await page.getByLabel("주문 내용과 환불 규정을 확인했고, 결제에 동의해요.").check();
  await expect(page.getByRole("button", { name: /결제하기/ })).toBeDisabled();
});

test("creates a real consultation response from the persisted chart", async ({ page }) => {
  await page.getByRole("link", START_LINK).click();
  await submitBirth(page);
  await expect(page).toHaveURL(/\/report$/, { timeout: 5_000 });
  await page.goto("/consult/new?topic=career");
  await page.getByRole("button", { name: /이직을 고민할 때/ }).click();
  await page.getByRole("button", { name: "질문 보내기" }).click();
  // 실제 LLM을 쓰면 왕복이 수 초 걸린다(템플릿 생성기는 즉시). 5초는 그 구성에서 너무 짧다.
  await expect(page).toHaveURL(/\/consult\/session\/\d+$/, { timeout: 30_000 });
  // 제공자마다 문구가 다르므로 특정 문장이 아니라 "보조 메시지가 비어 있지 않다"를 확인한다.
  await expect(page.locator("article.sj-answer p").first()).not.toBeEmpty();
});

test("lists server profiles in people storage and requires two profiles for compatibility", async ({ page }) => {
  await page.getByRole("link", START_LINK).click();
  await submitBirth(page);
  await expect(page).toHaveURL(/\/report$/);
  await page.goto("/people");
  await expect(page.getByRole("heading", { name: "저장한 사람", exact: true })).toBeVisible();
  await expect(page.getByText("서연")).toBeVisible();
  await page.goto("/compatibility");
  await expect(page.getByRole("heading", { name: "두 사람 이상 필요해요" })).toBeVisible();
});

test("stores a second person on the server and creates a compatibility result", async ({ page }) => {
  await page.getByRole("link", START_LINK).click();
  await submitBirth(page);
  await expect(page).toHaveURL(/\/report$/);
  await page.goto("/people/new");
  await page.getByLabel("이름 또는 별칭").fill("민준");
  await page.getByLabel("태어난 해").fill("1991");
  await page.getByLabel("태어난 달").fill("1");
  await page.getByLabel("태어난 날").fill("1");
  await page.getByLabel("출생지").fill("부산");
  await page.getByLabel("민준님의 동의를 받았거나 이 정보를 저장할 권한이 있어요 (필수)").check();
  await page.getByRole("button", { name: "사람 저장하기" }).click();
  await expect(page).toHaveURL(/\/people$/);
  await expect(page.getByText("민준")).toBeVisible();
  await page.goto("/compatibility");
  await page.getByRole("button", { name: "궁합 보기" }).click();
  await expect(page).toHaveURL(/\/compatibility\/result\/\d+$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "관계 요약" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "서연님과 민준님" })).toBeVisible();
  // 결과는 서버에 저장돼 있어서, 새로 열어도 같은 결과를 서버에서 다시 읽는다.
  await page.reload();
  await expect(page.getByRole("heading", { name: "관계 요약" })).toBeVisible();
  await expect(page.getByText("연인 관계로 봤어요")).toBeVisible();
});

test("renders today flow from the persisted server profile", async ({ page }) => {
  await page.getByRole("link", START_LINK).click();
  await submitBirth(page);
  await expect(page).toHaveURL(/\/report$/);
  await page.goto("/flow/today");
  await expect(page.getByText("서버에 저장된 명식과 기간 기준으로 생성한 결과예요.")).toBeVisible();
});

test("registers an account and migrates the current anonymous profile", async ({ page }) => {
  const email = `sajurium-e2e-${Date.now()}@example.com`;
  await page.getByRole("link", START_LINK).click();
  await submitBirth(page);
  await expect(page).toHaveURL(/\/report$/);
  await expect.poll(() => page.evaluate(() => {
    const auth = JSON.parse(localStorage.getItem("sajurium.sasaju-auth.v1") ?? "null");
    return typeof auth?.anonymousToken === "string" && auth.anonymousToken.length > 0;
  })).toBe(true);

  await page.goto("/login");
  await page.getByRole("tab", { name: "계정 만들기" }).click();
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("이름").fill("테스트 사용자");
  await page.getByLabel("비밀번호").fill("Passw0rd!234");
  await page.getByRole("button", { name: "계정 만들기" }).click();
  await expect(page.getByRole("status")).toContainText("익명 데이터를 계정으로 옮겼어요");
  await expect.poll(() => page.evaluate(() => {
    const auth = JSON.parse(localStorage.getItem("sajurium.sasaju-auth.v1") ?? "null");
    return { hasAccessToken: typeof auth?.accessToken === "string", anonymousToken: auth?.anonymousToken ?? null };
  })).toEqual({ hasAccessToken: true, anonymousToken: null });

  await page.goto("/people");
  await expect(page.getByRole("heading", { name: "저장한 사람", exact: true })).toBeVisible();
  await expect(page.getByText("서연")).toBeVisible();

  await page.goto("/account");
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page.getByRole("status")).toContainText("로그아웃됐어요");
  await expect.poll(() => page.evaluate(() => ({
    auth: localStorage.getItem("sajurium.sasaju-auth.v1"),
    journey: localStorage.getItem("sajurium.server-journey.v1"),
  }))).toEqual({ auth: null, journey: null });

  await page.goto("/people");
  await expect(page.getByRole("heading", { name: "저장한 사람이 없어요" })).toBeVisible();
});
