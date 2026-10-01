import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { LiveNotificationScreen } from "@/components/account-notification-screens";
import { AppShell, NotificationBell } from "@/components/app-shell";
import { UNREAD_COUNT_EVENT } from "@/lib/api/service";

const pathname = { current: "/home" };

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const AUTH_KEY = "sajurium.sasaju-auth.v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const base = { status: "SENT", is_marketing: false, created_at: "2026-09-28T00:00:00" };
const inbox = [
  { ...base, id: 1, topic: "report_ready", title: "리포트가 준비됐어요", body: "결과를 확인해 주세요.", deep_link: "/report", read_at: null },
  { ...base, id: 2, topic: "daily_flow", title: "오늘의 흐름이 열렸어요", body: null, deep_link: null, read_at: null },
  { ...base, id: 3, topic: "daily_flow", title: "어제의 흐름", deep_link: "https://example.org", read_at: "2026-09-27T00:00:00" },
];

describe("notification inbox", () => {
  let events: number[];
  const record = (event: Event) => events.push((event as CustomEvent<number>).detail);

  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
    events = [];
    window.addEventListener(UNREAD_COUNT_EVENT, record);
  });
  afterEach(() => {
    window.removeEventListener(UNREAD_COUNT_EVENT, record);
    cleanup();
  });

  it("splits unread from read, marks a row read when opened and tells the bell", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/notifications")) return json(inbox);
      if (url.endsWith("/api/v1/notifications/2/read") && init?.method === "POST") return json({ ...inbox[1], read_at: "2026-09-28T01:00:00" });
      return json({}, 404);
    });
    render(<LiveNotificationScreen />);

    const unread = await screen.findByRole("region", { name: "읽지 않음 2개" });
    expect(within(unread).getByRole("link", { name: /리포트가 준비됐어요/ })).toHaveAttribute("href", "/report");
    expect(within(unread).getByRole("button", { name: /오늘의 흐름이 열렸어요, 읽지 않음/ })).toBeInTheDocument();
    const read = screen.getByRole("region", { name: "읽음" });
    // 외부 링크는 열지 않고, 이미 읽은 알림은 누를 것이 없다.
    expect(within(read).queryByRole("link")).toBeNull();
    expect(within(read).getByText("어제의 흐름")).toBeInTheDocument();

    fireEvent.click(within(unread).getByRole("button", { name: /오늘의 흐름이 열렸어요/ }));

    await waitFor(() => expect(screen.getByRole("region", { name: "읽지 않음 1개" })).toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("읽음으로 표시했어요");
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith("/notifications/2/read") && init?.method === "POST")).toBe(true);
    expect(events.at(-1)).toBe(1);
  });

  it("marks everything read with one button", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/notifications")) return json(inbox);
      if (url.endsWith("/api/v1/notifications/read-all") && init?.method === "POST") return json({ updated_count: 2, unread_count: 0 });
      return json({}, 404);
    });
    render(<LiveNotificationScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "모두 읽음" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("모두 읽음으로 표시했어요"));
    expect(screen.queryByRole("region", { name: /읽지 않음/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "모두 읽음" })).toBeNull();
    expect(events.at(-1)).toBe(0);
  });

  it("keeps the list when marking read fails and says why", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/notifications")) return json(inbox);
      return json({ code: "NOTIFICATION_NOT_FOUND", message: "알림을 찾을 수 없습니다." }, 404);
    });
    render(<LiveNotificationScreen />);

    fireEvent.click(await screen.findByRole("button", { name: /오늘의 흐름이 열렸어요/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("알림을 찾을 수 없습니다.");
    expect(screen.getByRole("region", { name: "읽지 않음 2개" })).toBeInTheDocument();
  });
});

describe("header bell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    pathname.current = "/home";
  });
  afterEach(cleanup);

  it("names the unread count and hides the badge at zero", () => {
    const { rerender } = render(<NotificationBell count={3} />);
    expect(screen.getByRole("link", { name: "알림, 읽지 않은 알림 3개" })).toHaveTextContent("3");
    rerender(<NotificationBell count={120} />);
    expect(screen.getByRole("link", { name: "알림, 읽지 않은 알림 120개" })).toHaveTextContent("99+");
    rerender(<NotificationBell count={0} />);
    expect(screen.getByRole("link", { name: "알림" })).toHaveTextContent("");
  });

  it("shows the server count in the shell and follows inbox updates", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ unread_count: 2 }));
    render(<AppShell><p>본문</p></AppShell>);

    await waitFor(() => expect(screen.getAllByRole("link", { name: "알림, 읽지 않은 알림 2개" }).length).toBeGreaterThan(0));
    act(() => { window.dispatchEvent(new CustomEvent(UNREAD_COUNT_EVENT, { detail: 0 })); });
    expect(screen.queryAllByRole("link", { name: /읽지 않은 알림/ })).toHaveLength(0);
    expect(screen.getAllByRole("link", { name: "알림" }).length).toBeGreaterThan(0);
  });

  it("keeps the shell intact when the count request fails", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network down"));
    render(<AppShell><p>본문</p></AppShell>);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText("본문")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "알림" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("navigation", { name: "주요 메뉴" }).length).toBeGreaterThan(0);
  });

  it("does not open a session just to count when none exists", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<AppShell><p>본문</p></AppShell>);
    await act(async () => { await Promise.resolve(); });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getAllByRole("link", { name: "알림" }).length).toBeGreaterThan(0);
  });
});
