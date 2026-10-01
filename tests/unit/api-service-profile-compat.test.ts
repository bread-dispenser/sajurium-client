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

const profileDetail = {
  id: 11, user_id: 1, nickname: "서연", is_self: true, birth_year: 1992, birth_month: 6, birth_day: 18,
  birth_time_hour: 14, birth_time_minute: 30, birth_time_unknown: false, calendar_type: "solar", is_leap_month: false,
  birth_location: "서울", gender_for_calculation: "female", consent_for_storing_others_info: false, created_at: "2026-09-01T00:00:00",
};

describe("profile edit service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    window.localStorage.clear();
    signIn();
  });

  const update = {
    nickname: "서연", birthYear: 1992, birthMonth: 6, birthDay: 19, birthTimeHour: 15, birthTimeMinute: 0,
    birthTimeUnknown: false, calendar: "solar" as const, leapMonth: false, birthLocation: "부산", gender: "female" as const,
  };

  it("reads the unmasked birth detail", async () => {
    mockApi([{ method: "GET", path: "/api/v1/profiles/11", respond: () => json(profileDetail) }]);
    const { getProfile } = await import("@/lib/api/service");
    await expect(getProfile("11")).resolves.toMatchObject({ id: "11", birthMonth: 6, birthTimeHour: 14, birthTimeMinute: 30, birthLocation: "서울", calendar: "solar", gender: "female" });
  });

  it("patches, calculates a new chart and moves the journey to a new report for my own profile", async () => {
    window.localStorage.setItem(JOURNEY_KEY, JSON.stringify({ profileId: "11", chartId: "22", reportId: "33" }));
    const { calls } = mockApi([
      { method: "PATCH", path: "/api/v1/profiles/11", respond: () => json({ ...profileDetail, birth_day: 19, birth_time_hour: 15, birth_time_minute: 0, birth_location: "부산" }) },
      { method: "POST", path: "/api/v1/profiles/11/chart", respond: () => json({ id: 23, profile_id: 11 }, 201) },
      { method: "POST", path: "/api/v1/charts/23/reports/basic", respond: () => json({ id: 34, chart_snapshot_id: 23 }, 201) },
    ]);
    const { readServerJourney, updateProfileBirth } = await import("@/lib/api/service");

    const result = await updateProfileBirth("11", update);

    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(["PATCH /api/v1/profiles/11", "POST /api/v1/profiles/11/chart", "POST /api/v1/charts/23/reports/basic"]);
    expect(calls[0].body).toEqual({
      nickname: "서연", birth_year: 1992, birth_month: 6, birth_day: 19, birth_time_unknown: false, birth_time_hour: 15, birth_time_minute: 0,
      calendar_type: "solar", is_leap_month: false, birth_location: "부산", gender_for_calculation: "female",
    });
    expect(result.journey).toEqual({ profileId: "11", chartId: "23", reportId: "34" });
    expect(readServerJourney()).toEqual({ profileId: "11", chartId: "23", reportId: "34" });
  });

  it("leaves the journey alone when another person's profile is edited, and clears the time when unknown", async () => {
    window.localStorage.setItem(JOURNEY_KEY, JSON.stringify({ profileId: "11", chartId: "22", reportId: "33" }));
    const { calls } = mockApi([
      { method: "PATCH", path: "/api/v1/profiles/12", respond: () => json({ ...profileDetail, id: 12, is_self: false, birth_time_unknown: true, birth_time_hour: null }) },
      { method: "POST", path: "/api/v1/profiles/12/chart", respond: () => json({ id: 50, profile_id: 12 }, 201) },
    ]);
    const { readServerJourney, updateProfileBirth } = await import("@/lib/api/service");

    const result = await updateProfileBirth("12", { ...update, birthTimeUnknown: true });

    expect(calls).toHaveLength(2);
    expect(calls[0].body).toMatchObject({ birth_time_unknown: true, birth_time_hour: null, birth_time_minute: null });
    expect(result).toMatchObject({ chartId: "50", journey: null });
    expect(readServerJourney()).toEqual({ profileId: "11", chartId: "22", reportId: "33" });
  });
});

describe("compatibility service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    window.localStorage.clear();
    signIn();
  });

  it("reads a stored result with both snapshots and the locked section titles", async () => {
    mockApi([{
      method: "GET", path: "/api/v1/compatibilities/5", respond: () => json({
        id: 5, user_id: 1, profile_a_id: 11, profile_b_id: 12, snapshot_a_id: 22, snapshot_b_id: 50, relation_type: "friend",
        generation_status: "READY", requires_payment: true, purchased: false, created_at: "2026-09-28T00:00:00",
        result: { free_preview: { score: 40, summary: "요약", limited_by_unknown_time: true }, paid_detail: { sections: [{ title: "관계 유형별 분석", locked: true }, { title: "소통 패턴 분석", locked: true }] } },
      }),
    }]);
    const { getCompatibility } = await import("@/lib/api/service");

    const result = await getCompatibility("5");
    expect(result).toEqual({
      id: "5", relation: "friend", summary: "요약", limitedByUnknownTime: true, profileAId: "11", profileBId: "12", snapshotAId: "22", snapshotBId: "50",
      status: "READY", lockedSections: ["관계 유형별 분석", "소통 패턴 분석"], createdAt: "2026-09-28T00:00:00Z",
    });
    expect(result).not.toHaveProperty("score");
  });

  it("surfaces a missing result as a 404", async () => {
    mockApi([{ method: "GET", path: "/api/v1/compatibilities/9", respond: () => json({ code: "COMPATIBILITY_NOT_FOUND", message: "궁합 결과를 찾을 수 없습니다." }, 404) }]);
    const { getCompatibility } = await import("@/lib/api/service");
    await expect(getCompatibility("9")).rejects.toMatchObject({ status: 404 });
  });
});
