import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { TopicPreviewScreen, TopicsScreen } from "@/components/saju-screens";
import { getTopicPreview } from "@/lib/fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const AUTH_KEY = "sajurium.sasaju-auth.v1";
const JOURNEY_KEY = "sajurium.server-journey.v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function topicReport(topic: string, content: Record<string, unknown>) {
  return {
    id: 71, user_id: 1, chart_snapshot_id: 22, report_type: topic, period_key: "2026", title: "커리어 리포트", content: "",
    generation_status: "READY", is_free_section: true, requires_payment: true, purchased: false, is_hidden: false,
    created_at: "2026-09-28T00:00:00Z",
    content_json: { topic, reference_year: 2026, excluded_due_to_unknown_time: false, excluded_sections: [], ...content },
  };
}

const KNOWN_TIME_SECTIONS = [
  { key: "career_strength", title: "강점", body: "맥락을 읽고 일을 구조화하는 힘이 있어요.", is_free: true, locked: false, evidence: ["월간 상관", "일간 을(목)"], requires_birth_time: false },
  { key: "career_caution", title: "주의할 점", body: "조건이 다 갖춰질 때까지 기다리면 늦을 수 있어요.", is_free: true, locked: false, evidence: ["월지 식신"], requires_birth_time: false },
  { key: "career_current_flow", title: "지금의 흐름", body: "지금은 임인 대운(34–43세, 2026–2035년)에 있어요.", is_free: true, locked: false, evidence: ["임인 대운", "대운 천간 임 정인"], requires_birth_time: false },
  { key: "career_pattern", title: "일에서 반복되는 패턴", body: null, is_free: false, locked: true, evidence: [], requires_birth_time: false },
  { key: "career_hour_insight", title: "시주로 보는 장기적인 방향", body: null, is_free: false, locked: true, evidence: [], requires_birth_time: true },
];

const UNKNOWN_TIME_CONTENT = {
  excluded_due_to_unknown_time: true,
  excluded_sections: [{ key: "career_hour_insight", title: "시주로 보는 장기적인 방향", reason: "출생 시간 미상으로 시주를 계산하지 않았어요." }],
  sections: [
    ...KNOWN_TIME_SECTIONS.filter((section) => !section.requires_birth_time),
    { key: "excluded_scope", title: "제외된 범위", body: "출생 시간을 몰라서 시주에 기대는 해석(시주로 보는 장기적인 방향)은 이번 리포트에서 뺐어요.", is_free: true, locked: false, evidence: ["시주 미상"], requires_birth_time: false },
  ],
};

function serverReading() {
  window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
  window.localStorage.setItem(JOURNEY_KEY, JSON.stringify({ profileId: "11", chartId: "22", reportId: "33" }));
}

function mockTopic(responses: Array<() => Response>) {
  const paths: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    paths.push(`${(init?.method ?? "GET").toUpperCase()} ${new URL(String(input)).pathname}`);
    return (responses.shift() ?? (() => json({ code: "NOT_FOUND", message: "없음" }, 404)))();
  });
  return paths;
}

describe("topic report screens", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(cleanup);

  it("renders the server's free sections in full with evidence chips and locks the paid ones", async () => {
    serverReading();
    const paths = mockTopic([() => json(topicReport("career", { sections: KNOWN_TIME_SECTIONS }), 201)]);

    render(<TopicPreviewScreen topicId="career" />);

    expect(await screen.findByRole("heading", { level: 1, name: "커리어 리포트" })).toBeDefined();
    expect(paths).toEqual(["POST /api/v1/charts/22/reports/topics/career"]);
    const free = screen.getByRole("region", { name: "커리어 무료 미리보기" });
    expect(within(free).getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["강점", "주의할 점", "지금의 흐름"]);
    expect(within(free).getByText("지금은 임인 대운(34–43세, 2026–2035년)에 있어요.")).toBeDefined();
    const strength = within(free).getByRole("article", { name: "강점" });
    expect(within(within(strength).getByRole("list", { name: "이렇게 읽었어요" })).getAllByRole("listitem").map((chip) => chip.textContent)).toEqual(["월간 상관", "일간 을(목)"]);

    const locked = screen.getByRole("list", { name: "구매하면 열리는 내용" });
    expect(within(locked).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["일에서 반복되는 패턴", "시주로 보는 장기적인 방향"]);
    expect(screen.getByRole("button", { name: "결제 준비 중" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("link", { name: "리포트 구성 보기" }).getAttribute("href")).toBe("/products/career-report");
    expect(screen.getByRole("link", { name: "도움됐어요" }).getAttribute("href")).toBe("/report/feedback?targetType=report&reportId=71&topic=career&reportKind=topic&rating=helpful");
    expect(screen.queryByText("예시")).toBeNull();
    expect(screen.queryByText(getTopicPreview("career").strength)).toBeNull();
  });

  it("asks the server for the wealth topic on the money screen", async () => {
    serverReading();
    const paths = mockTopic([() => json({ ...topicReport("wealth", { sections: KNOWN_TIME_SECTIONS }), title: "재물 리포트" }, 201)]);

    render(<TopicPreviewScreen topicId="money" />);

    expect(await screen.findByRole("heading", { level: 1, name: "재물 리포트" })).toBeDefined();
    expect(paths).toEqual(["POST /api/v1/charts/22/reports/topics/wealth"]);
  });

  it("follows the server's exclusion when the birth time is unknown", async () => {
    serverReading();
    mockTopic([() => json(topicReport("career", UNKNOWN_TIME_CONTENT), 201)]);

    render(<TopicPreviewScreen topicId="career" />);

    const free = await screen.findByRole("region", { name: "커리어 무료 미리보기" });
    const scope = within(free).getByRole("article", { name: "제외된 범위" });
    expect(within(scope).getByText(/시주에 기대는 해석\(시주로 보는 장기적인 방향\)은 이번 리포트에서 뺐어요/)).toBeDefined();
    expect(within(scope).getByRole("listitem").textContent).toBe("시주 미상");
    const locked = screen.getByRole("list", { name: "구매하면 열리는 내용" });
    expect(within(locked).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["일에서 반복되는 패턴"]);
  });

  it("shows a retryable error and loads the report on retry", async () => {
    serverReading();
    const paths = mockTopic([
      () => json({ code: "INTERNAL_ERROR", message: "잠시 후 다시 시도해 주세요.", request_id: "req_1" }, 500),
      () => json(topicReport("career", { sections: KNOWN_TIME_SECTIONS }), 201),
    ]);

    render(<TopicPreviewScreen topicId="career" />);

    expect(await screen.findByRole("heading", { name: "커리어 리포트를 불러오지 못했어요" })).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain("req_1");
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(await screen.findByRole("heading", { level: 1, name: "커리어 리포트" })).toBeDefined();
    expect(paths).toHaveLength(2);
  });

  it("shows an empty state when the server report has no sections", async () => {
    serverReading();
    mockTopic([() => json(topicReport("career", { sections: [] }), 201)]);

    render(<TopicPreviewScreen topicId="career" />);

    expect(await screen.findByRole("heading", { name: "커리어 리포트에 담긴 내용이 아직 없어요" })).toBeDefined();
    expect(screen.getByRole("link", { name: "다른 주제 보기" }).getAttribute("href")).toBe("/report/topics");
  });

  it("without a server reading, labels the fixed preview as an example and calls no API", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    render(<TopicPreviewScreen topicId="career" />);

    expect(screen.getByText("예시")).toBeDefined();
    expect(screen.getByRole("note").textContent).toContain("누구에게나 같은 예시 문장");
    const example = screen.getByRole("region", { name: "커리어 예시 미리보기" });
    expect(within(example).getByText(getTopicPreview("career").strength)).toBeDefined();
    expect(screen.queryByText(/\d+(\.\d+)?%|\d+점/)).toBeNull();
    expect(screen.getByRole("link", { name: "도움됐어요" }).getAttribute("href")).toContain("reportId=rpt_fixture_career");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("topic list says whether previews come from the chart or are examples", () => {
    const { unmount } = render(<TopicsScreen />);
    expect(screen.getByRole("note").textContent).toContain("예시 문장");
    unmount();

    serverReading();
    render(<TopicsScreen />);
    expect(screen.getByRole("note").textContent).toContain("계산한 명식을 바탕으로");
  });
});
