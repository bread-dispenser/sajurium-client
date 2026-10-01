import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServerReport } from "./birth-helpers";

// Every test here talks to the real backend that `build:integration` points at.
const API = process.env.SAJURIUM_E2E_API_URL ?? "http://localhost:8000";
// The inbox has no public "create notification" endpoint, so notification rows are seeded straight
// into the local backend's SQLite database when it is reachable. Elsewhere that test is skipped.
const BACKEND_DB = process.env.SAJURIUM_E2E_DB ?? "/tmp/claude-0/sasaju-e2e.db";

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

function seedNotifications(userId: string, rows: Array<{ topic: string; title: string; body?: string; deepLink?: string | null }>) {
  const script = `
import sqlite3, sys, json, uuid, datetime
db, user_id, rows = sys.argv[1], int(sys.argv[2]), json.loads(sys.argv[3])
now = datetime.datetime.utcnow().isoformat(sep=" ")
con = sqlite3.connect(db, timeout=10)
for row in rows:
    con.execute(
        "insert into notification_deliveries (user_id, topic, title, body, deep_link, status, is_marketing, dedupe_key, scheduled_at, sent_at, created_at) values (?, ?, ?, ?, ?, 'SENT', 0, ?, ?, ?, ?)",
        (user_id, row["topic"], row["title"], row.get("body"), row.get("deepLink"), uuid.uuid4().hex, now, now, now),
    )
con.commit()
`;
  execFileSync("python3", ["-c", script, BACKEND_DB, userId, JSON.stringify(rows)]);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test("shows an empty inbox and a bell without a badge for a new session", async ({ page, request }) => {
  await createServerReport(page, "알림 확인");
  const { token } = await session(page);
  expect((await api(request, token, "/notifications/unread-count")).body).toEqual({ unread_count: 0 });
  await page.goto("/home");
  await expect(page.getByRole("link", { name: "알림", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /읽지 않은 알림/ })).toHaveCount(0);
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "아직 받은 알림이 없어요" })).toBeVisible();
});

test("marks server notifications read one by one and all at once", async ({ page, request }) => {
  test.skip(!existsSync(BACKEND_DB), "notification rows can only be seeded into the local backend database");
  await createServerReport(page, "알림 확인");
  const { token, userId } = await session(page);
  seedNotifications(userId, [
    { topic: "daily_flow", title: "오늘의 흐름이 열렸어요", body: "하던 일을 매듭짓기 좋은 날이에요." },
    { topic: "report_ready", title: "기본 사주 리포트가 준비됐어요", deepLink: "/report" },
    { topic: "daily_flow", title: "어제의 흐름이에요" },
  ]);

  await page.goto("/home");
  const bell = page.getByRole("link", { name: "알림, 읽지 않은 알림 3개" }).first();
  await expect(bell).toBeVisible();
  await expect(bell).toContainText("3");

  await page.goto("/notifications");
  await expect(page.getByRole("region", { name: "읽지 않음 3개" })).toBeVisible();
  await page.getByRole("button", { name: /오늘의 흐름이 열렸어요/ }).click();
  await expect(page.getByRole("region", { name: "읽지 않음 2개" })).toBeVisible();
  await expect(page.getByRole("region", { name: "읽음" }).getByText("오늘의 흐름이 열렸어요")).toBeVisible();
  // 데스크톱 헤더의 벨은 알림함에서도 보이고, 읽음 처리를 바로 따라간다.
  await expect(page.getByRole("link", { name: "알림, 읽지 않은 알림 2개" }).first()).toBeVisible();
  expect((await api(request, token, "/notifications/unread-count")).body).toEqual({ unread_count: 2 });

  await page.getByRole("button", { name: "모두 읽음" }).click();
  await expect(page.getByRole("status")).toContainText("알림을 모두 읽음으로 표시했어요");
  await expect(page.getByRole("region", { name: /읽지 않음/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /읽지 않은 알림/ })).toHaveCount(0);
  expect((await api(request, token, "/notifications/unread-count")).body).toEqual({ unread_count: 0 });

  await page.reload();
  await expect(page.getByRole("region", { name: "읽음" }).getByRole("link", { name: /기본 사주 리포트가 준비됐어요/ })).toHaveAttribute("href", "/report");
});
