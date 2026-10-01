import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { LiveNotificationScreen, NotificationPreferencesGroup } from "@/components/account-notification-screens";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const AUTH_KEY = "sajurium.sasaju-auth.v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// The backend's DEFAULT_TOPICS (app/services/notification_service.py).
const SERVER_TOPICS = { report_ready: true, consultation_answered: true, payment_completed: true, daily_flow: true, marketing: false };

function preferences(topics: Record<string, boolean>) {
  return { topics, quiet_hours_start: 22, quiet_hours_end: 8, timezone: "Asia/Seoul" };
}

function rowTitles() {
  return screen.getAllByRole("switch").map((input) => input.closest("label")!.querySelector(".sj-row-title")!.textContent);
}

describe("notification topics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
  });
  afterEach(cleanup);

  it("gives every server topic its own name in settings", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(preferences(SERVER_TOPICS)));
    render(<NotificationPreferencesGroup />);

    await screen.findAllByRole("switch");
    const titles = rowTitles();
    expect(titles).toEqual(["오늘의 흐름", "리포트 완성", "상담 답변", "결제 완료", "혜택과 소식"]);
    expect(new Set(titles).size).toBe(titles.length);
    expect(screen.getByText("상담 답변이 도착하면 알려드려요")).toBeInTheDocument();
    expect(screen.getByText("결제와 지급이 끝나면 알려드려요")).toBeInTheDocument();
    expect(screen.queryByText("기타 알림")).toBeNull();
  });

  it("still names the legacy payment topic", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(preferences({ payment: true, report_ready: true })));
    render(<NotificationPreferencesGroup />);

    await screen.findAllByRole("switch");
    expect(rowTitles()).toEqual(["리포트 완성", "결제"]);
  });

  it("folds unknown topics into one row without raw codes and toggles them together", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (init?.method === "PATCH") return json(preferences({ ...JSON.parse(String(init.body)).topics }));
      return json(preferences({ report_ready: true, new_feature: true, another_topic: true }));
    });
    render(<NotificationPreferencesGroup />);

    await screen.findAllByRole("switch");
    expect(rowTitles()).toEqual(["리포트 완성", "기타 알림"]);
    expect(screen.queryByText(/new_feature|another_topic/)).toBeNull();

    const other = screen.getByText("기타 알림").closest("label")!;
    const toggle = within(other).getByRole("switch");
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(JSON.parse(String(patch[1]!.body)).topics).toEqual({ report_ready: true, new_feature: false, another_topic: false });
  });

  it("labels inbox rows with the same names, and unknown topics generically", async () => {
    const base = { status: "SENT", is_marketing: false, created_at: "2026-09-28T00:00:00", body: null, deep_link: null, read_at: null };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json([
      { ...base, id: 1, topic: "consultation_answered", title: "상담 답변이 도착했어요" },
      { ...base, id: 2, topic: "payment_completed", title: "결제가 완료됐어요" },
      { ...base, id: 3, topic: "brand_new_topic", title: "새 안내" },
    ]));
    render(<LiveNotificationScreen />);

    expect(await screen.findByText("상담 답변, 9월 28일")).toBeInTheDocument();
    expect(screen.getByText("결제 완료, 9월 28일")).toBeInTheDocument();
    expect(screen.getByText("알림, 9월 28일")).toBeInTheDocument();
    expect(screen.queryByText(/brand_new_topic/)).toBeNull();
  });
});
