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

describe("feedback service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    window.localStorage.clear();
    signIn();
  });

  it("maps every screen rating to its own server value and lets a report win", async () => {
    const { serverFeedbackRating } = await import("@/lib/api/service");
    expect(serverFeedbackRating("helpful", false)).toBe("helpful");
    expect(serverFeedbackRating("unclear", false)).toBe("unclear");
    expect(serverFeedbackRating("wrong", false)).toBe("inaccurate");
    expect(serverFeedbackRating("helpful", true)).toBe("reported");
  });

  it("sends a report target with the reason and comment, and a consultation message target", async () => {
    const { calls } = mockApi([{ method: "POST", path: "/api/v1/feedback", respond: () => json({ id: 1, status: "RECEIVED", created_at: "2026-09-28T00:00:00" }, 201) }]);
    const { submitFeedback } = await import("@/lib/api/service");

    await submitFeedback({ type: "report", reportId: "303" }, { rating: "wrong", reason: "사주 정보가 잘못됐어요", comment: " 시간이 달라요 " });
    await submitFeedback({ type: "consultation_message", messageId: "42" }, { rating: "helpful" });
    await submitFeedback({ type: "consultation_message", messageId: "42" }, { rating: "unclear", reported: true, reason: "표현이 불쾌하거나 과해요" });

    expect(calls.map((call) => call.body)).toEqual([
      { report_id: 303, rating: "inaccurate", detail_reason: "사주 정보가 잘못됐어요\n시간이 달라요", report_reason: null },
      { consultation_message_id: 42, rating: "helpful", detail_reason: null, report_reason: null },
      { consultation_message_id: 42, rating: "reported", detail_reason: "표현이 불쾌하거나 과해요", report_reason: "표현이 불쾌하거나 과해요" },
    ]);
  });

  it("lists my feedback with target, status and UTC dates", async () => {
    mockApi([{
      method: "GET", path: "/api/v1/feedback?limit=100", respond: () => json([
        { id: 3, target_type: "consultation", target_title: "이직 고민", report_id: null, consultation_message_id: 9, consultation_session_id: 4, rating: "reported", detail_reason: null, report_reason: "부적절한 표현", status: "REVIEWING", created_at: "2026-09-28T06:00:00" },
        { id: 2, target_type: "report", target_title: null, report_id: 1, rating: "helpful", status: "RECEIVED", created_at: "2026-09-27T06:00:00" },
      ]),
    }]);
    const { listFeedback } = await import("@/lib/api/service");

    const items = await listFeedback();
    expect(items[0]).toMatchObject({ id: "3", targetType: "consultation", targetTitle: "이직 고민", consultationSessionId: "4", rating: "reported", reportReason: "부적절한 표현", status: "REVIEWING", createdAt: "2026-09-28T06:00:00Z" });
    expect(items[1]).toMatchObject({ id: "2", targetType: "report", targetTitle: null, reportId: "1", status: "RECEIVED" });
  });
});
