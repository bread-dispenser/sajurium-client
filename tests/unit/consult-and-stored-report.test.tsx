import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ConsultationNewScreen } from "@/components/consultation-screens";
import { ReportScreen } from "@/components/saju-screens";
import { INITIAL_COMMERCE_DATA, INITIAL_CONSULTATION_DATA } from "@/lib/fixtures";
import { commerceStore, consultationStore, libraryStore } from "@/lib/storage";

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

type Call = { method: string; path: string; body: Record<string, unknown> | undefined };

function mockApi(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const call = { method: (init?.method ?? "GET").toUpperCase(), path: url.pathname, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined };
    calls.push(call);
    return respond(call);
  });
  return calls;
}

const SESSION = { id: 9, profile_id: 11, consultation_type: "career", status: "ACTIVE", session_title: "이직", created_at: "2026-10-01T00:00:00Z", messages: [] };

function storedReport(overrides: Record<string, unknown> = {}) {
  return {
    id: 303, user_id: 1, chart_snapshot_id: 22, report_type: "basic", period_key: null, title: "기본 리포트", content: "",
    generation_status: "READY", is_free_section: true, requires_payment: false, purchased: false, is_hidden: false,
    created_at: "2026-09-28T00:00:00Z",
    content_json: {
      sections: [
        { key: "summary", title: "한 줄 요약", body: "차분하게 쌓아 가는 편이에요.", is_free: true, evidence: ["일간 갑(목)"] },
        { key: "excluded_scope", title: "제외된 범위", body: "출생 시간 미상으로 시주 의존 해석은 제외되었습니다.", is_free: true, evidence: ["시주 미상"] },
      ],
    },
    ...overrides,
  };
}

describe("consultation composer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockReset();
    window.localStorage.clear();
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
    window.localStorage.setItem(JOURNEY_KEY, JSON.stringify({ profileId: "11", chartId: "22", reportId: "303" }));
  });
  afterEach(cleanup);

  it("asks the server even when this device's old local credit records are empty", async () => {
    // 예전 버전이 남긴 기기 기록: 무료 0회, 이용권 0회. 서버 잔액과 무관하므로 전송을 막으면 안 된다.
    consultationStore.write({ ...INITIAL_CONSULTATION_DATA, sessions: [], freeUsesRemaining: 0 });
    commerceStore.write({ ...INITIAL_COMMERCE_DATA, consultationCredits: 0, orders: [], generations: [], creditHistory: [] });
    const libraryBefore = window.localStorage.getItem("sajurium-library");
    const calls = mockApi(({ method, path }) => {
      if (path === "/api/v1/consultations" && method === "POST") return json(SESSION, 201);
      if (path === "/api/v1/consultations/9/messages") return json({ status: "READY", job_id: "job_1", session_id: 9 }, 202);
      if (path === "/api/v1/consultations/9") return json({ ...SESSION, messages: [{ id: 1, role: "user", content: "이직해도 될까요?", created_at: "2026-10-01T00:00:00Z" }] });
      if (path === "/api/v1/credits") return json({ balance: 3 });
      if (path === "/api/v1/credit-ledger") return json([]);
      return json({}, 404);
    });

    render(<ConsultationNewScreen />);
    fireEvent.change(await screen.findByLabelText("질문"), { target: { value: "이직해도 될까요?" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 보내기" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/consult/session/9"));
    expect(calls.filter((call) => call.method === "POST").map((call) => call.path)).toEqual(["/api/v1/consultations", "/api/v1/consultations/9/messages"]);
    // 이용권 차감과 보관함은 서버가 기록한다. 기기에는 아무것도 더하지 않는다.
    expect(commerceStore.inspect()).toMatchObject({ status: "ok", value: { consultationCredits: 0, creditHistory: [] } });
    expect(window.localStorage.getItem("sajurium-library")).toBe(libraryBefore);
    expect(libraryStore.inspect().status).not.toBe("corrupt");
    expect(consultationStore.inspect()).toMatchObject({ status: "ok", value: { draft: null, sessions: [] } });
  });

  it("retries a failed first question in the same session with the same idempotency key", async () => {
    let attempts = 0;
    const calls = mockApi(({ method, path }) => {
      if (path === "/api/v1/consultations" && method === "POST") return json(SESSION, 201);
      if (path === "/api/v1/consultations/9/messages") {
        attempts += 1;
        return attempts === 1
          ? json({ code: "CONSULTATION_GENERATION_FAILED", message: "답변을 만들지 못했어요.", retryable: true }, 422)
          : json({ status: "READY", job_id: "job_1", session_id: 9 }, 202);
      }
      if (path === "/api/v1/consultations/9") return json(SESSION);
      if (path === "/api/v1/credits") return json({ balance: 1 });
      if (path === "/api/v1/credit-ledger") return json([]);
      return json({}, 404);
    });

    render(<ConsultationNewScreen />);
    fireEvent.change(await screen.findByLabelText("질문"), { target: { value: "이직해도 될까요?" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 보내기" }));
    fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/consult/session/9"));
    expect(calls.filter((call) => call.path === "/api/v1/consultations" && call.method === "POST")).toHaveLength(1);
    const messageKeys = calls.filter((call) => call.path === "/api/v1/consultations/9/messages").map((call) => call.body?.idempotency_key);
    expect(messageKeys).toHaveLength(2);
    expect(messageKeys[0]).toBe(messageKeys[1]);
  });

  it("shows the server's out-of-credit answer instead of a device check", async () => {
    mockApi(({ method, path }) => {
      if (path === "/api/v1/consultations" && method === "POST") return json(SESSION, 201);
      if (path === "/api/v1/consultations/9/messages") return json({ code: "INSUFFICIENT_CREDITS", message: "이용권이 부족합니다." }, 402);
      if (path === "/api/v1/credits") return json({ balance: 0 });
      if (path === "/api/v1/credit-ledger") return json([]);
      return json({}, 404);
    });

    render(<ConsultationNewScreen />);
    fireEvent.change(await screen.findByLabelText("질문"), { target: { value: "이직해도 될까요?" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 보내기" }));

    expect(await screen.findByRole("heading", { name: "남은 상담 이용권이 없어요" })).toBeInTheDocument();
    expect(screen.queryByText(/이 기기에 남은 이용권이 없어요/)).not.toBeInTheDocument();
  });
});

describe("report opened by id", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
    window.localStorage.setItem(JOURNEY_KEY, JSON.stringify({ profileId: "11", chartId: "22", reportId: "999" }));
  });
  afterEach(cleanup);

  it("loads that report, not the current journey's, and keeps its evidence", async () => {
    const calls = mockApi(({ path }) => {
      if (path === "/api/v1/reports/303") return json(storedReport({ title: "커리어 리포트", report_type: "career" }));
      if (path === "/api/v1/charts/22") return json({}, 404);
      return json({}, 404);
    });

    render(<ReportScreen reportId="303" />);

    expect(await screen.findByRole("heading", { name: "커리어 리포트" })).toBeInTheDocument();
    expect(calls.some((call) => call.path === "/api/v1/reports/999")).toBe(false);
    expect(screen.getByText("차분하게 쌓아 가는 편이에요.")).toBeInTheDocument();
    expect(screen.getByText("일간 갑(목)")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "제외된 범위" })).toBeInTheDocument();
  });

  it("offers to generate a failed report again", async () => {
    let status = "FAILED";
    const calls = mockApi(({ method, path }) => {
      if (path === "/api/v1/reports/303/retry" && method === "POST") {
        status = "READY";
        return json({ report_id: 303, status: "QUEUED" });
      }
      if (path === "/api/v1/reports/303") return json(storedReport({ generation_status: status }));
      return json({}, 404);
    });

    render(<ReportScreen reportId="303" />);
    fireEvent.click(await screen.findByRole("button", { name: "다시 만들기" }));

    expect(await screen.findByText("차분하게 쌓아 가는 편이에요.")).toBeInTheDocument();
    expect(calls.some((call) => call.path === "/api/v1/reports/303/retry")).toBe(true);
  });

  it("says the report is gone on 404", async () => {
    mockApi(() => json({ code: "NOT_FOUND", message: "없음" }, 404));
    render(<ReportScreen reportId="404" />);
    expect(await screen.findByRole("heading", { name: "리포트를 찾을 수 없어요" })).toBeInTheDocument();
  });
});
