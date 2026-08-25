/** Stable presentation contracts. These types intentionally do not mirror wire DTOs. */

export type IsoDate = string;
export type IsoDateTime = string;
export type CalendarKind = "solar" | "lunar";
export type CalculationGender = "male" | "female";
export type ProfileType = "self" | "other";
export type OwnerRelationship = "self" | "partner" | "family" | "friend" | "coworker";
export type TopicId = "love" | "marriage" | "reunion" | "career" | "business" | "money" | "family" | "relationships" | "other";

export interface ProfilePersonalization {
  interests: TopicId[];
  relationshipStatus: string | null;
  occupationStatus: string | null;
  primaryConcern: string | null;
}

export interface ProfileInput {
  displayName: string;
  birthDate: IsoDate;
  calendar: CalendarKind;
  /** Must be false for a solar date. */
  leapMonth: boolean;
  birthTime: string | null;
  birthTimeUnknown: boolean;
  birthplace: string;
  timezone: string;
  calculationGender: CalculationGender;
  profileType: ProfileType;
  ownerRelationship: OwnerRelationship;
  personalization: ProfilePersonalization;
  /** Required for a profile describing somebody other than the account owner. */
  thirdPartyConsent: boolean;
}

export interface ProfileSummary {
  id: string;
  displayName: string;
  calendar: CalendarKind;
  leapMonth: boolean;
  maskedBirthDate: string;
  maskedBirthTime: string;
  maskedBirthplace: string;
  timezone: string;
  profileType: ProfileType;
  ownerRelationship: OwnerRelationship;
  updatedAt: IsoDateTime;
}

export function hasValidLeapMonthSemantics(profile: Pick<ProfileInput, "calendar" | "leapMonth">): boolean {
  return profile.calendar === "lunar" || !profile.leapMonth;
}

export function maskBirthDate(value: string): string {
  const year = /^\d{4}/.exec(value)?.[0] ?? "****";
  return `${year}. **. **`;
}

export function maskBirthTime(value: string | null, unknown: boolean): string {
  if (unknown || value === null) return "시간 미상";
  const hour = /^([01]\d|2[0-3]):[0-5]\d$/.exec(value)?.[1] ?? "**";
  return `${hour}:**`;
}

export function maskBirthplace(value: string): string {
  const characters = Array.from(value.trim());
  if (characters.length === 0) return "***";
  return `${characters[0]}${"*".repeat(Math.max(2, characters.length - 1))}`;
}

export function toProfileSummary(profile: ProfileInput & { id: string; updatedAt: IsoDateTime }): ProfileSummary {
  return {
    id: profile.id,
    displayName: profile.displayName,
    calendar: profile.calendar,
    leapMonth: profile.leapMonth,
    maskedBirthDate: maskBirthDate(profile.birthDate),
    maskedBirthTime: maskBirthTime(profile.birthTime, profile.birthTimeUnknown),
    maskedBirthplace: maskBirthplace(profile.birthplace),
    timezone: profile.timezone,
    profileType: profile.profileType,
    ownerRelationship: profile.ownerRelationship,
    updatedAt: profile.updatedAt,
  };
}

export interface ChartSnapshotMeta {
  snapshotId: string;
  profileId: string;
  inputHash: string;
  calculationEngineVersion: string;
  calculationMethod: string;
  timezone: string;
  calendarConversionVersion: string;
  createdAt: IsoDateTime;
}

export const JOB_STATUSES = ["queued", "running", "succeeded", "failed", "canceled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobView<Result = unknown> {
  id: string;
  status: JobStatus;
  progressPercent: number | null;
  result: Result | null;
  error: ApiErrorView | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ContentProvenance {
  chartSnapshotId: string;
  interpretationVersion: string;
  modelVersion: string | null;
  promptVersion: string | null;
  templateVersion: string;
  generatedAt: IsoDateTime;
}

export interface ReportSectionView {
  id: string;
  heading: string;
  body: string[];
  evidence: string[];
  access: "free" | "paid";
}

export interface ReportView {
  id: string;
  profileId: string;
  productId: string | null;
  title: string;
  summary: string;
  strengths: string[];
  patterns: string[];
  sections: ReportSectionView[];
  limitations: string[];
  provenance: ContentProvenance;
  createdAt: IsoDateTime;
}

export interface DailyFlowView {
  kind: "daily";
  profileId: string;
  date: IsoDate;
  headline: string;
  priorityArea: "relationship" | "career" | "money";
  summary: string;
  caution: string;
  suggestedQuestion: string;
  provenance: ContentProvenance;
}

export interface MonthlyFlowView {
  kind: "monthly";
  profileId: string;
  month: string;
  headline: string;
  overview: string;
  earlyPeriod: string;
  middlePeriod: string;
  latePeriod: string;
  relationship: string;
  career: string;
  money: string;
  cautionPeriods: string[];
  opportunityPeriods: string[];
  provenance: ContentProvenance;
}

export interface YearFlowView {
  kind: "year";
  profileId: string;
  year: number;
  headline: string;
  coreThemes: string[];
  monthlyChanges: Array<{ month: number; summary: string }>;
  relationship: string;
  career: string;
  money: string;
  newAttempts: string;
  reviewPeriods: string[];
  provenance: ContentProvenance;
}

export interface ConsultationContext {
  profileId: string;
  chartSnapshotId: string;
  periodKey: string;
  topic: TopicId;
  situation: string | null;
  referencedProfileIds: string[];
}

export const CONSULTATION_SESSION_STATUSES = ["active", "completed", "failed", "deleted"] as const;
export type ConsultationSessionStatus = (typeof CONSULTATION_SESSION_STATUSES)[number];
export const CONSULTATION_MESSAGE_STATUSES = ["pending", "generating", "completed", "restricted", "failed"] as const;
export type ConsultationMessageStatus = (typeof CONSULTATION_MESSAGE_STATUSES)[number];

export interface ConsultationMessageView {
  id: string;
  role: "user" | "assistant";
  status: ConsultationMessageStatus;
  content: string | null;
  createdAt: IsoDateTime;
  completedAt: IsoDateTime | null;
  provenance: ContentProvenance | null;
}

export interface ConsultationSessionView {
  id: string;
  title: string;
  status: ConsultationSessionStatus;
  context: ConsultationContext;
  messages: ConsultationMessageView[];
  summary: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CompatibilityPersonSnapshot {
  profileId: string;
  displayName: string;
  maskedBirthYear: string;
  birthTimeUnknown: boolean;
  chartSnapshotId: string;
}

export interface CompatibilitySnapshot {
  id: string;
  relationshipType: "dating" | "marriage" | "family" | "friend" | "business";
  personA: CompatibilityPersonSnapshot;
  personB: CompatibilityPersonSnapshot;
  summary: string;
  strengths: string[];
  cautions: string[];
  provenance: ContentProvenance;
  createdAt: IsoDateTime;
}

export type ProductStatus = "draft" | "active" | "retired";
export interface ProductView {
  id: string;
  slug: string;
  version: string;
  status: ProductStatus;
  kind: "report" | "consultation_credit" | "subscription";
  title: string;
  description: string;
  answersQuestions: string[];
  requiredInputs: string[];
  priceAmount: number;
  priceCurrency: string;
  requiresBirthTime: boolean;
  includedSections: string[];
  generationMethod: string;
  refundPolicy: string;
}

export const ORDER_STATUSES = ["CREATED", "PAYMENT_PENDING", "PAID", "FULFILLING", "COMPLETED", "FAILED", "REFUNDED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export interface OrderView {
  orderId: string;
  productId: string;
  productVersion: string;
  profileId: string;
  chartSnapshotId: string;
  periodKey: string;
  interpretationVersion: string;
  status: OrderStatus;
  amount: number;
  currency: string;
  provider: "WEB" | "APP";
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export const GENERATION_STATUSES = ["payment_pending", "queued", "generating", "completed", "failed", "refunded", "expired"] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];
export interface GenerationView {
  id: string;
  orderId: string;
  productId: string;
  reportId: string | null;
  status: GenerationStatus;
  attemptCount: number;
  error: ApiErrorView | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type CreditLedgerReason = "purchase" | "free_grant" | "consultation_use" | "error_recovery" | "refund" | "admin_adjustment" | "event_grant";
export type CreditLedgerSource = "order" | "consultation" | "admin" | "event" | "system";
export interface CreditLedgerEntry {
  id: string;
  delta: number;
  balanceAfter: number;
  source: CreditLedgerSource;
  sourceId: string | null;
  reason: CreditLedgerReason;
  description: string;
  createdAt: IsoDateTime;
}

export type LibraryItemType = "report" | "consultation" | "compatibility";
export type LibraryAccess = "available" | "locked" | "expired";
export type LibraryAction = "open" | "mark_read" | "hide" | "unhide" | "delete";
export interface LibraryItemView {
  id: string;
  type: LibraryItemType;
  title: string;
  subtitle: string;
  href: string;
  access: LibraryAccess;
  purchased: boolean;
  read: boolean;
  hidden: boolean;
  profile: { id: string; displayName: string };
  topic: TopicId | null;
  createdAt: IsoDateTime;
  allowedActions: LibraryAction[];
}

export function getAllowedLibraryActions(item: Pick<LibraryItemView, "access" | "purchased" | "read" | "hidden">): LibraryAction[] {
  const actions: LibraryAction[] = [];
  if (item.access === "available") actions.push("open");
  if (!item.read && item.access === "available") actions.push("mark_read");
  actions.push(item.hidden ? "unhide" : "hide");
  if (!item.purchased) actions.push("delete");
  return actions;
}

export function withAllowedLibraryActions(item: Omit<LibraryItemView, "allowedActions">): LibraryItemView {
  return { ...item, allowedActions: getAllowedLibraryActions(item) };
}

export type FeedbackTarget =
  | { type: "report"; reportId: string }
  | { type: "consultation_message"; sessionId: string; messageId: string }
  | { type: "compatibility"; compatibilityId: string };

export interface FeedbackProvenance {
  profileSnapshotId: string;
  chartSnapshotIds: string[];
  modelVersion: string | null;
  promptVersion: string | null;
  templateVersion: string;
}

export interface FeedbackView {
  id: string;
  target: FeedbackTarget;
  rating: "helpful" | "unclear" | "wrong";
  reason: "too_generic" | "repetitive" | "incorrect_chart" | "unanswered" | "inappropriate" | "purchase_mismatch" | "other";
  comment: string | null;
  provenance: FeedbackProvenance;
  createdAt: IsoDateTime;
}

export type ShareLinkStatus = "active" | "expired" | "disabled";
export interface ShareLinkView {
  id: string;
  targetType: "report" | "daily_flow" | "monthly_flow" | "compatibility";
  targetId: string;
  url: string;
  status: ShareLinkStatus;
  expiresAt: IsoDateTime;
  disabledAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}

export interface NotificationPreferenceView {
  channel: "push" | "email";
  enabled: boolean;
  topics: Record<"payment_completed" | "monthly_flow" | "important_period" | "report_completed" | "consultation_completed" | "low_credits" | "resume_consultation" | "interest_change", boolean>;
  quietHours: { enabled: boolean; start: string; end: string; timezone: string };
  suppressDuplicates: boolean;
}

export type AdminCommandType = "restrict_account" | "restore_account" | "process_deletion" | "refund_order" | "grant_credits" | "regenerate_report" | "hide_report" | "restore_credits" | "restrict_sensitive_access";
export interface AdminCommand {
  type: AdminCommandType;
  targetType: "account" | "profile" | "order" | "report" | "consultation";
  targetId: string;
  reason: string;
  expectedVersion: string | null;
}

export interface AuditView {
  id: string;
  actorId: string;
  actorRole: string;
  command: AdminCommand;
  outcome: "accepted" | "rejected" | "failed";
  occurredAt: IsoDateTime;
}

export interface ApiErrorView {
  code: string;
  message: string;
  fieldErrors: Record<string, string[]>;
  requestId: string | null;
  retryable: boolean;
}

export interface CursorPage<Item> {
  items: Item[];
  nextCursor: string | null;
  hasMore: boolean;
}

function includes<const Values extends readonly string[]>(values: Values, value: unknown): value is Values[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function isJobStatus(value: unknown): value is JobStatus {
  return includes(JOB_STATUSES, value);
}

export function isConsultationSessionStatus(value: unknown): value is ConsultationSessionStatus {
  return includes(CONSULTATION_SESSION_STATUSES, value);
}

export function isConsultationMessageStatus(value: unknown): value is ConsultationMessageStatus {
  return includes(CONSULTATION_MESSAGE_STATUSES, value);
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return includes(ORDER_STATUSES, value);
}

export function isGenerationStatus(value: unknown): value is GenerationStatus {
  return includes(GENERATION_STATUSES, value);
}
