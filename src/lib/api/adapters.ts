import type { components } from "@/lib/api/generated";
import {
  maskBirthDate,
  maskBirthplace,
  maskBirthTime,
  type AdminCommand,
  type ApiErrorView,
  type AuditView,
  type CalculationGender,
  type CalendarKind,
  type CreditLedgerEntry,
  type CreditLedgerReason,
  type CreditLedgerSource,
  type FeedbackTarget,
  type FeedbackView,
  type JobStatus,
  type JobView,
  type LibraryAction,
  type LibraryItemView,
  type NotificationPreferenceView,
  type OrderStatus,
  type OrderView,
  type OwnerRelationship,
  type ProductView,
  type ProfileInput,
  type ProfileSummary,
  type TopicId,
} from "@/lib/contracts";

type Schema<Name extends keyof components["schemas"]> = components["schemas"][Name];

export class ApiContractError extends Error {
  readonly path: string;
  readonly value: unknown;

  constructor(path: string, value: unknown, message = "Unsupported API contract value") {
    super(`${message} at ${path}`);
    this.name = "ApiContractError";
    this.path = path;
    this.value = value;
  }
}

function invalid(path: string, value: unknown, message?: string): never {
  throw new ApiContractError(path, value, message);
}

function mapCalendar(value: Schema<"CalendarType">): CalendarKind {
  switch (value) {
    case "SOLAR": return "solar";
    case "LUNAR": return "lunar";
    default: return invalid("profile.calendar_type", value);
  }
}

function mapGender(value: Schema<"ProfileWrite">["gender_basis"]): CalculationGender {
  switch (value) {
    case "MALE": return "male";
    case "FEMALE": return "female";
    default: return invalid("profile.gender_basis", value);
  }
}

function mapRelationship(ownership: Schema<"ProfileWrite">["ownership"], relationship: string | null | undefined): Pick<ProfileInput, "profileType" | "ownerRelationship"> {
  switch (ownership) {
    case "SELF":
      if (relationship !== undefined && relationship !== null && relationship !== "SELF") {
        return invalid("profile.relationship", relationship, "A self profile cannot have a third-party relationship");
      }
      return { profileType: "self", ownerRelationship: "self" };
    case "OTHER":
      return { profileType: "other", ownerRelationship: mapOwnerRelationship(relationship) };
    default:
      return invalid("profile.ownership", ownership);
  }
}

function mapOwnerRelationship(value: string | null | undefined): OwnerRelationship {
  switch (value) {
    case "PARTNER": return "partner";
    case "FAMILY": return "family";
    case "FRIEND": return "friend";
    case "COWORKER":
    case "COLLEAGUE": return "coworker";
    default: return invalid("profile.relationship", value, "An other profile requires a supported relationship");
  }
}

function mapTopic(value: string): TopicId {
  switch (value) {
    case "LOVE": return "love";
    case "MARRIAGE": return "marriage";
    case "REUNION": return "reunion";
    case "CAREER": return "career";
    case "BUSINESS": return "business";
    case "MONEY": return "money";
    case "FAMILY": return "family";
    case "RELATIONSHIPS": return "relationships";
    case "OTHER": return "other";
    default: return invalid("profile.interests[]", value);
  }
}

function toWireRelationship(value: OwnerRelationship): string | null {
  switch (value) {
    case "self": return null;
    case "partner": return "PARTNER";
    case "family": return "FAMILY";
    case "friend": return "FRIEND";
    case "coworker": return "COWORKER";
    default: return invalid("profile.ownerRelationship", value);
  }
}

function toWireTopic(value: TopicId): string {
  switch (value) {
    case "love": return "LOVE";
    case "marriage": return "MARRIAGE";
    case "reunion": return "REUNION";
    case "career": return "CAREER";
    case "business": return "BUSINESS";
    case "money": return "MONEY";
    case "family": return "FAMILY";
    case "relationships": return "RELATIONSHIPS";
    case "other": return "OTHER";
    default: return invalid("profile.personalization.interests[]", value);
  }
}

export function toApiErrorView(error: Schema<"ApiError">): ApiErrorView {
  return {
    code: error.code,
    message: error.message,
    fieldErrors: error.field_errors,
    requestId: error.request_id || null,
    retryable: error.retryable,
  };
}

function mapJobStatus(value: Schema<"JobStatus">): JobStatus {
  switch (value) {
    case "QUEUED": return "queued";
    case "RUNNING": return "running";
    case "SUCCEEDED": return "succeeded";
    case "FAILED": return "failed";
    case "CANCELLED": return "canceled";
    default: return invalid("job.status", value);
  }
}

export function toJobView(job: Schema<"AsyncJob">): JobView<string> {
  return {
    id: job.job_id,
    status: mapJobStatus(job.status),
    progressPercent: null,
    result: job.resource_id ?? null,
    error: job.error_code
      ? { code: job.error_code, message: job.error_code, fieldErrors: {}, requestId: null, retryable: false }
      : null,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

export function toProfileInput(profile: Schema<"ProfileWrite">): ProfileInput {
  const calendar = mapCalendar(profile.calendar_type);
  if (calendar === "solar" && profile.lunar_leap_month) {
    return invalid("profile.lunar_leap_month", profile.lunar_leap_month, "A solar date cannot be a lunar leap month");
  }
  if (profile.birth_place === undefined || profile.birth_place === null) {
    return invalid("profile.birth_place", profile.birth_place, "Profile birthplace is required by the presentation contract");
  }
  const relationship = mapRelationship(profile.ownership, profile.relationship);
  return {
    displayName: profile.nickname,
    birthDate: profile.birth_date,
    calendar,
    leapMonth: profile.lunar_leap_month,
    birthTime: profile.birth_time ?? null,
    birthTimeUnknown: profile.birth_time_unknown,
    birthplace: profile.birth_place,
    timezone: profile.timezone,
    calculationGender: mapGender(profile.gender_basis),
    ...relationship,
    personalization: {
      interests: (profile.interests ?? []).map(mapTopic),
      relationshipStatus: profile.relationship_status ?? null,
      occupationStatus: profile.employment_status ?? null,
      primaryConcern: profile.current_concern ?? null,
    },
    thirdPartyConsent: profile.third_party_consent_confirmed,
  };
}

export function toProfileSummary(profile: Schema<"ProfileDetail">): ProfileSummary {
  const input = toProfileInput(profile);
  return {
    id: profile.profile_id,
    displayName: input.displayName,
    calendar: input.calendar,
    leapMonth: input.leapMonth,
    maskedBirthDate: maskBirthDate(input.birthDate),
    maskedBirthTime: maskBirthTime(input.birthTime, input.birthTimeUnknown),
    maskedBirthplace: maskBirthplace(input.birthplace),
    timezone: input.timezone,
    profileType: input.profileType,
    ownerRelationship: input.ownerRelationship,
    updatedAt: profile.updated_at,
  };
}

export function toProfileWrite(profile: ProfileInput, consentVersion: string): Schema<"ProfileWrite"> {
  if (profile.calendar === "solar" && profile.leapMonth) {
    return invalid("profile.leapMonth", profile.leapMonth, "A solar date cannot be a lunar leap month");
  }
  if (profile.profileType === "self" && profile.ownerRelationship !== "self") {
    return invalid("profile.ownerRelationship", profile.ownerRelationship, "A self profile must use the self relationship");
  }
  if (profile.profileType === "other" && profile.ownerRelationship === "self") {
    return invalid("profile.ownerRelationship", profile.ownerRelationship, "An other profile cannot use the self relationship");
  }
  const calendarType: Schema<"CalendarType"> = profile.calendar === "solar" ? "SOLAR" : profile.calendar === "lunar" ? "LUNAR" : invalid("profile.calendar", profile.calendar);
  const genderBasis: Schema<"ProfileWrite">["gender_basis"] = profile.calculationGender === "male" ? "MALE" : profile.calculationGender === "female" ? "FEMALE" : invalid("profile.calculationGender", profile.calculationGender);
  const ownership: Schema<"ProfileWrite">["ownership"] = profile.profileType === "self" ? "SELF" : profile.profileType === "other" ? "OTHER" : invalid("profile.profileType", profile.profileType);
  return {
    nickname: profile.displayName,
    ownership,
    relationship: toWireRelationship(profile.ownerRelationship),
    calendar_type: calendarType,
    lunar_leap_month: profile.leapMonth,
    birth_date: profile.birthDate,
    birth_time: profile.birthTime,
    birth_time_unknown: profile.birthTimeUnknown,
    birth_place: profile.birthplace,
    timezone: profile.timezone,
    gender_basis: genderBasis,
    interests: profile.personalization.interests.map(toWireTopic),
    relationship_status: profile.personalization.relationshipStatus,
    employment_status: profile.personalization.occupationStatus,
    current_concern: profile.personalization.primaryConcern,
    third_party_consent_confirmed: profile.thirdPartyConsent,
    consent_version: consentVersion,
  };
}

export function toProductView(product: Schema<"Product">): ProductView {
  return {
    id: product.product_id,
    slug: product.product_slug,
    version: product.version,
    status: product.status,
    kind: product.kind,
    title: product.title,
    description: product.description,
    priceAmount: product.price_minor,
    priceCurrency: product.currency,
    answersQuestions: [...product.answers_questions],
    requiredInputs: [...product.required_inputs],
    requiresBirthTime: product.requires_birth_time,
    includedSections: [...product.included_sections],
    generationMethod: product.generation_method,
    refundPolicy: product.refund_policy,
  };
}

export type OrderCreateIntent = {
  productId: string;
  chartSnapshotId: string;
  periodKey: string;
  provider: "WEB" | "APP";
  quantity: number;
};

export function toOrderCreateRequest(intent: OrderCreateIntent): Schema<"OrderCreateRequest"> {
  if (!intent.productId || !intent.chartSnapshotId || !intent.periodKey || !Number.isInteger(intent.quantity) || intent.quantity < 1 || intent.quantity > 10) {
    return invalid("orderCreate", intent, "Invalid server-authoritative order intent");
  }
  return {
    product_id: intent.productId,
    chart_id: intent.chartSnapshotId,
    period_key: intent.periodKey,
    provider: intent.provider,
    quantity: intent.quantity,
  };
}

function mapOrderStatus(value: Schema<"OrderStatus">): OrderStatus {
  switch (value) {
    case "CREATED": return "CREATED";
    case "PAYMENT_PENDING": return "PAYMENT_PENDING";
    case "PAID": return "PAID";
    case "FULFILLING": return "FULFILLING";
    case "COMPLETED": return "COMPLETED";
    case "FAILED": return "FAILED";
    case "REFUNDED": return "REFUNDED";
    default: return invalid("order.status", value);
  }
}

export function toOrderView(order: Schema<"Order">): OrderView {
  return {
    orderId: order.order_id,
    productId: order.product_id,
    productVersion: order.product_version,
    profileId: order.profile_id,
    chartSnapshotId: order.chart_id,
    periodKey: order.period_key,
    interpretationVersion: order.interpretation_version,
    status: mapOrderStatus(order.status),
    amount: order.amount_minor,
    currency: order.currency,
    provider: order.provider,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

function mapLedgerReason(value: Schema<"CreditLedgerEntry">["reason_type"]): CreditLedgerReason {
  switch (value) {
    case "PURCHASE": return "purchase";
    case "CONSULTATION_USE": return "consultation_use";
    case "REFUND": return "refund";
    case "ERROR_RECOVERY": return "error_recovery";
    case "ADMIN_ADJUSTMENT": return "admin_adjustment";
    default: return invalid("creditLedger.reason_type", value);
  }
}

export function toCreditLedgerEntry(entry: Schema<"CreditLedgerEntry">): CreditLedgerEntry {
  if (entry.order_id && entry.consultation_message_id) {
    return invalid("creditLedger", entry, "A ledger entry cannot have multiple sources");
  }
  let source: CreditLedgerSource = "system";
  let sourceId: string | null = null;
  if (entry.order_id) {
    source = "order";
    sourceId = entry.order_id;
  } else if (entry.consultation_message_id) {
    source = "consultation";
    sourceId = entry.consultation_message_id;
  } else if (entry.reason_type === "ADMIN_ADJUSTMENT") {
    source = "admin";
  }
  return {
    id: entry.ledger_id,
    delta: entry.delta,
    balanceAfter: entry.balance_after,
    source,
    sourceId,
    reason: mapLedgerReason(entry.reason_type),
    description: entry.operation_reason ?? "",
    createdAt: entry.created_at,
  };
}

function mapLibraryAction(value: Schema<"LibraryAction">): LibraryAction {
  switch (value) {
    case "open": return "open";
    case "mark_read": return "mark_read";
    case "hide": return "hide";
    case "unhide": return "unhide";
    case "delete": return "delete";
    default: return invalid("library.allowed_actions[]", value);
  }
}

function mapLibraryType(value: Schema<"LibraryItemType">): LibraryItemView["type"] {
  switch (value) {
    case "report": return "report";
    case "consultation": return "consultation";
    case "compatibility": return "compatibility";
    default: return invalid("library.type", value);
  }
}

function mapLibraryAccess(value: Schema<"LibraryAccess">): LibraryItemView["access"] {
  switch (value) {
    case "available": return "available";
    case "locked": return "locked";
    case "expired": return "expired";
    default: return invalid("library.access", value);
  }
}

function mapLibraryTopic(value: Schema<"LibraryTopic"> | null): TopicId | null {
  switch (value) {
    case null: return null;
    case "love": return "love";
    case "marriage": return "marriage";
    case "reunion": return "reunion";
    case "career": return "career";
    case "business": return "business";
    case "money": return "money";
    case "family": return "family";
    case "relationships": return "relationships";
    case "other": return "other";
    default: return invalid("library.topic", value);
  }
}

export function toLibraryItemView(item: Schema<"LibraryItem">): LibraryItemView {
  const allowedActions = item.allowed_actions.map(mapLibraryAction);
  if (new Set(allowedActions).size !== allowedActions.length) {
    return invalid("library.allowed_actions", item.allowed_actions, "Library actions must be unique");
  }
  if (item.purchased && allowedActions.includes("delete")) {
    return invalid("library.allowed_actions", item.allowed_actions, "A purchased library item cannot be deleted");
  }
  return {
    id: item.id,
    type: mapLibraryType(item.type),
    title: item.title,
    subtitle: item.subtitle,
    href: item.href,
    access: mapLibraryAccess(item.access),
    purchased: item.purchased,
    read: item.read,
    hidden: item.hidden,
    profile: { id: item.profile.id, displayName: item.profile.display_name },
    topic: mapLibraryTopic(item.topic),
    createdAt: item.created_at,
    allowedActions,
  };
}

function mapNotificationChannel(value: Schema<"NotificationChannel">): NotificationPreferenceView["channel"] {
  switch (value) {
    case "push": return "push";
    case "email": return "email";
    default: return invalid("notification.channel", value);
  }
}

export function toNotificationPreferenceView(preferences: Schema<"NotificationPreferences">): NotificationPreferenceView {
  return {
    channel: mapNotificationChannel(preferences.channel),
    enabled: preferences.enabled,
    topics: { ...preferences.topics },
    quietHours: { ...preferences.quiet_hours },
    suppressDuplicates: preferences.suppress_duplicates,
  };
}

export function toNotificationPreferencesWrite(preferences: NotificationPreferenceView): Schema<"NotificationPreferencesWrite"> {
  return {
    channel: mapNotificationChannel(preferences.channel),
    enabled: preferences.enabled,
    topics: { ...preferences.topics },
    quiet_hours: { ...preferences.quietHours },
    suppress_duplicates: preferences.suppressDuplicates,
  };
}

function mapFeedbackTarget(target: Schema<"FeedbackTarget">): FeedbackTarget {
  switch (target.target_type) {
    case "REPORT": return { type: "report", reportId: target.target_id };
    case "CONSULTATION_MESSAGE": return { type: "consultation_message", sessionId: target.session_id, messageId: target.target_id };
    case "COMPATIBILITY": return { type: "compatibility", compatibilityId: target.target_id };
    default: return invalid("feedback.target.target_type", target);
  }
}

function toWireFeedbackTarget(target: FeedbackTarget): Schema<"FeedbackTarget"> {
  switch (target.type) {
    case "report": return { target_type: "REPORT", target_id: target.reportId };
    case "consultation_message": return { target_type: "CONSULTATION_MESSAGE", target_id: target.messageId, session_id: target.sessionId };
    case "compatibility": return { target_type: "COMPATIBILITY", target_id: target.compatibilityId };
    default: return invalid("feedback.target.type", target);
  }
}

function mapFeedbackRating(value: Schema<"FeedbackRating">): FeedbackView["rating"] {
  switch (value) {
    case "HELPFUL": return "helpful";
    case "UNCLEAR": return "unclear";
    case "WRONG": return "wrong";
    default: return invalid("feedback.rating", value);
  }
}

function toWireFeedbackRating(value: FeedbackView["rating"]): Schema<"FeedbackRating"> {
  switch (value) {
    case "helpful": return "HELPFUL";
    case "unclear": return "UNCLEAR";
    case "wrong": return "WRONG";
    default: return invalid("feedback.rating", value);
  }
}

function mapFeedbackReason(value: Schema<"FeedbackReason">): FeedbackView["reason"] {
  switch (value) {
    case "TOO_GENERIC": return "too_generic";
    case "REPETITIVE": return "repetitive";
    case "INCORRECT_CHART": return "incorrect_chart";
    case "UNANSWERED": return "unanswered";
    case "INAPPROPRIATE": return "inappropriate";
    case "PURCHASE_MISMATCH": return "purchase_mismatch";
    case "OTHER": return "other";
    default: return invalid("feedback.reason", value);
  }
}

function toWireFeedbackReason(value: FeedbackView["reason"]): Schema<"FeedbackReason"> {
  switch (value) {
    case "too_generic": return "TOO_GENERIC";
    case "repetitive": return "REPETITIVE";
    case "incorrect_chart": return "INCORRECT_CHART";
    case "unanswered": return "UNANSWERED";
    case "inappropriate": return "INAPPROPRIATE";
    case "purchase_mismatch": return "PURCHASE_MISMATCH";
    case "other": return "OTHER";
    default: return invalid("feedback.reason", value);
  }
}

export function toFeedbackView(result: Schema<"FeedbackResult">): FeedbackView {
  if (result.lineage.chart_snapshot_ids.length === 0 || new Set(result.lineage.chart_snapshot_ids).size !== result.lineage.chart_snapshot_ids.length) {
    return invalid("feedback.lineage.chart_snapshot_ids", result.lineage.chart_snapshot_ids, "Feedback lineage requires unique chart snapshots");
  }
  return {
    id: result.feedback_id,
    target: mapFeedbackTarget(result.target),
    rating: mapFeedbackRating(result.rating),
    reason: mapFeedbackReason(result.reason),
    comment: result.comment,
    provenance: {
      profileSnapshotId: result.lineage.profile_snapshot_id,
      chartSnapshotIds: [...result.lineage.chart_snapshot_ids],
      modelVersion: result.provenance.model_version,
      promptVersion: result.provenance.prompt_version,
      templateVersion: result.provenance.template_version,
    },
    createdAt: result.created_at,
  };
}

export function toFeedbackRequest(feedback: Pick<FeedbackView, "target" | "rating" | "reason" | "comment"> & { reported: boolean }): Schema<"FeedbackRequest"> {
  return {
    target: toWireFeedbackTarget(feedback.target),
    rating: toWireFeedbackRating(feedback.rating),
    reason: toWireFeedbackReason(feedback.reason),
    comment: feedback.comment,
    reported: feedback.reported,
  };
}

function mapAdminCommandType(value: Schema<"AdminCommandType">): AdminCommand["type"] {
  switch (value) {
    case "restrict_account": return "restrict_account";
    case "restore_account": return "restore_account";
    case "process_deletion": return "process_deletion";
    case "refund_order": return "refund_order";
    case "grant_credits": return "grant_credits";
    case "regenerate_report": return "regenerate_report";
    case "hide_report": return "hide_report";
    case "restore_credits": return "restore_credits";
    case "restrict_sensitive_access": return "restrict_sensitive_access";
    default: return invalid("audit.command.command_type", value);
  }
}

function mapAdminTargetType(value: Schema<"AdminTargetType">): AdminCommand["targetType"] {
  switch (value) {
    case "account": return "account";
    case "profile": return "profile";
    case "order": return "order";
    case "report": return "report";
    case "consultation": return "consultation";
    default: return invalid("audit.command.target_type", value);
  }
}

function toAdminCommand(command: Schema<"AdminCommandRequest">): AdminCommand {
  return {
    type: mapAdminCommandType(command.command_type),
    targetType: mapAdminTargetType(command.target_type),
    targetId: command.target_id,
    reason: command.reason,
    expectedVersion: command.expected_version,
  };
}

function mapAdminOutcome(value: Schema<"AdminCommandOutcome">): AuditView["outcome"] {
  switch (value) {
    case "accepted": return "accepted";
    case "rejected": return "rejected";
    case "failed": return "failed";
    default: return invalid("audit.outcome", value);
  }
}

export function toAuditView(audit: Schema<"AuditLog">): AuditView {
  return {
    id: audit.audit_id,
    actorId: audit.actor_id,
    actorRole: audit.actor_role,
    command: toAdminCommand(audit.command),
    outcome: mapAdminOutcome(audit.outcome),
    occurredAt: audit.created_at,
  };
}
