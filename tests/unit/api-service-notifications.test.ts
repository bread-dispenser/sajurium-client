import { beforeEach, describe, expect, it, vi } from "vitest";

const AUTH_KEY = "sajurium.sasaju-auth.v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Route = { method: string; path: string; respond: (body: unknown) => Response };

/** Answers fetches by method and path, records each call with its parsed body. */
function mockApi(routes: Route[]) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: url.pathname + url.search, body });
    const route = routes.find((candidate) => candidate.method === method && candidate.path === url.pathname + url.search);
    return route ? route.respond(body) : json({ code: "NOT_FOUND", message: `no route ${method} ${url.pathname}` }, 404);
  });
  return { calls, fetchMock };
}

function signIn() {
  window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
}

const notification = { id: 7, topic: "report_ready", title: "리포트가 준비됐어요", status: "SENT", is_marketing: false, read_at: null, created_at: "2026-09-28T00:00:00" };

describe("notification inbox service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("answers zero without any request when no session is stored", async () => {
    const { fetchMock } = mockApi([]);
    const { getUnreadNotificationCount } = await import("@/lib/api/service");
    await expect(getUnreadNotificationCount()).resolves.toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the unread count, marks one read and marks all read", async () => {
    signIn();
    const { calls } = mockApi([
      { method: "GET", path: "/api/v1/notifications/unread-count", respond: () => json({ unread_count: 3 }) },
      { method: "POST", path: "/api/v1/notifications/7/read", respond: () => json({ ...notification, read_at: "2026-09-28T01:00:00" }) },
      { method: "POST", path: "/api/v1/notifications/read-all", respond: () => json({ updated_count: 2, unread_count: 0 }) },
    ]);
    const { getUnreadNotificationCount, markAllNotificationsRead, markNotificationRead } = await import("@/lib/api/service");

    await expect(getUnreadNotificationCount()).resolves.toBe(3);
    await expect(markNotificationRead(7)).resolves.toMatchObject({ id: 7, read_at: "2026-09-28T01:00:00" });
    await expect(markAllNotificationsRead()).resolves.toEqual({ updatedCount: 2, unreadCount: 0 });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /api/v1/notifications/unread-count",
      "POST /api/v1/notifications/7/read",
      "POST /api/v1/notifications/read-all",
    ]);
  });
});
