import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { SettingsScreen } from "@/components/settings-screens";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
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

const serverProfile = {
  id: 11, user_id: 1, nickname: "검증서연", is_self: true, birth_year: 1995, birth_month: 3, birth_day: 4,
  birth_time_hour: null, birth_time_minute: null, birth_time_unknown: true, calendar_type: "lunar", is_leap_month: false,
  birth_location: "부산", gender_for_calculation: "female", consent_for_storing_others_info: false, created_at: "2026-09-01T00:00:00",
};

function mockApi(profile: (path: string) => Response) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;
    if (path.startsWith("/api/v1/profiles")) return profile(path);
    if (path === "/api/v1/notification-preferences") return json({ topics: { daily_flow: true }, quiet_hours_start: 22, quiet_hours_end: 8, timezone: "Asia/Seoul" });
    return json([]);
  });
}

function profileCard() {
  return screen.getByRole("region", { name: "내 프로필" });
}

describe("settings profile card", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(cleanup);

  it("shows the server profile for a server session with a calculated chart", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
    window.localStorage.setItem(JOURNEY_KEY, JSON.stringify({ profileId: "11", chartId: "22", reportId: "33" }));
    const fetchMock = mockApi((path) => (path === "/api/v1/profiles/11" ? json(serverProfile) : json({}, 404)));
    render(<SettingsScreen />);

    expect(await within(profileCard()).findByText("검증서연")).toBeInTheDocument();
    expect(within(profileCard()).getByText("1995년생, 음력, 태어난 시간 모름")).toBeInTheDocument();
    expect(within(profileCard()).queryByText("서연")).toBeNull();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/api/v1/profiles/11"))).toBe(true);
  });

  it("finds the self profile of a signed-in account without a chart on this device", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "account", accessToken: "acct", anonymousToken: null }));
    mockApi((path) => {
      if (path === "/api/v1/profiles/") return json([{ ...serverProfile, id: 12, nickname: "민준", is_self: false }, serverProfile]);
      if (path === "/api/v1/profiles/11") return json(serverProfile);
      return json({}, 404);
    });
    render(<SettingsScreen />);

    expect(await within(profileCard()).findByText("검증서연")).toBeInTheDocument();
    expect(within(profileCard()).queryByText("민준")).toBeNull();
    // 이미 계정으로 로그인했으니 계정을 만들라는 버튼은 보이지 않는다.
    expect(within(profileCard()).queryByRole("link", { name: "계정 만들고 기록 옮기기" })).toBeNull();
  });

  it("offers to create an account to an anonymous session", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
    window.localStorage.setItem(JOURNEY_KEY, JSON.stringify({ profileId: "11", chartId: "22", reportId: "33" }));
    mockApi((path) => (path === "/api/v1/profiles/11" ? json(serverProfile) : json({}, 404)));
    render(<SettingsScreen />);

    expect(await within(profileCard()).findByText("검증서연")).toBeInTheDocument();
    expect(within(profileCard()).getByRole("link", { name: "계정 만들고 기록 옮기기" })).toHaveAttribute("href", "/login");
  });

  it("shows a loading state, then a retryable error when the server profile fails", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
    window.localStorage.setItem(JOURNEY_KEY, JSON.stringify({ profileId: "11", chartId: "22", reportId: "33" }));
    let fail = true;
    mockApi(() => (fail ? json({ code: "SERVER_ERROR", message: "server" }, 500) : json(serverProfile)));
    render(<SettingsScreen />);

    expect(within(profileCard()).getByText("프로필을 불러오고 있어요.")).toBeInTheDocument();
    expect(await within(profileCard()).findByRole("alert")).toBeInTheDocument();
    expect(within(profileCard()).queryByText("서연")).toBeNull();

    fail = false;
    fireEvent.click(within(profileCard()).getByRole("button", { name: "프로필 다시 불러오기" }));
    expect(await within(profileCard()).findByText("검증서연")).toBeInTheDocument();
  });

  it("shows an empty state instead of the example name without a session or device record", async () => {
    const fetchMock = mockApi(() => json({}, 404));
    render(<SettingsScreen />);

    const card = profileCard();
    expect(within(card).getByText("아직 입력한 출생 정보가 없어요")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "출생 정보 입력하기" })).toHaveAttribute("href", "/birth");
    expect(within(card).queryByText("서연")).toBeNull();
    expect(within(card).queryByText(/1992년생/)).toBeNull();
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/v1/profiles"))).toBe(false));
  });

  it("shows the birth information saved on this device without a session", () => {
    mockApi(() => json({}, 404));
    window.localStorage.setItem("sajurium-profile", JSON.stringify({ version: 1, birth: {
      displayName: "기기주인", calendar: "solar", leapMonth: false, birthDate: "1990-01-02", birthTime: "08:00", birthTimeUnknown: false,
      birthplace: "서울", timezone: "Asia/Seoul", calculationGender: "male", profileType: "self", ownerRelationship: "self",
      personalization: { interests: [], relationshipStatus: null, occupationStatus: null, primaryConcern: null }, thirdPartyConsent: false,
    } }));
    render(<SettingsScreen />);

    expect(within(profileCard()).getByText("기기주인")).toBeInTheDocument();
    expect(within(profileCard()).getByText("1990년생, 양력, 태어난 시간 입력함")).toBeInTheDocument();
  });

  it("still shows the corrupt state when the stored birth cannot be read", () => {
    mockApi(() => json({}, 404));
    window.localStorage.setItem("sajurium-profile", "{not json");
    render(<SettingsScreen />);

    expect(screen.getByRole("heading", { name: "출생 정보를 읽을 수 없어요" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "내 프로필" })).toBeNull();
  });
});
