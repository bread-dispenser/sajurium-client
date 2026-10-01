import { beforeEach, describe, expect, it, vi } from "vitest";

const AUTH_KEY = "sajurium.sasaju-auth.v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function mockApi(respond: (method: string, path: string) => Response) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, path: url.pathname, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    return respond(method, url.pathname);
  });
  return calls;
}

const CURRENT = {
  sequence: 4, ganji: "임인", start_age: 34, end_age: 43, start_year: 2026, end_year: 2035,
  stem_ten_god: "정인", branch_ten_god: "겁재", is_current: true, evidence: ["임인 대운", "대운 천간 임 정인"],
};

function report(overrides: Record<string, unknown>) {
  return {
    id: 71, user_id: 1, chart_snapshot_id: 22, report_type: "love", period_key: "2026", title: "연애 리포트", content: "",
    generation_status: "READY", is_free_section: true, requires_payment: true, purchased: false, is_hidden: false,
    created_at: "2026-09-28T00:00:00Z",
    ...overrides,
  };
}

describe("topic and decade report service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
  });

  it("getTopicReport posts to the chart's topic endpoint and keeps free bodies with their evidence", async () => {
    const calls = mockApi(() => json(report({
      content_json: {
        topic: "love", reference_year: 2026, excluded_due_to_unknown_time: false, excluded_sections: [], current_period: CURRENT,
        sections: [
          { key: "love_strength", title: "강점", body: "관계를 현실적으로 챙겨요.", is_free: true, locked: false, evidence: ["일지 편재", "시지 편재"], requires_birth_time: false },
          { key: "love_pattern", title: "관계에서 반복되는 패턴", body: null, is_free: false, locked: true, evidence: [], requires_birth_time: false },
        ],
      },
    }), 201));
    const { getTopicReport } = await import("@/lib/api/service");

    const result = await getTopicReport("22", "love");

    expect(calls).toEqual([{ method: "POST", path: "/api/v1/charts/22/reports/topics/love", body: {} }]);
    expect(result).toMatchObject({ id: "71", topic: "love", title: "연애 리포트", referenceYear: 2026, excludedDueToUnknownTime: false });
    expect(result.sections[0]).toEqual({ key: "love_strength", title: "강점", body: "관계를 현실적으로 챙겨요.", isFree: true, locked: false, evidence: ["일지 편재", "시지 편재"], requiresBirthTime: false });
    expect(result.sections[1]).toMatchObject({ title: "관계에서 반복되는 패턴", body: null, locked: true, evidence: [] });
    expect(result.currentPeriod).toMatchObject({ ganji: "임인", startAge: 34, endAge: 43, isCurrent: true, stemTenGod: "정인" });
  });

  it("getTopicReport never exposes a paid body before purchase, even if the response carried one", async () => {
    mockApi(() => json(report({
      content_json: { excluded_due_to_unknown_time: false, sections: [{ key: "love_pattern", title: "패턴", body: "유출된 본문", is_free: false, locked: false, evidence: ["월간 상관"] }] },
    }), 201));
    const { getTopicReport } = await import("@/lib/api/service");

    const [section] = (await getTopicReport("22", "love")).sections;

    expect(section).toMatchObject({ locked: true, body: null, evidence: [] });
  });

  it("getTopicReport carries the time-unknown exclusion the server reported", async () => {
    mockApi(() => json(report({
      content_json: {
        excluded_due_to_unknown_time: true,
        excluded_sections: [{ key: "love_hour_insight", title: "시주로 보는 내면의 관계 욕구", reason: "출생 시간 미상으로 시주를 계산하지 않았어요." }],
        sections: [{ key: "excluded_scope", title: "제외된 범위", body: "출생 시간을 몰라서 뺐어요.", is_free: true, locked: false, evidence: ["시주 미상"] }],
      },
    }), 201));
    const { getTopicReport } = await import("@/lib/api/service");

    const result = await getTopicReport("22", "love");

    expect(result.excludedDueToUnknownTime).toBe(true);
    expect(result.excludedSections).toEqual([{ key: "love_hour_insight", title: "시주로 보는 내면의 관계 욕구", reason: "출생 시간 미상으로 시주를 계산하지 않았어요." }]);
    expect(result.sections.map((section) => section.key)).toEqual(["excluded_scope"]);
  });

  it("toServerReportTopic sends the money topic as wealth", async () => {
    const { toServerReportTopic } = await import("@/lib/api/service");
    expect(toServerReportTopic("money")).toBe("wealth");
    expect(toServerReportTopic("family")).toBe("family");
  });

  it("getDecadeReport posts to the decade endpoint and maps periods with the current one", async () => {
    const calls = mockApi(() => json(report({
      report_type: "decade", title: "대운 10년 리포트",
      content_json: {
        reference_year: 2026, excluded_due_to_unknown_time: false, current_period: CURRENT,
        periods: [
          { sequence: 3, ganji: "계묘", start_age: 24, end_age: 33, start_year: 2016, end_year: 2025, stem_ten_god: "편인", branch_ten_god: "비견", is_current: false, evidence: ["계묘 대운"] },
          CURRENT,
        ],
        sections: [
          { key: "decade_current", title: "지금의 대운", body: "지금은 임인 대운이에요.", is_free: true, locked: false, evidence: ["임인 대운"] },
          { key: "decade_detail", title: "구간별 심층 해설", body: null, is_free: false, locked: true, evidence: [] },
        ],
      },
    }), 201));
    const { getDecadeReport } = await import("@/lib/api/service");

    const result = await getDecadeReport("22");

    expect(calls).toEqual([{ method: "POST", path: "/api/v1/charts/22/reports/decade", body: {} }]);
    expect(result.periods.map((period) => [period.ganji, period.isCurrent])).toEqual([["계묘", false], ["임인", true]]);
    expect(result.periods[0]).toMatchObject({ startAge: 24, endAge: 33, startYear: 2016, endYear: 2025, evidence: ["계묘 대운"] });
    expect(result.currentPeriod?.ganji).toBe("임인");
    expect(result.sections.map((section) => [section.title, section.locked])).toEqual([["지금의 대운", false], ["구간별 심층 해설", true]]);
  });

  it("getDecadeReport tolerates a report without periods or a current period", async () => {
    mockApi(() => json(report({ report_type: "decade", content_json: { excluded_due_to_unknown_time: false, current_period: null, periods: null, sections: [] } }), 201));
    const { getDecadeReport } = await import("@/lib/api/service");

    const result = await getDecadeReport("22");

    expect(result.periods).toEqual([]);
    expect(result.currentPeriod).toBeNull();
  });

  it("surfaces a server error from the topic endpoint", async () => {
    mockApi(() => json({ code: "VALIDATION_ERROR", message: "알 수 없는 주제예요." }, 422));
    const { getTopicReport } = await import("@/lib/api/service");

    await expect(getTopicReport("22", "love")).rejects.toMatchObject({ status: 422 });
  });
});
