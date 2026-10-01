import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { LiveSharedResultScreen, ShareCreateScreen } from "@/components/distribution-future-prototype";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const AUTH_KEY = "sajurium.sasaju-auth.v1";
const JOURNEY_KEY = "sajurium.server-journey.v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const chart = {
  id: 22, profile_id: 11, engine_version: "1", calculation_method: "fixed",
  year_gan: "임", year_ji: "신", month_gan: "병", month_ji: "오", day_gan: "을", day_ji: "축", hour_gan: "계", hour_ji: "미",
  five_elements: { 목: 1, 화: 2, 토: 2, 금: 1, 수: 2 }, ten_gods: {},
};
const report = {
  id: 33, user_id: 1, chart_snapshot_id: 22, report_type: "basic", title: "기본 사주 리포트", content: "요약", summary: "요약",
  content_json: { sections: [{ key: "summary", title: "한 줄 요약", body: "을축 일주의 차분한 명식이에요.", is_free: true }] },
  generation_status: "READY", requires_payment: false, purchased: false, is_hidden: false, created_at: "2026-09-28T00:00:00",
};

describe("share link creation", () => {
  let created: unknown[];
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
    window.localStorage.setItem(JOURNEY_KEY, JSON.stringify({ profileId: "11", chartId: "22", reportId: "33" }));
    created = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/charts/22")) return json(chart);
      if (url.endsWith("/api/v1/reports/33")) return json(report);
      if (url.endsWith("/api/v1/share-links") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        created.push(body);
        return json({ id: 1, target_type: "report", target_id: 33, share_url: "/api/v1/shared/abcdefghijklmnop", include: body.include, expires_at: "2026-10-01T00:00:00", is_active: true, access_count: 0, created_at: "2026-09-28T00:00:00" }, 201);
      }
      return json({}, 404);
    });
  });
  afterEach(cleanup);

  function switchFor(name: string) {
    return screen.getByRole("switch", { name: new RegExp(`^${name}`) });
  }

  it("starts with summary, day pillar and five elements on and birth fields off", async () => {
    render(<ShareCreateScreen />);
    await screen.findByRole("heading", { name: "기본 사주 리포트를 링크로 보내요" });
    expect(switchFor("한 줄 요약")).toBeChecked();
    expect(switchFor("일주")).toBeChecked();
    expect(switchFor("오행 균형")).toBeChecked();
    expect(switchFor("출생일")).not.toBeChecked();
    expect(switchFor("출생 시간")).not.toBeChecked();
    expect(await screen.findByText("을축 일주의 차분한 명식이에요.")).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "공유 카드 미리보기: 을축 일주" })).toBeInTheDocument();
  });

  it("asks before adding a birth field and sends exactly what was chosen", async () => {
    render(<ShareCreateScreen />);
    await screen.findByRole("heading", { name: "기본 사주 리포트를 링크로 보내요" });

    fireEvent.click(switchFor("출생일"));
    const warning = screen.getByRole("alert");
    expect(warning).toHaveTextContent("출생일은 링크를 받은 누구나 보게 돼요");
    expect(switchFor("출생일")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "링크 만들기" })).toBeDisabled();
    fireEvent.click(within(warning).getByRole("button", { name: "담지 않기" }));
    expect(switchFor("출생일")).not.toBeChecked();

    fireEvent.click(switchFor("출생 시간"));
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "출생 시간 담기" }));
    expect(switchFor("출생 시간")).toBeChecked();
    expect(screen.getByText(/출생 정보를 담았어요/)).toBeInTheDocument();
    fireEvent.click(switchFor("오행 균형"));

    fireEvent.click(screen.getByRole("button", { name: "링크 만들기" }));
    expect(await screen.findByLabelText("공유 링크")).toHaveValue(`${window.location.origin}/shared/abcdefghijklmnop`);
    expect(created).toEqual([{ target_type: "report", target_id: 33, expires_in_hours: 72, include: ["summary", "day_pillar", "birth_time"] }]);
    expect(switchFor("한 줄 요약")).toBeDisabled();
  });

  it("will not create a link with nothing chosen", async () => {
    render(<ShareCreateScreen />);
    await screen.findByRole("heading", { name: "기본 사주 리포트를 링크로 보내요" });
    for (const name of ["한 줄 요약", "일주", "오행 균형"]) fireEvent.click(switchFor(name));
    expect(screen.getByRole("button", { name: "링크 만들기" })).toBeDisabled();
    expect(created).toHaveLength(0);
  });
});

describe("public shared page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });
  afterEach(cleanup);

  it("shows only the fields the server returned", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({
      title: "기본 사주 리포트", include: ["day_pillar", "birth_time"], sections: [],
      day_pillar: { gan: "을", ji: "축" }, birth_time: "14:30", birth_time_unknown: false, expires_at: "2026-10-01T00:00:00",
    }));
    render(<LiveSharedResultScreen token="abcdefghijklmnop" />);

    expect(await screen.findByRole("heading", { name: "일주" })).toBeInTheDocument();
    expect(screen.getByText("을축 일주, 일간 을목")).toBeInTheDocument();
    expect(screen.getByText("오후 2시 30분")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "한 줄 요약" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "오행 균형" })).toBeNull();
    expect(screen.queryByText(/년 \d+월 \d+일/)).toBeNull();
    expect(screen.getByText(/출생지와 계산 근거는 공유되지 않아요/)).toBeInTheDocument();
  });

  it("shows summary, five elements and the birth date when they were chosen", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({
      title: "기본 사주 리포트", include: ["summary", "five_elements", "birth_date", "birth_time"],
      sections: [{ title: "한 줄 요약", body: "요약 문장" }], summary: "요약 문장",
      five_elements: { 목: 1, 화: 2, 토: 2, 금: 1, 수: 2 },
      birth_date: { calendar_type: "lunar", is_leap_month: true, date: "1992-05-18" }, birth_time_unknown: true,
    }));
    render(<LiveSharedResultScreen token="abcdefghijklmnop" />);

    expect(await screen.findByText("요약 문장")).toBeInTheDocument();
    expect(screen.getAllByText("요약 문장")).toHaveLength(1);
    expect(screen.getByRole("img", { name: "오행 분포: 목 1, 화 2, 토 2, 금 1, 수 2" })).toBeInTheDocument();
    expect(screen.getByText("음력 윤달 1992년 5월 18일")).toBeInTheDocument();
    expect(screen.getByText("태어난 시간 모름")).toBeInTheDocument();
  });

  it("keeps links made before include lists to their free sections", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ title: "기본 사주 리포트", sections: [{ title: "성격 경향", body: "섬세해요." }] }));
    render(<LiveSharedResultScreen token="abcdefghijklmnop" />);

    expect(await screen.findByRole("heading", { name: "성격 경향" })).toBeInTheDocument();
    expect(screen.getByText("출생 정보와 계산 근거는 공유되지 않아요. 사주 해석은 참고용이며 중요한 결정을 대신하지 않아요.")).toBeInTheDocument();
  });
});

