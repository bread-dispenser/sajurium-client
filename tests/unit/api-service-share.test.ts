import { beforeEach, describe, expect, it, vi } from "vitest";

const AUTH_KEY = "sajurium.sasaju-auth.v1";
const JOURNEY_KEY = "sajurium.server-journey.v1";

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

describe("share link service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    window.localStorage.clear();
    signIn();
    window.localStorage.setItem(JOURNEY_KEY, JSON.stringify({ profileId: "11", chartId: "22", reportId: "33" }));
  });

  it("sends the chosen include list in the server's order and defaults to the three safe items", async () => {
    const { calls } = mockApi([{ method: "POST", path: "/api/v1/share-links", respond: (body) => json({ id: 1, target_type: "report", target_id: 33, share_url: "/api/v1/shared/abc", include: (body as { include: string[] }).include, expires_at: "2026-10-01T00:00:00", is_active: true, access_count: 0, created_at: "2026-09-28T00:00:00" }, 201) }]);
    const { createReportShare } = await import("@/lib/api/service");

    await createReportShare(24, ["birth_time", "summary"]);
    await createReportShare();

    expect(calls[0].body).toEqual({ target_type: "report", target_id: 33, expires_in_hours: 24, include: ["summary", "birth_time"] });
    expect(calls[1].body).toEqual({ target_type: "report", target_id: 33, expires_in_hours: 72, include: ["summary", "day_pillar", "five_elements"] });
  });

  it("creates a compatibility link with summary and dimensions only, defaulting to both", async () => {
    const { calls } = mockApi([{ method: "POST", path: "/api/v1/share-links", respond: (body) => json({ id: 2, target_type: "compatibility", target_id: 5, share_url: "/api/v1/shared/xyz", include: (body as { include: string[] }).include, expires_at: "2026-10-08T00:00:00", is_active: true, access_count: 0, created_at: "2026-10-01T00:00:00" }, 201) }]);
    const { createCompatibilityShare } = await import("@/lib/api/service");

    await createCompatibilityShare("5", 168, ["dimensions", "birth_date", "summary"]);
    await createCompatibilityShare("5");
    await createCompatibilityShare("5", 24, ["dimensions"]);

    expect(calls.map((call) => call.body)).toEqual([
      { target_type: "compatibility", target_id: 5, expires_in_hours: 168, include: ["summary", "dimensions"] },
      { target_type: "compatibility", target_id: 5, expires_in_hours: 72, include: ["summary", "dimensions"] },
      { target_type: "compatibility", target_id: 5, expires_in_hours: 24, include: ["dimensions"] },
    ]);
  });

  it("never sends compatibility keys on a report link", async () => {
    const { calls } = mockApi([{ method: "POST", path: "/api/v1/share-links", respond: () => json({ id: 1, target_type: "report", target_id: 33, share_url: "/api/v1/shared/abc", include: ["summary"], expires_at: "2026-10-01T00:00:00", is_active: true, access_count: 0, created_at: "2026-09-28T00:00:00" }, 201) }]);
    const { createReportShare } = await import("@/lib/api/service");
    await createReportShare(72, ["summary", "dimensions"]);
    expect(calls[0].body).toEqual({ target_type: "report", target_id: 33, expires_in_hours: 72, include: ["summary"] });
  });

  it("refuses an empty selection before calling the server", async () => {
    const { fetchMock } = mockApi([]);
    const { createReportShare } = await import("@/lib/api/service");
    await expect(createReportShare(72, [])).rejects.toThrow("하나 이상");
    const { createCompatibilityShare } = await import("@/lib/api/service");
    await expect(createCompatibilityShare("5", 72, ["birth_date"])).rejects.toThrow("하나 이상");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
