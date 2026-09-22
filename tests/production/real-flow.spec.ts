import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

const API = "https://sajurium-api.justn.me/api/v1";

test("public journey uses the real provider and migrates account data", async ({ page, request }) => {
  const email = `sajurium-qa-${Date.now()}@example.com`;
  const password = `Qa!${randomBytes(12).toString("hex")}`;
  let anonymousToken: string | null = null;
  let accountToken: string | null = null;

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "내 흐름 살펴보기" }).click();
    await page.getByLabel("이름 또는 닉네임").fill("운영 검증용");
    await page.getByLabel("생년월일").fill("1992-06-18");
    await page.getByLabel("출생지").fill("서울");
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page).toHaveURL(/\/report$/, { timeout: 30_000 });
    anonymousToken = await page.evaluate(() => {
      const session = JSON.parse(localStorage.getItem("sajurium.sasaju-auth.v1") ?? "null");
      return typeof session?.accessToken === "string" ? session.accessToken : null;
    });
    expect(anonymousToken).toBeTruthy();

    await page.goto("/flow/today");
    await expect(page.getByText("서버에 저장된 명식과 기간 기준으로 생성한 결과예요.")).toBeVisible();

    await page.goto("/consult/new?topic=career");
    await page.getByRole("button", { name: /이직을 고민할 때/ }).click();
    await page.getByRole("button", { name: "상담 답변 보기" }).click();
    await expect(page).toHaveURL(/\/consult\/session\/\d+$/, { timeout: 120_000 });
    await expect(page.locator("article.assistant p").first()).not.toBeEmpty();
    const sessionId = page.url().split("/").at(-1);

    const detailResponse = await request.get(`${API}/consultations/${sessionId}`, {
      headers: { Authorization: `Bearer ${anonymousToken}` },
    });
    expect(detailResponse.status()).toBe(200);
    const detail = await detailResponse.json();
    const answer = detail.messages.find((message: { role: string }) => message.role === "assistant");
    expect(answer?.content?.length).toBeGreaterThan(30);
    expect(answer?.model_version).toBeTruthy();
    expect(answer.model_version).not.toBe("template-saju-v1");
    expect(answer?.safety_flags?.passed).toBe(true);

    const creditResponse = await request.get(`${API}/credits`, {
      headers: { Authorization: `Bearer ${anonymousToken}` },
    });
    expect(creditResponse.status()).toBe(200);
    expect((await creditResponse.json()).balance).toBe(0);

    await page.goto("/login");
    await page.getByRole("button", { name: "계정 만들기" }).click();
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("이름").fill("운영 검증용");
    await page.getByLabel("비밀번호").fill(password);
    await page.getByRole("button", { name: "계정 만들기" }).click();
    await expect(page.getByRole("status")).toContainText("익명 데이터를 계정으로 옮겼어요", { timeout: 30_000 });
    accountToken = await page.evaluate(() => {
      const session = JSON.parse(localStorage.getItem("sajurium.sasaju-auth.v1") ?? "null");
      return typeof session?.accessToken === "string" ? session.accessToken : null;
    });
    expect(accountToken).toBeTruthy();
    await page.goto("/people");
    await expect(page.getByText("운영 검증용")).toBeVisible();

    await page.goto("/account");
    await page.getByRole("button", { name: "로그아웃" }).click();
    await page.goto("/login");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(password);
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("로그인", { timeout: 30_000 });
    await page.goto("/people");
    await expect(page.getByText("운영 검증용")).toBeVisible();

    console.log("Production flow passed: report, flow, real LLM, credit, anonymous migration, email login.");
  } finally {
    for (const token of accountToken ? [accountToken] : [anonymousToken]) {
      if (!token) continue;
      const response = await request.delete(`${API}/auth/account`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { reason: "synthetic production verification cleanup" },
      });
      expect(response.status()).toBe(200);
      expect((await response.json()).status).toBe("DELETED");
    }
  }
});

test("public report branches, sharing, and notification settings work", async ({ page, request }) => {
  let token: string | null = null;
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "내 흐름 살펴보기" }).click();
    await page.getByLabel("이름 또는 닉네임").fill("운영 분기 검증용");
    await page.getByLabel("생년월일").fill("1992-06-18");
    await page.getByLabel("출생지").fill("서울");
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page).toHaveURL(/\/report$/, { timeout: 30_000 });
    token = await page.evaluate(() => {
      const session = JSON.parse(localStorage.getItem("sajurium.sasaju-auth.v1") ?? "null");
      return typeof session?.accessToken === "string" ? session.accessToken : null;
    });
    expect(token).toBeTruthy();

    await page.goto("/reports/year");
    await expect(page.getByRole("heading", { name: "올해 흐름" })).toBeVisible();
    await page.goto("/flow/month");
    await expect(page.getByText(/서버에 저장된 명식과 기간 기준/)).toBeVisible();

    await page.goto("/people/new");
    await page.getByLabel("이름 또는 별칭").fill("검증용 상대");
    await page.getByLabel("생년월일").fill("1991-01-01");
    await page.getByLabel("출생지").fill("부산");
    await page.getByLabel("이 정보를 저장할 권한이나 상대방의 동의를 확인했어요").check();
    await page.getByRole("button", { name: "인물 저장" }).click();
    await expect(page).toHaveURL(/\/people$/);
    await page.goto("/compatibility");
    await page.getByRole("button", { name: "실제 궁합 계산하기" }).click();
    await expect(page.getByRole("heading", { name: "관계 요약" })).toBeVisible();

    await page.goto("/share/links");
    await page.getByRole("button", { name: "현재 리포트 공유 링크 만들기" }).click();
    const activeLink = page.locator(".signal-row").filter({ hasText: "활성 링크" }).first();
    await expect(activeLink).toBeVisible();
    await activeLink.getByRole("button", { name: "비활성화" }).click();
    await expect(page.locator(".signal-row").filter({ hasText: "비활성 링크" }).first()).toBeVisible();

    const started = Date.now();
    const loadedPreferences = page.waitForResponse(
      (response) => response.url().includes("/api/v1/notification-preferences"),
      { timeout: 45_000 },
    );
    await page.goto("/notifications");
    const preferenceResponse = await loadedPreferences;
    console.log("Notification preferences response:", preferenceResponse.status(), "latency_ms:", Date.now() - started);
    expect(preferenceResponse.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "받고 싶은 소식" })).toBeVisible();
    const firstPreference = page.locator('input[type="checkbox"]').first();
    const before = await firstPreference.isChecked();
    await firstPreference.setChecked(!before);
    await page.reload();
    await expect(page.locator('input[type="checkbox"]').first()).toBeChecked({ checked: !before });
    console.log("Production branches passed: annual/monthly flow, compatibility, share, preferences.");
  } finally {
    if (token) {
      const response = await request.delete(`${API}/auth/account`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { reason: "synthetic production verification cleanup" },
      });
      expect(response.status()).toBe(200);
      expect((await response.json()).status).toBe("DELETED");
    }
  }
});

test("account deletion finishes and clears the browser session", async ({ page, request }) => {
  const email = `sajurium-delete-${Date.now()}@example.com`;
  const password = `Qa!${randomBytes(12).toString("hex")}`;
  const registered = await request.post(`${API}/auth/register`, { data: { email, password } });
  expect(registered.status()).toBe(201);
  const login = await request.post(`${API}/auth/login/access-token`, {
    form: { username: email, password },
  });
  expect(login.status()).toBe(200);
  const token = (await login.json()).access_token as string;
  let deleted = false;
  try {
    await page.goto("/");
    await page.evaluate((accessToken) => {
      localStorage.setItem("sajurium.sasaju-auth.v1", JSON.stringify({
        kind: "account", accessToken, anonymousToken: null,
      }));
      localStorage.setItem("sajurium.server-journey.v1", JSON.stringify({ profileId: "1", chartId: "1", reportId: "1" }));
    }, token);
    await page.goto("/account");
    await page.getByRole("button", { name: "계정 삭제 요청" }).click();
    await expect(page.getByRole("status")).toContainText("서버 계정 데이터 삭제가 완료됐어요", { timeout: 30_000 });
    expect(await page.evaluate(() => localStorage.getItem("sajurium.sasaju-auth.v1"))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("sajurium.server-journey.v1"))).toBeNull();
    deleted = true;
    const rejected = await request.post(`${API}/auth/login/access-token`, { form: { username: email, password } });
    expect(rejected.status()).toBe(401);
  } finally {
    if (!deleted) {
      await request.delete(`${API}/auth/account`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { reason: "synthetic production verification cleanup" },
      });
    }
  }
});

test("notification settings recover after a browser request fails", async ({ page, request }) => {
  const session = await request.post(`${API}/auth/anonymous`);
  expect(session.status()).toBe(201);
  const token = (await session.json()).access_token as string;
  try {
    await page.goto("/");
    await page.evaluate((accessToken) => {
      localStorage.setItem("sajurium.sasaju-auth.v1", JSON.stringify({
        kind: "anonymous", accessToken, anonymousToken: null,
      }));
    }, token);
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
  } finally {
    const response = await request.delete(`${API}/auth/account`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { reason: "synthetic production verification cleanup" },
    });
    expect(response.status()).toBe(200);
  }
});
