import { describe, expect, it } from "vitest";
import type { components } from "@/lib/api/generated";
import {
  ApiContractError,
  toApiErrorView,
  toAuditView,
  toCreditLedgerEntry,
  toFeedbackRequest,
  toFeedbackView,
  toJobView,
  toLibraryItemView,
  toNotificationPreferencesWrite,
  toNotificationPreferenceView,
  toOrderCreateRequest,
  toOrderView,
  toProductView,
  toProfileInput,
  toProfileSummary,
  toProfileWrite,
} from "@/lib/api/adapters";

type Schema<Name extends keyof components["schemas"]> = components["schemas"][Name];

const profileWrite: Schema<"ProfileWrite"> = {
  nickname: "민수",
  ownership: "OTHER",
  relationship: "PARTNER",
  calendar_type: "LUNAR",
  lunar_leap_month: true,
  birth_date: "1990-05-12",
  birth_time: "14:30",
  birth_time_unknown: false,
  birth_place: "서울특별시",
  timezone: "Asia/Seoul",
  gender_basis: "MALE",
  interests: ["LOVE", "CAREER"],
  relationship_status: "dating",
  employment_status: "employed",
  current_concern: "career",
  third_party_consent_confirmed: true,
  consent_version: "v2",
};

const libraryItem: Schema<"LibraryItem"> = {
  id: "library-1",
  type: "report",
  title: "리포트",
  subtitle: "요약",
  href: "/reports/1",
  access: "available",
  purchased: false,
  read: false,
  hidden: false,
  profile: { id: "profile-1", display_name: "민수" },
  topic: "career",
  created_at: "2026-08-25T00:00:00Z",
  allowed_actions: ["open", "mark_read", "hide", "delete"],
};

const preferences: Schema<"NotificationPreferences"> = {
  channel: "push",
  enabled: true,
  topics: {
    payment_completed: true,
    monthly_flow: false,
    important_period: true,
    report_completed: true,
    consultation_completed: true,
    low_credits: false,
    resume_consultation: false,
    interest_change: true,
  },
  quiet_hours: { enabled: true, start: "22:00", end: "07:00", timezone: "Asia/Seoul" },
  suppress_duplicates: true,
};

describe("API presentation adapters", () => {
  it("maps API errors and finite async job statuses", () => {
    expect(toApiErrorView({
      code: "INVALID_INPUT",
      message: "Invalid input",
      field_errors: { birth_date: ["Required"] },
      request_id: "request-1",
      retryable: false,
    })).toEqual({
      code: "INVALID_INPUT",
      message: "Invalid input",
      fieldErrors: { birth_date: ["Required"] },
      requestId: "request-1",
      retryable: false,
    });

    const job: Schema<"AsyncJob"> = {
      job_id: "job-1",
      job_type: "REPORT_GENERATION",
      status: "CANCELLED",
      attempt_count: 1,
      idempotency_key: "idem-1",
      resource_id: "report-1",
      created_at: "2026-08-25T00:00:00Z",
      updated_at: "2026-08-25T00:01:00Z",
    };
    expect(toJobView(job)).toMatchObject({ id: "job-1", status: "canceled", result: "report-1" });
    expect(() => toJobView({ ...job, status: "PAUSED" as never })).toThrow(ApiContractError);
  });

  it("maps profile writes in both directions and masks profile details", () => {
    const input = toProfileInput(profileWrite);
    expect(input).toMatchObject({
      displayName: "민수",
      calendar: "lunar",
      leapMonth: true,
      calculationGender: "male",
      profileType: "other",
      ownerRelationship: "partner",
      personalization: { interests: ["love", "career"] },
    });
    expect(toProfileWrite(input, "v3")).toMatchObject({
      ownership: "OTHER",
      relationship: "PARTNER",
      calendar_type: "LUNAR",
      gender_basis: "MALE",
      interests: ["LOVE", "CAREER"],
      consent_version: "v3",
    });

    const detail: Schema<"ProfileDetail"> = {
      ...profileWrite,
      profile_id: "profile-1",
      created_at: "2026-08-24T00:00:00Z",
      updated_at: "2026-08-25T00:00:00Z",
    };
    expect(toProfileSummary(detail)).toMatchObject({
      id: "profile-1",
      maskedBirthDate: "1990. **. **",
      maskedBirthTime: "14:**",
      maskedBirthplace: "서****",
    });
  });

  it("rejects solar leap months and unsupported profile enums", () => {
    expect(() => toProfileInput({ ...profileWrite, calendar_type: "SOLAR", lunar_leap_month: true })).toThrow(ApiContractError);
    expect(() => toProfileInput({ ...profileWrite, relationship: "ACQUAINTANCE" })).toThrow(ApiContractError);
    expect(() => toProfileInput({ ...profileWrite, interests: ["HEALTH"] })).toThrow(ApiContractError);
    expect(() => toProfileInput({ ...profileWrite, birth_place: null as never })).toThrow(ApiContractError);
  });

  it("maps products, orders, and credit ledger entries", () => {
    expect(toProductView({
      product_id: "product-1",
      product_slug: "consultation-10",
      version: "1",
      status: "active",
      kind: "consultation_credit",
      title: "상담 10회",
      description: "상담 이용권",
      price_minor: 9900,
      currency: "KRW",
      answers_questions: ["상담을 몇 번 이용할 수 있나요?"],
      required_inputs: ["계정"],
      requires_birth_time: false,
      included_sections: ["상담 10회"],
      generation_method: "결제 확인 뒤 원장 지급",
      refund_policy: "미사용분 기준",
    })).toMatchObject({
      id: "product-1",
      slug: "consultation-10",
      kind: "consultation_credit",
      status: "active",
      priceAmount: 9900,
    });

    const order: Schema<"Order"> = {
      order_id: "order-1",
      product_id: "product-1",
      product_version: "1",
      profile_id: "profile-1",
      chart_id: "chart-1",
      period_key: "2026",
      interpretation_version: "fixture-1",
      provider: "WEB",
      quantity: 1,
      amount_minor: 9900,
      currency: "KRW",
      status: "PAID",
      created_at: "2026-08-25T00:00:00Z",
      updated_at: "2026-08-25T00:01:00Z",
    };
    expect(toOrderCreateRequest({ productId: "product-1", chartSnapshotId: "chart-1", periodKey: "2026", provider: "WEB", quantity: 1 })).toEqual({ product_id: "product-1", chart_id: "chart-1", period_key: "2026", provider: "WEB", quantity: 1 });
    expect(toOrderView(order)).toMatchObject({ orderId: "order-1", chartSnapshotId: "chart-1", status: "PAID", provider: "WEB" });
    expect(() => toOrderView({ ...order, status: "VOID" as never })).toThrow(ApiContractError);

    expect(toCreditLedgerEntry({
      ledger_id: "ledger-1",
      reason_type: "PURCHASE",
      delta: 10,
      balance_after: 20,
      order_id: "order-1",
      operation_reason: "purchase",
      created_at: "2026-08-25T00:02:00Z",
    })).toMatchObject({ id: "ledger-1", reason: "purchase", source: "order", sourceId: "order-1" });
  });

  it("maps feedback targets, enums, and immutable lineage in both directions", () => {
    const result: Schema<"FeedbackResult"> = {
      feedback_id: "feedback-1",
      target: { target_type: "CONSULTATION_MESSAGE", target_id: "message-1", session_id: "session-1" },
      rating: "UNCLEAR",
      reason: "UNANSWERED",
      comment: "질문과 연결이 약해요.",
      lineage: { profile_snapshot_id: "profile-snapshot-1", chart_snapshot_ids: ["chart-1"] },
      provenance: { model_version: "model-1", prompt_version: "prompt-1", template_version: "template-1" },
      created_at: "2026-08-25T00:00:00Z",
      request_id: "request-1",
      server_time: "2026-08-25T00:00:01Z",
    };
    const view = toFeedbackView(result);
    expect(view).toMatchObject({
      target: { type: "consultation_message", sessionId: "session-1", messageId: "message-1" },
      rating: "unclear",
      reason: "unanswered",
      provenance: { profileSnapshotId: "profile-snapshot-1", chartSnapshotIds: ["chart-1"] },
    });
    expect(toFeedbackRequest({ target: view.target, rating: view.rating, reason: view.reason, comment: view.comment, reported: false })).toEqual({
      target: { target_type: "CONSULTATION_MESSAGE", target_id: "message-1", session_id: "session-1" },
      rating: "UNCLEAR",
      reason: "UNANSWERED",
      comment: "질문과 연결이 약해요.",
      reported: false,
    });
    expect(() => toFeedbackView({ ...result, lineage: { ...result.lineage, chart_snapshot_ids: [] } })).toThrow(ApiContractError);
  });

  it("rejects ambiguous credit ledger sources", () => {
    expect(() => toCreditLedgerEntry({
      ledger_id: "ledger-1",
      reason_type: "REFUND",
      delta: -1,
      balance_after: 0,
      order_id: "order-1",
      consultation_message_id: "message-1",
      created_at: "2026-08-25T00:00:00Z",
    })).toThrow(ApiContractError);
  });

  it("preserves validated server library actions and rejects purchased delete", () => {
    expect(toLibraryItemView(libraryItem)).toMatchObject({
      id: "library-1",
      profile: { id: "profile-1", displayName: "민수" },
      topic: "career",
      allowedActions: ["open", "mark_read", "hide", "delete"],
    });
    expect(() => toLibraryItemView({ ...libraryItem, purchased: true, allowed_actions: ["open", "delete"] })).toThrow(ApiContractError);
    expect(() => toLibraryItemView({ ...libraryItem, allowed_actions: ["download" as never] })).toThrow(ApiContractError);
  });

  it("maps notification preferences in both directions", () => {
    const view = toNotificationPreferenceView(preferences);
    expect(view).toMatchObject({
      channel: "push",
      quietHours: { start: "22:00", end: "07:00" },
      suppressDuplicates: true,
    });
    expect(toNotificationPreferencesWrite(view)).toEqual({
      channel: preferences.channel,
      enabled: preferences.enabled,
      topics: preferences.topics,
      quiet_hours: preferences.quiet_hours,
      suppress_duplicates: preferences.suppress_duplicates,
    });
  });

  it("maps audit logs and rejects invalid command enums", () => {
    const audit: Schema<"AuditLog"> = {
      audit_id: "audit-1",
      actor_id: "admin-1",
      actor_role: "support",
      command: {
        command_type: "refund_order",
        target_type: "order",
        target_id: "order-1",
        expected_version: "2",
        reason: "duplicate payment",
      },
      outcome: "accepted",
      request_id: "request-1",
      before_evidence: null,
      after_evidence: null,
      created_at: "2026-08-25T00:00:00Z",
    };
    expect(toAuditView(audit)).toEqual({
      id: "audit-1",
      actorId: "admin-1",
      actorRole: "support",
      command: {
        type: "refund_order",
        targetType: "order",
        targetId: "order-1",
        reason: "duplicate payment",
        expectedVersion: "2",
      },
      outcome: "accepted",
      occurredAt: "2026-08-25T00:00:00Z",
    });
    expect(() => toAuditView({ ...audit, command: { ...audit.command, command_type: "erase_everything" as never } })).toThrow(ApiContractError);
  });
});
