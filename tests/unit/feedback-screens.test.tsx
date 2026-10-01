import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { FeedbackManagementScreen } from "@/components/settings-screens";
import { FeedbackScreen } from "@/components/saju-screens";
import { AnswerFeedback } from "@/components/consultation-screens";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const AUTH_KEY = "sajurium.sasaju-auth.v1";
const FEEDBACK_LIST_KEY = "sajurium-feedback-list";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function signIn() {
  window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
}

const provenance = { profileSnapshotId: "profile_snapshot_fixture_primary", chartSnapshotIds: ["chart_fixture_primary"], modelVersion: null, promptVersion: null, templateVersion: "fixture-1" };
function localEntry(id: string, reportId: string) {
  return { id, target: { type: "report", reportId }, topic: "career", rating: "helpful", reason: "too_generic", comment: "", provenance, reported: false, createdAt: "2026-08-25T00:00:00.000Z" };
}

function bodies(fetchMock: { mock: { calls: unknown[][] } }, path: string) {
  return fetchMock.mock.calls
    .map(([input, init]) => ({ url: String(input), init: init as RequestInit | undefined }))
    .filter(({ url, init }) => url.endsWith(path) && init?.method === "POST")
    .map(({ init }) => JSON.parse(String(init?.body)));
}

describe("feedback list", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    push.mockReset();
  });
  afterEach(cleanup);

  it("shows the server list with processing status and keeps only never-sent local entries", async () => {
    signIn();
    window.localStorage.setItem(FEEDBACK_LIST_KEY, JSON.stringify({ version: 1, entries: [localEntry("local-preview", "rpt_fixture_career"), localEntry("already-sent", "303")] }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json([
      { id: 3, target_type: "consultation", target_title: "이직 고민", consultation_message_id: 9, consultation_session_id: 4, rating: "reported", detail_reason: "표현이 불쾌하거나 과해요", report_reason: "표현이 불쾌하거나 과해요", status: "REVIEWING", created_at: "2026-09-28T06:00:00" },
      { id: 2, target_type: "report", target_title: "기본 사주 리포트", report_id: 303, rating: "inaccurate", detail_reason: "사주 정보가 잘못됐어요\n시간이 달라요", status: "RECEIVED", created_at: "2026-09-27T06:00:00" },
      { id: 1, target_type: "report", target_title: null, report_id: 300, rating: "unclear", status: "RESOLVED", created_at: "2026-09-26T06:00:00" },
    ]));
    render(<FeedbackManagementScreen justSent />);

    const sent = await screen.findByRole("region", { name: "보낸 기록 3개" });
    const rows = within(sent).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("상담, 이직 고민");
    expect(rows[0]).toHaveTextContent("신고");
    expect(rows[0]).toHaveTextContent("처리 상태: 확인하고 있어요");
    expect(rows[1]).toHaveTextContent("틀린 것 같아요");
    expect(rows[1]).toHaveTextContent("사주 정보가 잘못됐어요");
    expect(rows[1]).toHaveTextContent("시간이 달라요");
    expect(rows[1]).toHaveTextContent("접수했어요");
    expect(rows[2]).toHaveTextContent("리포트, 삭제된 리포트");
    expect(rows[2]).toHaveTextContent("확인을 마쳤어요");
    expect(screen.getByRole("status")).toHaveTextContent("피드백을 보냈어요");

    // 서버에 이미 보낸 기록(숫자 리포트)은 로컬 목록에서 빠지고, 미리보기 기록만 보조로 남는다.
    const local = screen.getByRole("region", { name: "이 기기에만 남은 이전 기록 1개" });
    expect(within(local).getAllByRole("article")).toHaveLength(1);
    expect(within(local).getByRole("link", { name: "사유 고치기" })).toHaveAttribute("href", "/settings/feedback/local-preview");
  });

  it("does not open a server session when nothing was ever sent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<FeedbackManagementScreen />);
    expect(await screen.findByRole("heading", { name: "아직 보낸 피드백이 없어요" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers a retry when the server list fails while still showing local entries", async () => {
    signIn();
    window.localStorage.setItem(FEEDBACK_LIST_KEY, JSON.stringify({ version: 1, entries: [localEntry("local-preview", "rpt_fixture_career")] }));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ code: "INTERNAL", message: "잠시 후 다시 시도해 주세요." }, 500)).mockResolvedValueOnce(json([]));
    render(<FeedbackManagementScreen />);

    expect(await screen.findByRole("alert")).toHaveTextContent("잠시 후 다시 시도해 주세요.");
    expect(screen.getByRole("region", { name: "이 기기에만 남은 이전 기록 1개" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});

describe("feedback form targets", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    push.mockReset();
    signIn();
  });
  afterEach(cleanup);

  it("sends a consultation answer report to the server and opens the list", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ id: 1, status: "RECEIVED", created_at: "2026-09-28T00:00:00" }, 201));
    render(<FeedbackScreen target={{ type: "consultation_message", sessionId: "4", messageId: "9" }} topicId="career" initialReported />);

    expect(screen.getByText("상담 답변")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "조금 애매해요" }));
    fireEvent.click(screen.getByRole("button", { name: "표현이 불쾌하거나 과해요" }));
    fireEvent.click(screen.getByRole("button", { name: "피드백 보내기" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/settings/feedback?sent=1"));
    expect(bodies(fetchMock, "/api/v1/feedback")).toEqual([{ consultation_message_id: 9, rating: "reported", detail_reason: "표현이 불쾌하거나 과해요", report_reason: "표현이 불쾌하거나 과해요" }]);
    expect(window.localStorage.getItem(FEEDBACK_LIST_KEY)).toBeNull();
  });

  it("sends a server report rating as the refined value without a local copy", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ id: 1, status: "RECEIVED", created_at: "2026-09-28T00:00:00" }, 201));
    render(<FeedbackScreen target={{ type: "report", reportId: "303" }} topicId="career" />);

    fireEvent.click(screen.getByRole("button", { name: "맞지 않아요" }));
    fireEvent.click(screen.getByRole("button", { name: "사주 정보가 잘못됐어요" }));
    fireEvent.click(screen.getByRole("button", { name: "피드백 보내기" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/settings/feedback?sent=1"));
    expect(bodies(fetchMock, "/api/v1/feedback")[0]).toMatchObject({ report_id: 303, rating: "inaccurate" });
    expect(window.localStorage.getItem(FEEDBACK_LIST_KEY)).toBeNull();
  });

  it("names a server topic report by its topic instead of the basic report", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ id: 1, status: "RECEIVED", created_at: "2026-09-28T00:00:00" }, 201));
    render(<FeedbackScreen target={{ type: "report", reportId: "71" }} topicId="career" topicReport />);

    expect(screen.getByText("커리어 리포트")).toBeInTheDocument();
    expect(screen.queryByText("기본 사주 리포트")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "도움이 됐어요" }));
    fireEvent.click(screen.getByRole("button", { name: "내용이 너무 일반적이에요" }));
    fireEvent.click(screen.getByRole("button", { name: "피드백 보내기" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/settings/feedback?sent=1"));
    expect(bodies(fetchMock, "/api/v1/feedback")[0]).toMatchObject({ report_id: 71, rating: "helpful" });
  });

  it("keeps fixture previews on this device as before", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<FeedbackScreen target={{ type: "report", reportId: "rpt_fixture_career" }} topicId="career" />);

    fireEvent.click(screen.getByRole("button", { name: "도움이 됐어요" }));
    fireEvent.click(screen.getByRole("button", { name: "내용이 너무 일반적이에요" }));
    fireEvent.click(screen.getByRole("button", { name: "피드백 보내기" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/report/save?topic=career&feedback=helpful"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(FEEDBACK_LIST_KEY)).toContain("rpt_fixture_career");
  });
});

describe("answer feedback under a consultation reply", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    signIn();
  });
  afterEach(cleanup);

  it("sends a quick rating once and links the problem report to the full form", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ id: 1, status: "RECEIVED", created_at: "2026-09-28T00:00:00" }, 201));
    render(<AnswerFeedback sessionId="4" messageId="9" topic="career" />);

    const group = screen.getByRole("group", { name: "이 답변 평가" });
    expect(within(group).getByRole("link", { name: "문제 신고" })).toHaveAttribute("href", "/report/feedback?targetType=consultation&sessionId=4&messageId=9&topic=career&report=1");
    fireEvent.click(within(group).getByRole("button", { name: "도움됐어요" }));

    expect(await screen.findByRole("status")).toHaveTextContent("의견을 보냈어요");
    expect(within(group).getByRole("button", { name: "도움됐어요" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "잘 모르겠어요" })).toBeDisabled();
    expect(bodies(fetchMock, "/api/v1/feedback")).toEqual([{ consultation_message_id: 9, rating: "helpful", detail_reason: null, report_reason: null }]);
  });

  it("explains a failed send and lets the person try again", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ code: "FORBIDDEN", message: "접근 권한이 없습니다." }, 403)).mockResolvedValueOnce(json({ id: 1, status: "RECEIVED", created_at: "2026-09-28T00:00:00" }, 201));
    render(<AnswerFeedback sessionId="4" messageId="9" topic="career" />);

    fireEvent.click(screen.getByRole("button", { name: "잘 모르겠어요" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("접근 권한이 없습니다.");
    fireEvent.click(screen.getByRole("button", { name: "잘 모르겠어요" }));
    expect(await screen.findByRole("status")).toHaveTextContent("의견을 보냈어요");
  });
});
