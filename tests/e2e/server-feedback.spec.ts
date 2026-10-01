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

test("sends refined report feedback and lists it with the server status", async ({ page, request }) => {
  await createServerReport(page, "피드백 확인");
  const { token, journey } = await session(page);
  await page.goto(`/report/feedback?targetType=report&reportId=${journey.reportId}&topic=career`);
  await expect(page.getByText("기본 사주 리포트")).toBeVisible();
  await page.getByRole("button", { name: "맞지 않아요" }).click();
  await page.getByRole("button", { name: "사주 정보가 잘못됐어요" }).click();
  await page.getByLabel(/더 알려주실 내용/).fill("태어난 시간이 달라요");
  await page.getByRole("button", { name: "피드백 보내기" }).click();

  await expect(page).toHaveURL(/\/settings\/feedback\?sent=1$/);
  await expect(page.getByRole("status")).toContainText("피드백을 보냈어요");
  const row = page.getByRole("region", { name: "보낸 기록 1개" }).getByRole("listitem");
  await expect(row).toContainText("리포트, 기본 사주 리포트");
  await expect(row).toContainText("틀린 것 같아요");
  await expect(row).toContainText("사주 정보가 잘못됐어요");
  await expect(row).toContainText("태어난 시간이 달라요");
  await expect(row).toContainText("접수했어요");

  const listed = (await api(request, token, "/feedback")).body as Array<{ rating: string; report_id: number; status: string }>;
  expect(listed).toHaveLength(1);
  expect(listed[0]).toMatchObject({ rating: "inaccurate", report_id: Number(journey.reportId), status: "RECEIVED" });
  expect(await page.evaluate(() => localStorage.getItem("sajurium-feedback-list"))).toBeNull();
});

test("rates a consultation answer inline and reports it through the full form", async ({ page, request }) => {
  await createServerReport(page, "상담 평가");
  const { token } = await session(page);
  await page.goto("/consult/new");
  await page.getByRole("button", { name: "이직을 고민할 때 어떤 조건을 먼저 봐야 하나요?" }).click();
  await page.getByLabel("현재 상황").fill("업무 역할과 근무 방식이 고민됩니다.");
  await page.getByRole("button", { name: "질문 보내기" }).click();
  await expect(page).toHaveURL(/\/consult\/session\/\d+$/, { timeout: 30_000 });
  await expect(page.locator(".sj-chat > *")).toHaveCount(2);

  const rating = page.getByRole("group", { name: "이 답변 평가" });
  await rating.getByRole("button", { name: "도움됐어요" }).click();
  await expect(page.locator(".sj-answer").getByRole("status")).toContainText("의견을 보냈어요");
  await expect(rating.getByRole("button", { name: "도움됐어요" })).toHaveAttribute("aria-pressed", "true");

  await rating.getByRole("link", { name: "문제 신고" }).click();
  await expect(page).toHaveURL(/\/report\/feedback\?targetType=consultation&sessionId=\d+&messageId=\d+/);
  await expect(page.getByText("상담 답변")).toBeVisible();
  await expect(page.getByLabel(/문제가 있는 표현으로 신고하기/)).toBeChecked();
  await page.getByRole("button", { name: "조금 애매해요" }).click();
  await page.getByRole("button", { name: "표현이 불쾌하거나 과해요" }).click();
  await page.getByRole("button", { name: "피드백 보내기" }).click();

  await expect(page).toHaveURL(/\/settings\/feedback\?sent=1$/);
  const rows = page.getByRole("region", { name: "보낸 기록 2개" }).getByRole("listitem");
  await expect(rows.filter({ hasText: "신고" }).first()).toContainText("표현이 불쾌하거나 과해요");
  await expect(rows.filter({ hasText: "도움됐어요" })).toHaveCount(1);
  await expect(rows.first()).toContainText(/^상담, /);

  const listed = (await api(request, token, "/feedback")).body as Array<{ target_type: string; rating: string; consultation_message_id: number | null }>;
  expect(listed.map((item) => [item.target_type, item.rating])).toEqual([["consultation", "reported"], ["consultation", "helpful"]]);
  expect(listed.every((item) => typeof item.consultation_message_id === "number")).toBe(true);
});
