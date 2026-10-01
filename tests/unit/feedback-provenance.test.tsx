import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { FeedbackScreen } from "@/components/saju-screens";
import { FeedbackManagementScreen } from "@/components/settings-screens";
import { FIXTURE_FEEDBACK_PROVENANCE, UNKNOWN_FEEDBACK_PROVENANCE, reportFeedbackProvenance } from "@/lib/feedback-provenance";
import { feedbackListStore, feedbackStore } from "@/lib/storage";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const AUTH_KEY = "sajurium.sasaju-auth.v1";
const JOURNEY_KEY = "sajurium.server-journey.v1";
const FEEDBACK_KEY = "sajurium-saju-feedback";
const FEEDBACK_LIST_KEY = "sajurium-feedback-list";

const OLD_PROVENANCE = { profileSnapshotId: "profile_snapshot_fixture_primary", chartSnapshotIds: ["chart_fixture_primary"], modelVersion: null, promptVersion: null, templateVersion: "fixture-1" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function rate(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "도움이 됐어요" }));
  fireEvent.click(screen.getByRole("button", { name: "내용이 너무 일반적이에요" }));
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("report feedback provenance", () => {
  it("takes profile and chart from the journey that produced this report", () => {
    expect(reportFeedbackProvenance("303", { profileId: "11", chartId: "22", reportId: "303" })).toEqual({
      profileSnapshotId: "11",
      chartSnapshotIds: ["22"],
      modelVersion: null,
      promptVersion: null,
      templateVersion: null,
    });
  });

  it("records unknown fields instead of fixture values without a matching journey", () => {
    expect(reportFeedbackProvenance("303", null)).toEqual(UNKNOWN_FEEDBACK_PROVENANCE);
    expect(reportFeedbackProvenance("303", { profileId: "11", chartId: "22", reportId: "999" })).toEqual(UNKNOWN_FEEDBACK_PROVENANCE);
    const unknown = reportFeedbackProvenance("303", null);
    expect(unknown.profileSnapshotId).not.toBe(FIXTURE_FEEDBACK_PROVENANCE.profileSnapshotId);
    expect(unknown.chartSnapshotIds).toBeNull();
    expect(unknown.templateVersion).toBeNull();
  });

  it("gives fixture provenance only to fixture targets", () => {
    expect(reportFeedbackProvenance("rpt_fixture_career", { profileId: "11", chartId: "22", reportId: "303" })).toEqual(FIXTURE_FEEDBACK_PROVENANCE);
  });
});

describe("stored feedback provenance", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    push.mockReset();
  });
  afterEach(cleanup);

  it("still reads entries written before unknown fields existed", () => {
    const entry = { id: "feedback-old", target: { type: "report", reportId: "rpt_fixture_career" }, topic: "career", rating: "helpful", reason: "too_generic", comment: "", provenance: OLD_PROVENANCE, reported: false, createdAt: "2026-08-25T00:00:00.000Z" };
    window.localStorage.setItem(FEEDBACK_LIST_KEY, JSON.stringify({ version: 1, entries: [entry] }));
    const { id: _id, ...record } = entry;
    void _id;
    window.localStorage.setItem(FEEDBACK_KEY, JSON.stringify({ version: 1, ...record }));

    expect(feedbackListStore.inspect()).toMatchObject({ status: "ok", value: { entries: [{ id: "feedback-old", provenance: OLD_PROVENANCE }] } });
    expect(feedbackStore.inspect()).toMatchObject({ status: "ok", value: { provenance: OLD_PROVENANCE } });
  });

  it("accepts unknown fields but still rejects malformed known values", () => {
    const base = { id: "feedback-1", target: { type: "report", reportId: "303" }, topic: "career" as const, rating: "helpful" as const, reason: "too_generic" as const, comment: "", reported: false, createdAt: "2026-09-28T00:00:00.000Z" };
    expect(feedbackListStore.write({ version: 1, entries: [{ ...base, target: { type: "report", reportId: "303" }, provenance: UNKNOWN_FEEDBACK_PROVENANCE }] })).toBe(true);
    expect(feedbackListStore.write({ version: 1, entries: [{ ...base, target: { type: "report", reportId: "303" }, provenance: { ...UNKNOWN_FEEDBACK_PROVENANCE, profileSnapshotId: "" } }] })).toBe(false);
    expect(feedbackListStore.write({ version: 1, entries: [{ ...base, target: { type: "report", reportId: "303" }, provenance: { ...UNKNOWN_FEEDBACK_PROVENANCE, chartSnapshotIds: [] } }] })).toBe(false);
  });

  it("stores real-report and fixture feedback with different provenance", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
    window.localStorage.setItem(JOURNEY_KEY, JSON.stringify({ profileId: "11", chartId: "22", reportId: "303" }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ id: 1, status: "RECEIVED", created_at: "2026-09-28T00:00:00" }, 201));

    render(<FeedbackScreen target={{ type: "report", reportId: "303" }} topicId="career" />);
    rate("피드백 보내기");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/settings/feedback?sent=1"));
    const real = feedbackStore.read();
    expect(real?.target).toEqual({ type: "report", reportId: "303" });
    expect(real?.provenance).toEqual({ profileSnapshotId: "11", chartSnapshotIds: ["22"], modelVersion: null, promptVersion: null, templateVersion: null });
    expect(window.localStorage.getItem(FEEDBACK_LIST_KEY)).toBeNull();
    cleanup();

    render(<FeedbackScreen target={{ type: "report", reportId: "rpt_fixture_career" }} topicId="career" />);
    rate("피드백 보내기");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/report/save?topic=career&feedback=helpful"));
    const fixture = feedbackStore.read();
    expect(fixture?.provenance).toEqual(FIXTURE_FEEDBACK_PROVENANCE);
    expect(feedbackListStore.read()?.entries[0].provenance).toEqual(FIXTURE_FEEDBACK_PROVENANCE);
    expect(fixture?.provenance).not.toEqual(real?.provenance);
  });

  it("records unknown provenance for a real report without a journey", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ id: 1, status: "RECEIVED", created_at: "2026-09-28T00:00:00" }, 201));

    render(<FeedbackScreen target={{ type: "report", reportId: "303" }} topicId="career" />);
    rate("피드백 보내기");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/settings/feedback?sent=1"));
    expect(feedbackStore.read()?.provenance).toEqual(UNKNOWN_FEEDBACK_PROVENANCE);
  });

  it("keeps the feedback list rendering with old and unknown provenance entries", async () => {
    const entry = (id: string, reportId: string, provenance: unknown) => ({ id, target: { type: "report", reportId }, topic: "career", rating: "helpful", reason: "too_generic", comment: "", provenance, reported: false, createdAt: "2026-08-25T00:00:00.000Z" });
    window.localStorage.setItem(FEEDBACK_LIST_KEY, JSON.stringify({ version: 1, entries: [entry("old", "rpt_fixture_career", OLD_PROVENANCE), entry("unknown", "rpt_fixture_love", UNKNOWN_FEEDBACK_PROVENANCE)] }));
    render(<FeedbackManagementScreen />);

    expect(await screen.findByRole("region", { name: "이 기기에만 남은 이전 기록 2개" })).toBeInTheDocument();
  });
});
