import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { CalendarScreen, DecadeScreen, LiveFlowScreen, LiveHomeScreen } from "@/components/core-screens";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const JOURNEY_KEY = "sajurium.server-journey.v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function flowReport(scope: string, body: string) {
  return {
    id: 9, user_id: 1, chart_snapshot_id: 2, report_type: scope, title: "흐름", content: body, summary: body,
    content_json: { sections: [{ key: `flow_${scope}`, title: scope === "year" ? "올해 흐름" : "오늘의 흐름", body, is_free: true }] },
    generation_status: "READY", requires_payment: false, purchased: false, is_hidden: false,
    created_at: "2026-09-28T00:00:00Z", updated_at: "2026-09-28T00:00:00Z",
  };
}

const chart = {
  id: 2, profile_id: 1, engine_version: "1", calculation_method: "fixed",
  year_gan: "임", year_ji: "신", month_gan: "병", month_ji: "오", day_gan: "을", day_ji: "축", hour_gan: "계", hour_ji: "미",
  five_elements: { 목: 1, 화: 2, 토: 2, 금: 1, 수: 2 },
  ten_gods: { hour: "편인", month: "상관", year: "정인" },
  daeun_info: {
    direction: "backward", start_age: 4, start_year: 1996,
    periods: [["을사", 4], ["갑진", 14], ["계묘", 24], ["임인", 34], ["신축", 44]].map(([ganji, age]) => ({ ganji, start_age: age, end_age: Number(age) + 9 })),
  },
};

function mockServer() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/auth/anonymous")) return json({ access_token: "jwt", token_type: "bearer", anonymous_token: "anon" }, 201);
    if (url.includes("/flow/")) {
      const scope = url.split("/flow/")[1];
      return json(flowReport(scope, `${scope} 기준 순환과 휴식의 흐름입니다.`));
    }
    if (url.includes("/charts/")) return json(chart);
    if (url.includes("/consultations")) return json([]);
    if (url.includes("/reports")) return json([]);
    return json({ code: "NOT_FOUND", message: "없음" }, 404);
  });
}

describe("core screens", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 28, 12));
    window.localStorage.clear();
    window.localStorage.setItem(JOURNEY_KEY, JSON.stringify({ profileId: "1", chartId: "2", reportId: "3" }));
    mockServer();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("home shows today's day pillar, the server flow label, and the consultation link", async () => {
    render(<LiveHomeScreen />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "오늘은 순환과 휴식의 흐름이에요" })).toBeDefined());
    expect(screen.getByRole("img", { name: "오늘의 일진 을사" })).toBeDefined();
    expect(screen.getByText("today 기준 순환과 휴식의 흐름입니다.")).toBeDefined();
    expect(screen.getByRole("link", { name: "상담 시작하기" }).getAttribute("href")).toBe("/consult/new");
    expect(screen.getByText("9월 8일 백로부터 정유월이에요")).toBeDefined();
  });

  it("month flow names the month pillar from the solar-term boundary", async () => {
    render(<LiveFlowScreen mode="month" />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "정유월, 9월 8일 백로부터" })).toBeDefined());
    expect(screen.getByText("순환과 휴식")).toBeDefined();
  });

  it("year flow keeps the server section heading and the current daeun", async () => {
    render(<LiveFlowScreen mode="year" />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "올해 흐름" })).toBeDefined());
    expect(screen.getByRole("heading", { name: "임인 대운 안에서 만나는 병오년" })).toBeDefined();
    expect(screen.getByText(/서버에 저장된 명식과 기간 기준/)).toBeDefined();
  });

  it("decade screen lists daeun periods in order and marks the current one", async () => {
    render(<DecadeScreen />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "지금은 34세부터 43세까지 이어지는 임인 대운이에요" })).toBeDefined());
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[3].getAttribute("aria-current")).toBe("step");
  });

  it("decade screen asks for birth details when there is no chart", async () => {
    window.localStorage.removeItem(JOURNEY_KEY);
    render(<DecadeScreen />);
    await waitFor(() => expect(screen.getByRole("link", { name: "출생 정보 입력하기" }).getAttribute("href")).toBe("/birth"));
  });

  it("calendar shows day pillars and only links today's flow", () => {
    render(<CalendarScreen />);
    expect(screen.getByRole("heading", { level: 1, name: "2026년 9월" })).toBeDefined();
    const today = screen.getByRole("button", { name: "9월 28일 을사일, 오늘" });
    expect(today.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("link", { name: "오늘의 흐름 보기" }).getAttribute("href")).toBe("/flow/today");
    fireEvent.click(screen.getByRole("button", { name: "9월 27일 갑진일" }));
    expect(screen.getByRole("heading", { name: "9월 27일 일요일, 갑진일" })).toBeDefined();
    expect(screen.queryByRole("link", { name: "오늘의 흐름 보기" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다음 달" }));
    expect(screen.getByRole("heading", { level: 1, name: "2026년 10월" })).toBeDefined();
  });
});
