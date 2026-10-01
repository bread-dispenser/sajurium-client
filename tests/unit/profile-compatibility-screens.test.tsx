import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ProfileEditScreen, validateProfileForm } from "@/components/profile-edit-screen";
import { CompatibilityResultScreen, LiveCompatibilityScreen, LivePeopleScreen } from "@/components/people-compatibility-screens";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const AUTH_KEY = "sajurium.sasaju-auth.v1";
const JOURNEY_KEY = "sajurium.server-journey.v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const profile = {
  id: 11, user_id: 1, nickname: "서연", is_self: true, birth_year: 1992, birth_month: 6, birth_day: 18,
  birth_time_hour: 13, birth_time_minute: 0, birth_time_unknown: false, calendar_type: "solar", is_leap_month: false,
  birth_location: "서울", gender_for_calculation: "female", consent_for_storing_others_info: false, created_at: "2026-09-01T00:00:00",
};

function chart(id: number, profileId: number, day: [string, string], hour: [string, string] | null) {
  return {
    id, profile_id: profileId, engine_version: "1", calculation_method: "fixed",
    year_gan: "임", year_ji: "신", month_gan: "병", month_ji: "오", day_gan: day[0], day_ji: day[1],
    hour_gan: hour?.[0] ?? null, hour_ji: hour?.[1] ?? null, five_elements: { 목: 1, 화: 2, 토: 2, 금: 1, 수: 2 }, ten_gods: {},
  };
}

type Call = { method: string; path: string; body: unknown };

function mockApi(handler: (method: string, path: string, body: unknown) => Response) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: url.pathname, body });
    return handler(method, url.pathname, body);
  });
  return calls;
}

describe("birth information edit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    push.mockReset();
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
  });
  afterEach(cleanup);

  it("asks for a chart first when this browser has none", async () => {
    window.localStorage.removeItem(JOURNEY_KEY);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<ProfileEditScreen />);
    expect(await screen.findByRole("heading", { name: "아직 계산한 명식이 없어요" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "명식 계산하기" })).toHaveAttribute("href", "/birth");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prefills my profile, saves a new chart and report, and keeps the journey on the new snapshot", async () => {
    window.localStorage.setItem(JOURNEY_KEY, JSON.stringify({ profileId: "11", chartId: "22", reportId: "33" }));
    const calls = mockApi((method, path, body) => {
      if (method === "GET" && path === "/api/v1/profiles/11") return json(profile);
      if (method === "PATCH" && path === "/api/v1/profiles/11") return json({ ...profile, ...(body as object) });
      if (method === "POST" && path === "/api/v1/profiles/11/chart") return json(chart(23, 11, ["병", "인"], ["을", "미"]), 201);
      if (method === "POST" && path === "/api/v1/charts/23/reports/basic") return json({ id: 34, chart_snapshot_id: 23 }, 201);
      return json({}, 404);
    });
    render(<ProfileEditScreen />);

    expect(await screen.findByRole("heading", { name: "내 출생 정보" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("수정하면 새 명식이 만들어지고 이전 리포트는 그대로 남아요.");
    expect(screen.getByLabelText("부를 이름")).toHaveValue("서연");
    expect(screen.getByLabelText("태어난 해")).toHaveValue("1992");
    expect(screen.getByRole("button", { name: /^미시/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/출생지/)).toHaveValue("서울");

    fireEvent.change(screen.getByLabelText("태어난 날"), { target: { value: "19" } });
    fireEvent.click(screen.getByRole("button", { name: /^신시/ }));
    fireEvent.click(screen.getByRole("button", { name: "새 명식으로 저장하기" }));

    expect(await screen.findByRole("heading", { name: "새 명식으로 저장했어요" })).toBeInTheDocument();
    expect(screen.getByText(/이전 리포트는 보관함에 그대로 있어요/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "새 명식 보기" })).toHaveAttribute("href", "/report");
    const patch = calls.find((call) => call.method === "PATCH");
    expect(patch?.body).toMatchObject({ birth_day: 19, birth_time_hour: 15, birth_time_minute: 0, birth_time_unknown: false, calendar_type: "solar", gender_for_calculation: "female", birth_location: "서울" });
    expect(JSON.parse(window.localStorage.getItem(JOURNEY_KEY) ?? "null")).toEqual({ profileId: "11", chartId: "23", reportId: "34" });
  });

  it("edits another person's birth time as an exact time and leaves my journey alone", async () => {
    window.localStorage.setItem(JOURNEY_KEY, JSON.stringify({ profileId: "11", chartId: "22", reportId: "33" }));
    const other = { ...profile, id: 12, nickname: "민준", is_self: false, birth_time_hour: 9, birth_time_minute: 45 };
    const calls = mockApi((method, path, body) => {
      if (method === "GET" && path === "/api/v1/profiles/12") return json(other);
      if (method === "PATCH" && path === "/api/v1/profiles/12") return json({ ...other, ...(body as object) });
      if (method === "POST" && path === "/api/v1/profiles/12/chart") return json(chart(50, 12, ["계", "해"], null), 201);
      return json({}, 404);
    });
    render(<ProfileEditScreen profileId="12" />);

    expect(await screen.findByRole("heading", { name: "민준님의 출생 정보" })).toBeInTheDocument();
    expect(screen.getByLabelText("태어난 시")).toHaveValue("9");
    expect(screen.getByLabelText("태어난 분")).toHaveValue("45");
    fireEvent.click(screen.getByLabelText("시간을 몰라요. 시주를 빼고 여섯 글자로 계산할게요."));
    fireEvent.click(screen.getByRole("button", { name: "새 명식으로 저장하기" }));

    expect(await screen.findByRole("link", { name: "사람 보관함으로" })).toHaveAttribute("href", "/people");
    expect(calls.find((call) => call.method === "PATCH")?.body).toMatchObject({ birth_time_unknown: true, birth_time_hour: null, birth_time_minute: null });
    expect(calls.some((call) => call.path.includes("/reports/basic"))).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(JOURNEY_KEY) ?? "null")).toEqual({ profileId: "11", chartId: "22", reportId: "33" });
  });

  it("validates before sending and keeps the input when saving fails", async () => {
    window.localStorage.setItem(JOURNEY_KEY, JSON.stringify({ profileId: "11", chartId: "22", reportId: "33" }));
    const calls = mockApi((method, path) => {
      if (method === "GET" && path === "/api/v1/profiles/11") return json(profile);
      return json({ code: "INVALID_LUNAR_DATE", message: "해당 연도에는 윤달이 없습니다." }, 422);
    });
    render(<ProfileEditScreen />);
    await screen.findByRole("heading", { name: "내 출생 정보" });

    fireEvent.change(screen.getByLabelText("태어난 달"), { target: { value: "13" } });
    fireEvent.click(screen.getByRole("button", { name: "새 명식으로 저장하기" }));
    expect(screen.getByRole("alert")).toHaveTextContent("올바른 생년월일");
    expect(calls.filter((call) => call.method !== "GET")).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("태어난 달"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "음력 윤달" }));
    fireEvent.click(screen.getByRole("button", { name: "새 명식으로 저장하기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("해당 연도에는 윤달이 없습니다.");
    expect(screen.getByRole("button", { name: "음력 윤달" })).toHaveAttribute("aria-pressed", "true");
  });

  it("explains a profile that is not mine or no longer exists", async () => {
    mockApi(() => json({ code: "PROFILE_NOT_FOUND", message: "프로필을 찾을 수 없습니다." }, 404));
    render(<ProfileEditScreen profileId="99" />);
    expect(await screen.findByRole("heading", { name: "이 출생 정보를 찾을 수 없어요" })).toBeInTheDocument();
  });

  it("checks name, date and time rules", () => {
    const base = { nickname: "서연", calendar: "solar" as const, year: "1992", month: "6", day: "18", timeMode: "sijin" as const, sijinIndex: 7, hour: "", minute: "", timeUnknown: false, gender: "female" as const, birthplace: "" };
    expect(validateProfileForm(base)).toBeNull();
    expect(validateProfileForm({ ...base, nickname: " " })).toContain("부를 이름");
    expect(validateProfileForm({ ...base, sijinIndex: null })).toContain("태어난 시간");
    expect(validateProfileForm({ ...base, sijinIndex: null, timeUnknown: true })).toBeNull();
    expect(validateProfileForm({ ...base, timeMode: "exact", hour: "24", minute: "0" })).toContain("0시부터 23시");
  });
});

describe("people storage edit entry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
  });
  afterEach(cleanup);

  it("links each stored person to their edit screen", async () => {
    mockApi((method, path) => (path === "/api/v1/profiles/" ? json([{ ...profile, birth_location_masked: "서*" }, { ...profile, id: 12, nickname: "민준", is_self: false, relationship_type: "friend" }]) : json({}, 404)));
    render(<LivePeopleScreen />);
    expect(await screen.findByRole("link", { name: "민준 출생 정보 수정" })).toHaveAttribute("href", "/people/12/edit");
    expect(screen.getByRole("link", { name: "서연 출생 정보 수정" })).toHaveAttribute("href", "/people/11/edit");
  });
});

describe("compatibility result from the server", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    push.mockReset();
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
  });
  afterEach(cleanup);

  const result = {
    id: 5, user_id: 1, profile_a_id: 11, profile_b_id: 12, snapshot_a_id: 22, snapshot_b_id: 50, relation_type: "friend",
    generation_status: "READY", requires_payment: true, purchased: false, created_at: "2026-09-28T00:00:00",
    result: { free_preview: { score: 40, summary: "두 원국의 오행 분포 차이를 근거로 계산한 궁합 지표입니다.", limited_by_unknown_time: true }, paid_detail: { sections: [{ title: "관계 유형별 분석", locked: true }, { title: "소통 패턴 분석", locked: true }] } },
  };

  it("reads the stored result, both day pillars and names, without a score", async () => {
    mockApi((method, path) => {
      if (path === "/api/v1/compatibilities/5") return json(result);
      if (path === "/api/v1/profiles/") return json([{ ...profile }, { ...profile, id: 12, nickname: "민준", is_self: false }]);
      if (path === "/api/v1/charts/22") return json(chart(22, 11, ["을", "축"], ["계", "미"]));
      if (path === "/api/v1/charts/50") return json(chart(50, 12, ["계", "해"], null));
      return json({}, 404);
    });
    render(<CompatibilityResultScreen resultId="5" />);

    expect(await screen.findByRole("heading", { name: "서연님과 민준님" })).toBeInTheDocument();
    expect(screen.getByText("친구 관계로 봤어요")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "관계 요약" })).toBeInTheDocument();
    expect(screen.getByText("두 원국의 오행 분포 차이를 근거로 계산한 궁합 지표입니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("을축")).toBeInTheDocument();
    expect(screen.getByLabelText("계해")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("민준님은 태어난 시간을 몰라서");
    const locked = screen.getByRole("list");
    expect(within(locked).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["관계 유형별 분석", "소통 패턴 분석"]);
    expect(screen.queryByText("40")).toBeNull();
  });

  it("says when the result does not exist", async () => {
    mockApi(() => json({ code: "COMPATIBILITY_NOT_FOUND", message: "궁합 결과를 찾을 수 없습니다." }, 404));
    render(<CompatibilityResultScreen resultId="9" />);
    expect(await screen.findByRole("heading", { name: "궁합 결과를 찾을 수 없어요" })).toBeInTheDocument();
  });

  it("opens the result screen after calculating", async () => {
    const calls = mockApi((method, path) => {
      if (path === "/api/v1/profiles/") return json([{ ...profile }, { ...profile, id: 12, nickname: "민준", is_self: false, relationship_type: "friend" }]);
      if (method === "POST" && path.endsWith("/chart")) return json(chart(22, 11, ["을", "축"], null), 201);
      if (method === "POST" && path === "/api/v1/compatibilities") return json(result, 201);
      return json({}, 404);
    });
    render(<LiveCompatibilityScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "궁합 보기" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/compatibility/result/5"));
    expect(calls.find((call) => call.path === "/api/v1/compatibilities")?.body).toEqual({ profile_a_id: 11, profile_b_id: 12, relation_type: "couple" });
  });
});

describe("settings entry to the birth edit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
    mockApi(() => json({ topics: { daily_flow: true }, quiet_hours_start: 22, quiet_hours_end: 8, timezone: "Asia/Seoul" }));
  });
  afterEach(cleanup);

  it("opens the server profile edit when a chart was calculated", async () => {
    window.localStorage.setItem(JOURNEY_KEY, JSON.stringify({ profileId: "11", chartId: "22", reportId: "33" }));
    const { SettingsScreen } = await import("@/components/settings-screens");
    render(<SettingsScreen />);
    expect(await screen.findByRole("link", { name: /출생 정보 수정/ })).toHaveAttribute("href", "/profile");
    expect(screen.queryByRole("button", { name: /출생 정보 수정/ })).toBeNull();
  });

  it("keeps the device form when there is no server chart", async () => {
    const { SettingsScreen } = await import("@/components/settings-screens");
    render(<SettingsScreen />);
    fireEvent.click(await screen.findByRole("button", { name: /출생 정보 수정/ }));
    expect(screen.getByRole("button", { name: "출생 정보 저장" })).toBeInTheDocument();
  });
});
