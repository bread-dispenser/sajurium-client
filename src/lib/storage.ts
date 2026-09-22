import type {
  BirthDraft,
  BirthInfo,
  ConsultationData,
  ConsultationDraft,
  ConsultationMessage,
  ConsultationSession,
  CompatibilityData,
  CompatibilityDimension,
  CompatibilityResult,
  CommerceData,
  CreditHistoryItem,
  DemoOrder,
  FeedbackRecord,
  FeedbackData,
  FeedbackEntry,
  LibraryData,
  LibraryItem,
  PeopleData,
  PersonProfile,
  SettingsData,
  SavedReport,
} from "./domain";
import {
  getAllowedLibraryActions,
  hasValidLeapMonthSemantics,
  parseBirthDate,
  isConsultationMessageStatus,
  isConsultationSessionStatus,
  isGenerationStatus,
  isOrderStatus,
} from "./contracts";
import { isFeedbackId, isTopicId } from "./fixtures";

const REPORT_KEY = "sajurium-saju-report";
const FEEDBACK_KEY = "sajurium-saju-feedback";
const BIRTH_DRAFT_KEY = "sajurium-birth-draft";
const TRANSACTION_KEY = "sajurium-storage-transaction";

type StorageScope = "local" | "session";

function browserStorage(scope: StorageScope): Storage {
  return scope === "local" ? window.localStorage : window.sessionStorage;
}

const OWNED_STORE_SCOPES: Readonly<Record<string, StorageScope>> = {
  [REPORT_KEY]: "local",
  [FEEDBACK_KEY]: "local",
  [BIRTH_DRAFT_KEY]: "session",
  "sajurium-profile": "local",
  "sajurium-library": "local",
  "sajurium-consultations": "local",
  "sajurium-people": "local",
  "sajurium-compatibility": "local",
  "sajurium-commerce": "local",
  "sajurium-settings": "local",
  "sajurium-feedback-list": "local",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOpaqueId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(value);
}

function hasUniqueIds(values: Array<{ id: string }>): boolean {
  return new Set(values.map((value) => value.id)).size === values.length;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isIsoDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isContractTopicId(value: unknown): boolean {
  return (
    value === "love" ||
    value === "marriage" ||
    value === "reunion" ||
    value === "career" ||
    value === "business" ||
    value === "money" ||
    value === "family" ||
    value === "relationships" ||
    value === "other"
  );
}

function isContentProvenance(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.chartSnapshotId) &&
    isNonEmptyString(value.interpretationVersion) &&
    (value.modelVersion === null || isNonEmptyString(value.modelVersion)) &&
    (value.promptVersion === null || isNonEmptyString(value.promptVersion)) &&
    isNonEmptyString(value.templateVersion) &&
    isIsoDateTime(value.generatedAt)
  );
}

function isFeedbackTarget(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.type === "report") return isNonEmptyString(value.reportId);
  if (value.type === "consultation_message") return isNonEmptyString(value.sessionId) && isNonEmptyString(value.messageId);
  if (value.type === "compatibility") return isNonEmptyString(value.compatibilityId);
  return false;
}

function isFeedbackProvenance(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["profileSnapshotId", "chartSnapshotIds", "modelVersion", "promptVersion", "templateVersion"]) &&
    isNonEmptyString(value.profileSnapshotId) &&
    Array.isArray(value.chartSnapshotIds) &&
    value.chartSnapshotIds.length > 0 &&
    value.chartSnapshotIds.every(isNonEmptyString) &&
    new Set(value.chartSnapshotIds).size === value.chartSnapshotIds.length &&
    (value.modelVersion === null || isNonEmptyString(value.modelVersion)) &&
    (value.promptVersion === null || isNonEmptyString(value.promptVersion)) &&
    isNonEmptyString(value.templateVersion)
  );
}

function isFeedbackReason(value: unknown): boolean {
  return (
    value === "too_generic" ||
    value === "repetitive" ||
    value === "incorrect_chart" ||
    value === "unanswered" ||
    value === "inappropriate" ||
    value === "purchase_mismatch" ||
    value === "other"
  );
}

function isBirthInfo(value: unknown): value is BirthInfo {
  if (!isRecord(value)) return false;
  const personalization = value.personalization;
  return (
    isNonEmptyString(value.displayName) &&
    (value.calendar === "solar" || value.calendar === "lunar") &&
    typeof value.leapMonth === "boolean" &&
    hasValidLeapMonthSemantics({ calendar: value.calendar, leapMonth: value.leapMonth }) &&
    (value.calendar === "lunar" ? typeof value.birthDate === "string" && parseBirthDate(value.birthDate, new Date(), "lunar") !== null : isIsoDate(value.birthDate)) &&
    (value.birthTime === null || (typeof value.birthTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.birthTime))) &&
    typeof value.birthTimeUnknown === "boolean" &&
    (value.birthTimeUnknown ? value.birthTime === null : value.birthTime !== null) &&
    isNonEmptyString(value.birthplace) &&
    isNonEmptyString(value.timezone) &&
    (value.calculationGender === "male" || value.calculationGender === "female") &&
    (value.profileType === "self" || value.profileType === "other") &&
    (value.ownerRelationship === "self" || value.ownerRelationship === "partner" || value.ownerRelationship === "family" || value.ownerRelationship === "friend" || value.ownerRelationship === "coworker") &&
    ((value.profileType === "self" && value.ownerRelationship === "self") || (value.profileType === "other" && value.ownerRelationship !== "self")) &&
    isRecord(personalization) &&
    Array.isArray(personalization.interests) &&
    personalization.interests.every((interest) => interest === "love" || interest === "marriage" || interest === "reunion" || interest === "career" || interest === "business" || interest === "money" || interest === "family" || interest === "relationships" || interest === "other") &&
    new Set(personalization.interests).size === personalization.interests.length &&
    (personalization.relationshipStatus === null || typeof personalization.relationshipStatus === "string") &&
    (personalization.occupationStatus === null || typeof personalization.occupationStatus === "string") &&
    (personalization.primaryConcern === null || typeof personalization.primaryConcern === "string") &&
    typeof value.thirdPartyConsent === "boolean" &&
    (value.profileType === "self" || value.thirdPartyConsent)
  );
}

function isSavedReport(value: unknown): value is SavedReport {
  if (!isRecord(value)) return false;
  return (
    value.version === 1 &&
    typeof value.savedAt === "string" &&
    isBirthInfo(value.birth) &&
    isTopicId(value.topic) &&
    (value.feedback === null || isFeedbackId(value.feedback))
  );
}

function isFeedbackRecord(value: unknown): value is FeedbackRecord {
  if (!isRecord(value)) return false;
  return (
    value.version === 1 &&
    isFeedbackTarget(value.target) &&
    isTopicId(value.topic) &&
    isFeedbackId(value.rating) &&
    isFeedbackReason(value.reason) &&
    typeof value.comment === "string" &&
    isFeedbackProvenance(value.provenance) &&
    typeof value.reported === "boolean" &&
    isIsoDateTime(value.createdAt)
  );
}

function isBirthDraft(value: unknown): value is BirthDraft {
  return isRecord(value) && value.version === 1 && isBirthInfo(value.birth);
}

function isLibraryItem(value: unknown): value is LibraryItem {
  if (!isRecord(value)) return false;
  if (
    !(
    isNonEmptyString(value.id) &&
    (value.type === "report" || value.type === "consultation" || value.type === "compatibility") &&
    typeof value.title === "string" &&
    typeof value.subtitle === "string" &&
    isIsoDateTime(value.createdAt) &&
    typeof value.href === "string" &&
    value.href.startsWith("/") &&
    (value.access === "available" || value.access === "locked" || value.access === "expired") &&
    typeof value.purchased === "boolean" &&
    typeof value.read === "boolean" &&
    typeof value.hidden === "boolean" &&
    isRecord(value.profile) &&
    isNonEmptyString(value.profile.id) &&
    typeof value.profile.displayName === "string" &&
    (value.topic === null || isContractTopicId(value.topic)) &&
    Array.isArray(value.allowedActions)
    )
  ) return false;
  const expectedActions = getAllowedLibraryActions(value as Pick<LibraryItem, "access" | "purchased" | "read" | "hidden">);
  return value.allowedActions.length === expectedActions.length && value.allowedActions.every((action, index) => action === expectedActions[index]);
}

function isLibraryData(value: unknown): value is LibraryData {
  return isRecord(value) && value.version === 1 && Array.isArray(value.items) && value.items.every(isLibraryItem) && hasUniqueIds(value.items);
}

function isConsultationMessage(value: unknown): value is ConsultationMessage {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    (value.role === "user" || value.role === "assistant") &&
    isConsultationMessageStatus(value.status) &&
    (value.content === null || typeof value.content === "string") &&
    isIsoDateTime(value.createdAt) &&
    (value.completedAt === null || isIsoDateTime(value.completedAt)) &&
    (value.provenance === null || isContentProvenance(value.provenance)) &&
    (value.status === "completed"
      ? typeof value.content === "string" && value.completedAt !== null
      : value.completedAt === null)
  );
}

function isConsultationSession(value: unknown): value is ConsultationSession {
  if (!isRecord(value)) return false;
  const context = value.context;
  return (
    isNonEmptyString(value.id) &&
    typeof value.title === "string" &&
    isConsultationSessionStatus(value.status) &&
    isRecord(context) &&
    isNonEmptyString(context.profileId) &&
    isNonEmptyString(context.chartSnapshotId) &&
    isNonEmptyString(context.periodKey) &&
    isContractTopicId(context.topic) &&
    (context.situation === null || typeof context.situation === "string") &&
    Array.isArray(context.referencedProfileIds) &&
    context.referencedProfileIds.every(isNonEmptyString) &&
    new Set(context.referencedProfileIds).size === context.referencedProfileIds.length &&
    (value.summary === null || typeof value.summary === "string") &&
    isIsoDateTime(value.createdAt) &&
    isIsoDateTime(value.updatedAt) &&
    Array.isArray(value.messages) &&
    value.messages.every(isConsultationMessage) &&
    hasUniqueIds(value.messages)
  );
}

function isConsultationDraft(value: unknown): value is ConsultationDraft {
  if (!isRecord(value)) return false;
  return isTopicId(value.topic) && typeof value.question === "string" && typeof value.situation === "string";
}

function isConsultationData(value: unknown): value is ConsultationData {
  if (!isRecord(value)) return false;
  return (
    value.version === 1 &&
    (value.draft === null || isConsultationDraft(value.draft)) &&
    Array.isArray(value.sessions) &&
    value.sessions.every(isConsultationSession) &&
    hasUniqueIds(value.sessions) &&
    Number.isInteger(value.freeUsesRemaining) &&
    Number(value.freeUsesRemaining) >= 0
  );
}

function isPersonProfile(value: unknown): value is PersonProfile {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isBirthInfo(value.profile) &&
    typeof value.createdAt === "string"
  );
}

function isPeopleData(value: unknown): value is PeopleData {
  return (
    isRecord(value) &&
    value.version === 1 &&
    value.freeLimit === 2 &&
    Array.isArray(value.people) &&
    value.people.length <= value.freeLimit &&
    value.people.every(isPersonProfile) &&
    hasUniqueIds(value.people)
  );
}

function isCompatibilityDimension(value: unknown): value is CompatibilityDimension {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["id", "title", "summary"]) &&
    isOpaqueId(value.id) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.summary)
  );
}

function isCompatibilityPersonSnapshot(value: unknown): value is CompatibilityResult["personA"] {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["profileId", "displayName", "maskedBirthYear", "birthTimeUnknown", "chartSnapshotId"]) &&
    isOpaqueId(value.profileId) &&
    isNonEmptyString(value.displayName) &&
    typeof value.maskedBirthYear === "string" &&
    /^\d{2}\*{2}$/.test(value.maskedBirthYear) &&
    typeof value.birthTimeUnknown === "boolean" &&
    isOpaqueId(value.chartSnapshotId)
  );
}

function isCompatibilityResult(value: unknown): value is CompatibilityResult {
  if (!isRecord(value)) return false;
  return (
    hasExactKeys(value, ["id", "relationshipType", "personA", "personB", "summary", "strengths", "cautions", "provenance", "createdAt", "dimensions", "fixtureVersion", "fixture"]) &&
    isOpaqueId(value.id) &&
    isCompatibilityPersonSnapshot(value.personA) &&
    isCompatibilityPersonSnapshot(value.personB) &&
    value.personA.profileId !== value.personB.profileId &&
    value.personA.chartSnapshotId !== value.personB.chartSnapshotId &&
    (value.relationshipType === "dating" || value.relationshipType === "marriage" || value.relationshipType === "family" || value.relationshipType === "friend" || value.relationshipType === "business") &&
    isIsoDateTime(value.createdAt) &&
    isNonEmptyString(value.summary) &&
    Array.isArray(value.strengths) &&
    value.strengths.length >= 2 &&
    value.strengths.every(isNonEmptyString) &&
    Array.isArray(value.cautions) &&
    value.cautions.length >= 1 &&
    value.cautions.every(isNonEmptyString) &&
    isContentProvenance(value.provenance) &&
    isRecord(value.provenance) &&
    hasExactKeys(value.provenance, ["chartSnapshotId", "interpretationVersion", "modelVersion", "promptVersion", "templateVersion", "generatedAt"]) &&
    isOpaqueId(value.provenance.chartSnapshotId) &&
    Array.isArray(value.dimensions) &&
    value.dimensions.length === 8 &&
    value.dimensions.every(isCompatibilityDimension) &&
    hasUniqueIds(value.dimensions) &&
    value.fixtureVersion === 1 &&
    value.fixture === true
  );
}

function isCompatibilityData(value: unknown): value is CompatibilityData {
  return isRecord(value) && value.version === 1 && Array.isArray(value.results) && value.results.every(isCompatibilityResult) && hasUniqueIds(value.results);
}

function isDemoOrder(value: unknown): value is DemoOrder {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.orderId) &&
    isNonEmptyString(value.productId) &&
    isNonEmptyString(value.productVersion) &&
    isNonEmptyString(value.profileId) &&
    isNonEmptyString(value.chartSnapshotId) &&
    isNonEmptyString(value.periodKey) &&
    isNonEmptyString(value.interpretationVersion) &&
    isOrderStatus(value.status) &&
    typeof value.amount === "number" &&
    Number.isFinite(value.amount) &&
    value.amount >= 0 &&
    isNonEmptyString(value.currency) &&
    (value.provider === "WEB" || value.provider === "APP") &&
    isIsoDateTime(value.createdAt) &&
    isIsoDateTime(value.updatedAt)
  );
}

function isCreditHistoryItem(value: unknown): value is CreditHistoryItem {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    typeof value.delta === "number" &&
    Number.isFinite(value.delta) &&
    typeof value.balanceAfter === "number" &&
    Number.isFinite(value.balanceAfter) &&
    (value.source === "order" || value.source === "consultation" || value.source === "admin" || value.source === "event" || value.source === "system") &&
    (value.sourceId === null || isNonEmptyString(value.sourceId)) &&
    (value.reason === "purchase" ||
      value.reason === "free_grant" ||
      value.reason === "consultation_use" ||
      value.reason === "error_recovery" ||
      value.reason === "refund" ||
      value.reason === "admin_adjustment" ||
      value.reason === "event_grant") &&
    typeof value.description === "string" &&
    isIsoDateTime(value.createdAt)
  );
}

function isApiError(value: unknown): boolean {
  if (!isRecord(value) || !isNonEmptyString(value.code) || typeof value.message !== "string" || !isRecord(value.fieldErrors)) return false;
  return (
    Object.values(value.fieldErrors).every((errors) => Array.isArray(errors) && errors.every((error) => typeof error === "string")) &&
    (value.requestId === null || isNonEmptyString(value.requestId)) &&
    typeof value.retryable === "boolean"
  );
}

function isGeneration(value: unknown): value is CommerceData["generations"][number] {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.orderId) &&
    isNonEmptyString(value.productId) &&
    (value.reportId === null || isNonEmptyString(value.reportId)) &&
    isGenerationStatus(value.status) &&
    (value.status === "completed" ? isNonEmptyString(value.reportId) : value.reportId === null) &&
    Number.isInteger(value.attemptCount) &&
    Number(value.attemptCount) >= 0 &&
    (value.error === null || isApiError(value.error)) &&
    (value.status === "failed" || value.error === null) &&
    isIsoDateTime(value.createdAt) &&
    isIsoDateTime(value.updatedAt)
  );
}

function isCommerceData(value: unknown): value is CommerceData {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.orders) ||
    !value.orders.every(isDemoOrder) ||
    new Set(value.orders.map((order) => order.orderId)).size !== value.orders.length ||
    !Array.isArray(value.generations) ||
    !value.generations.every(isGeneration) ||
    !hasUniqueIds(value.generations) ||
    !Number.isInteger(value.consultationCredits) ||
    Number(value.consultationCredits) < 0 ||
    !Array.isArray(value.creditHistory) ||
    !value.creditHistory.every(isCreditHistoryItem) ||
    !hasUniqueIds(value.creditHistory)
  ) return false;
  const orders = value.orders;
  if (!Array.isArray(orders) || !orders.every(isDemoOrder)) return false;
  const completedKeys = orders.filter((order) => order.status === "COMPLETED").map((order) => [order.productId, order.profileId, order.chartSnapshotId, order.periodKey, order.interpretationVersion].join("|"));
  if (new Set(completedKeys).size !== completedKeys.length) return false;
  const generations = value.generations;
  if (!Array.isArray(generations) || !generations.every(isGeneration)) return false;
  if (generations.some((generation) => !orders.some((order) => order.orderId === generation.orderId && order.productId === generation.productId))) return false;
  const creditHistory = value.creditHistory;
  if (!Array.isArray(creditHistory) || !creditHistory.every(isCreditHistoryItem)) return false;
  const consultationCredits = Number(value.consultationCredits);
  if (creditHistory.length === 0) return true;
  if (creditHistory[0].balanceAfter !== consultationCredits) return false;
  return creditHistory.slice(0, -1).every((entry, index) => (
    entry.balanceAfter - entry.delta === creditHistory[index + 1].balanceAfter
  ));
}

function isSettingsData(value: unknown): value is SettingsData {
  if (!isRecord(value) || !hasExactKeys(value, ["version", "notifications"]) || value.version !== 1 || !Array.isArray(value.notifications)) return false;
  const topicKeys = ["payment_completed", "monthly_flow", "important_period", "report_completed", "consultation_completed", "low_credits", "resume_consultation", "interest_change"] as const;
  const isClockTime = (time: unknown) => typeof time === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
  const isTimezone = (timezone: unknown) => {
    if (typeof timezone !== "string" || timezone.length === 0 || timezone.length > 100) return false;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
      return true;
    } catch {
      return false;
    }
  };
  const isPreference = (preference: unknown): preference is SettingsData["notifications"][number] => {
    if (!isRecord(preference) || !hasExactKeys(preference, ["channel", "enabled", "topics", "quietHours", "suppressDuplicates"])) return false;
    if ((preference.channel !== "push" && preference.channel !== "email") || typeof preference.enabled !== "boolean" || typeof preference.suppressDuplicates !== "boolean") return false;
    const topics = preference.topics;
    if (!isRecord(topics) || !hasExactKeys(topics, topicKeys) || !topicKeys.every((topic) => typeof topics[topic] === "boolean")) return false;
    const quietHours = preference.quietHours;
    return (
      isRecord(quietHours) &&
      hasExactKeys(quietHours, ["enabled", "start", "end", "timezone"]) &&
      typeof quietHours.enabled === "boolean" &&
      isClockTime(quietHours.start) &&
      isClockTime(quietHours.end) &&
      isTimezone(quietHours.timezone)
    );
  };
  if (value.notifications.length !== 2 || !value.notifications.every(isPreference)) return false;
  return new Set(value.notifications.map((preference) => preference.channel)).size === 2;
}

function isFeedbackEntry(value: unknown): value is FeedbackEntry {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isFeedbackTarget(value.target) &&
    isTopicId(value.topic) &&
    isFeedbackId(value.rating) &&
    isFeedbackReason(value.reason) &&
    typeof value.comment === "string" &&
    isFeedbackProvenance(value.provenance) &&
    typeof value.reported === "boolean" &&
    isIsoDateTime(value.createdAt)
  );
}

function isFeedbackData(value: unknown): value is FeedbackData {
  return isRecord(value) && value.version === 1 && Array.isArray(value.entries) && value.entries.every(isFeedbackEntry) && hasUniqueIds(value.entries);
}

type StoreAuthority = {
  key: string;
  scope: StorageScope;
  validateRaw: (raw: string | null) => boolean;
};

const STORE_AUTHORITY = new WeakMap<object, StoreAuthority>();
const STORE_REGISTRY = new Map<string, StoreAuthority>();

function storeRegistryKey(key: string, scope: StorageScope): string {
  return `${scope}:${key}`;
}

function createBrowserStore<T>(key: string, validate: (value: unknown) => value is T, scope: StorageScope = "local") {
  function storage(): Storage {
    return browserStorage(scope);
  }

  function inspect(): { status: "ok"; value: T } | { status: "empty" | "corrupt" | "unavailable" } {
    if (typeof window === "undefined") return { status: "unavailable" };
    const recovery = recoverStorageTransaction();
    if (recovery === "unreconciled") return { status: "corrupt" };
    if (recovery === "unavailable") return { status: "unavailable" };
    let raw: string | null;
    try {
      raw = storage().getItem(key);
    } catch {
      return { status: "unavailable" };
    }
    if (!raw) return { status: "empty" };
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!validate(parsed)) return { status: "corrupt" };
      return { status: "ok", value: parsed };
    } catch {
      return { status: "corrupt" };
    }
  }

  function read(): T | null {
    const result = inspect();
    return result.status === "ok" ? result.value : null;
  }

  function write(value: T): boolean {
    if (typeof window === "undefined") return false;
    const recovery = recoverStorageTransaction();
    if (recovery === "unreconciled" || recovery === "unavailable") return false;
    const encoded = encodeTransaction(value);
    if (encoded.status !== "ok" || encoded.raw === null) return false;
    try {
      storage().setItem(key, encoded.raw);
      window.dispatchEvent(new CustomEvent(`sajurium-storage:${key}`));
      return true;
    } catch {
      return false;
    }
  }

  function remove(): boolean {
    if (typeof window === "undefined") return false;
    const recovery = recoverStorageTransaction();
    if (recovery === "unreconciled" || recovery === "unavailable") return false;
    try {
      storage().removeItem(key);
      if (storage().getItem(key) !== null) return false;
      window.dispatchEvent(new CustomEvent(`sajurium-storage:${key}`));
      return true;
    } catch {
      return false;
    }
  }

  function subscribe(onStoreChange: () => void): () => void {
    if (typeof window === "undefined") return () => undefined;
    const customEvent = `sajurium-storage:${key}`;
    const handleStorage = (event: StorageEvent) => {
      if (event.key === key) onStoreChange();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(customEvent, onStoreChange);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(customEvent, onStoreChange);
    };
  }

  function rawSnapshot(): string | null {
    const capture = captureRaw();
    return capture.status === "ok" ? capture.value : null;
  }

  function captureRaw(): { status: "ok"; value: string | null } | { status: "unavailable" } {
    if (typeof window === "undefined") return { status: "unavailable" };
    try {
      return { status: "ok", value: storage().getItem(key) };
    } catch {
      return { status: "unavailable" };
    }
  }

  function encodeTransaction(value: T | null): { status: "ok"; raw: string | null } | { status: "invalid" } {
    if (value === null) return { status: "ok", raw: null };
    if (!validate(value)) return { status: "invalid" };
    try {
      const raw = JSON.stringify(value);
      return typeof raw === "string" && validateRaw(raw) ? { status: "ok", raw } : { status: "invalid" };
    } catch {
      return { status: "invalid" };
    }
  }

  function validateRaw(raw: string | null): boolean {
    if (raw === null) return true;
    try {
      return validate(JSON.parse(raw) as unknown);
    } catch {
      return false;
    }
  }

  const store = Object.freeze({ key, scope, inspect, read, write, remove, subscribe, rawSnapshot, captureRaw, encodeTransaction });
  const authority = Object.freeze({ key, scope, validateRaw });
  STORE_AUTHORITY.set(store, authority);
  STORE_REGISTRY.set(storeRegistryKey(key, scope), authority);
  return store;
}

type TransactionStep = {
  key: string;
  scope: StorageScope;
  before: string | null;
  beforeKnown: boolean;
  after: string | null;
  afterKnown: boolean;
};

const TRANSACTION_STEP_TOKEN = Symbol("sajurium-transaction-step");
type PreparedTransactionStep = TransactionStep & { readonly [TRANSACTION_STEP_TOKEN]: true };
const PREPARED_STEP_AUTHORITY = new WeakMap<PreparedTransactionStep, Readonly<TransactionStep>>();

type TransactionJournal = {
  version: 1;
  state: "pending" | "committed";
  steps: TransactionStep[];
};

export function createTransactionStep<T>(
  store: {
    key: string;
    scope: StorageScope;
    captureRaw: () => { status: "ok"; value: string | null } | { status: "unavailable" };
    encodeTransaction: (value: T | null) => { status: "ok"; raw: string | null } | { status: "invalid" };
  },
  value: T | null,
): PreparedTransactionStep {
  const storeAuthority = STORE_AUTHORITY.get(store);
  const capture = storeAuthority ? store.captureRaw() : { status: "unavailable" as const };
  const encoded = storeAuthority ? store.encodeTransaction(value) : { status: "invalid" as const };
  const step = {
    key: storeAuthority?.key ?? store.key,
    scope: storeAuthority?.scope ?? store.scope,
    before: capture.status === "ok" ? capture.value : null,
    beforeKnown: capture.status === "ok",
    after: encoded.status === "ok" ? encoded.raw : null,
    afterKnown: encoded.status === "ok",
  } as PreparedTransactionStep;
  Object.defineProperty(step, TRANSACTION_STEP_TOKEN, { value: true, enumerable: false });
  PREPARED_STEP_AUTHORITY.set(step, Object.freeze({ ...step }));
  return Object.freeze(step);
}

function isAuthorizedPreparedStep(step: PreparedTransactionStep): boolean {
  const canonical = PREPARED_STEP_AUTHORITY.get(step);
  return Boolean(
    canonical &&
    Object.isFrozen(step) &&
    step[TRANSACTION_STEP_TOKEN] === true &&
    step.key === canonical.key &&
    step.scope === canonical.scope &&
    step.before === canonical.before &&
    step.beforeKnown === canonical.beforeKnown &&
    step.after === canonical.after &&
    step.afterKnown === canonical.afterKnown &&
    OWNED_STORE_SCOPES[step.key] === step.scope,
  );
}

function replaceRaw(step: TransactionStep, value: string | null): boolean {
  try {
    const storage = browserStorage(step.scope);
    if (value === null) storage.removeItem(step.key);
    else storage.setItem(step.key, value);
    if (storage.getItem(step.key) !== value) return false;
    return true;
  } catch {
    return false;
  }
}

function captureStepRaw(step: TransactionStep): { status: "ok"; value: string | null } | { status: "unavailable" } {
  try {
    return { status: "ok", value: browserStorage(step.scope).getItem(step.key) };
  } catch {
    return { status: "unavailable" };
  }
}

function notifyTransaction(steps: TransactionStep[]) {
  for (const key of new Set(steps.map((step) => step.key))) {
    window.dispatchEvent(new CustomEvent(`sajurium-storage:${key}`));
  }
}

function writeJournal(journal: TransactionJournal): boolean {
  try {
    const encoded = JSON.stringify(journal);
    window.localStorage.setItem(TRANSACTION_KEY, encoded);
    return window.localStorage.getItem(TRANSACTION_KEY) === encoded;
  } catch {
    return false;
  }
}

function removeJournal(): boolean {
  try {
    window.localStorage.removeItem(TRANSACTION_KEY);
    return window.localStorage.getItem(TRANSACTION_KEY) === null;
  } catch {
    return false;
  }
}

function readJournal(): TransactionJournal | null | "corrupt" | "unavailable" {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(TRANSACTION_KEY);
  } catch {
    return "unavailable";
  }
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || (value.state !== "pending" && value.state !== "committed") || !Array.isArray(value.steps)) return "corrupt";
    const seen = new Set<string>();
    const valid = value.steps.every((step) => {
      if (
        !isRecord(step) ||
        typeof step.key !== "string" ||
        step.scope !== "local" ||
        OWNED_STORE_SCOPES[step.key] !== step.scope ||
        (typeof step.before !== "string" && step.before !== null) ||
        step.beforeKnown !== true ||
        (typeof step.after !== "string" && step.after !== null) ||
        step.afterKnown !== true
      ) return false;
      const registrationKey = storeRegistryKey(step.key, step.scope);
      const authority = STORE_REGISTRY.get(registrationKey);
      if (seen.has(registrationKey) || !authority?.validateRaw(step.before) || !authority.validateRaw(step.after)) return false;
      seen.add(registrationKey);
      return true;
    });
    return valid ? value as TransactionJournal : "corrupt";
  } catch {
    return "corrupt";
  }
}

function recoverStorageTransaction(): "clean" | "recovered" | "unreconciled" | "unavailable" {
  if (typeof window === "undefined") return "clean";
  const journal = readJournal();
  if (journal === null) return "clean";
  if (journal === "corrupt") return "unreconciled";
  if (journal === "unavailable") return "unavailable";
  if (journal.state === "committed") {
    if (!removeJournal()) return "unreconciled";
    notifyTransaction(journal.steps);
    return "recovered";
  }
  const restored = [...journal.steps].reverse().map((step) => replaceRaw(step, step.before)).every(Boolean);
  if (!restored) return "unreconciled";
  if (!removeJournal()) return "unreconciled";
  notifyTransaction(journal.steps);
  return "recovered";
}

export function runStorageTransaction(steps: PreparedTransactionStep[]): "committed" | "rolled-back" | "unreconciled" {
  if (typeof window === "undefined" || steps.length === 0) return "unreconciled";
  if (steps.some((step) => !isAuthorizedPreparedStep(step) || !step.beforeKnown || !step.afterKnown)) return "unreconciled";
  if (steps.some((step) => step.scope !== "local")) return "unreconciled";
  const distinctKeys = new Set(steps.map((step) => storeRegistryKey(step.key, step.scope)));
  if (distinctKeys.size !== steps.length) return "unreconciled";
  const snapshotsAreValid = steps.every((step) => {
    const authority = STORE_REGISTRY.get(storeRegistryKey(step.key, step.scope));
    return Boolean(authority?.validateRaw(step.before) && authority.validateRaw(step.after));
  });
  if (!snapshotsAreValid) return "unreconciled";
  const recovery = recoverStorageTransaction();
  if (recovery === "unreconciled" || recovery === "unavailable") return "unreconciled";
  const liveSnapshotsMatch = steps.every((step) => {
    const live = captureStepRaw(step);
    return live.status === "ok" && live.value === step.before;
  });
  if (!liveSnapshotsMatch) return "unreconciled";
  const pending: TransactionJournal = { version: 1, state: "pending", steps };
  if (!writeJournal(pending)) return "unreconciled";
  const applied: TransactionStep[] = [];
  for (const step of steps) {
    if (replaceRaw(step, step.after)) {
      applied.push(step);
      continue;
    }
    const attempted = [...applied, step];
    const restored = [...attempted].reverse().map((attemptedStep) => replaceRaw(attemptedStep, attemptedStep.before)).every(Boolean);
    if (restored && removeJournal()) {
      notifyTransaction(attempted);
      return "rolled-back";
    }
    return "unreconciled";
  }
  if (!writeJournal({ ...pending, state: "committed" })) {
    const restored = [...applied].reverse().map((step) => replaceRaw(step, step.before)).every(Boolean);
    if (restored && removeJournal()) {
      notifyTransaction(applied);
      return "rolled-back";
    }
    return "unreconciled";
  }
  if (!removeJournal()) return "unreconciled";
  notifyTransaction(steps);
  return "committed";
}

export function inspectStorageTransaction(): { status: "ok" | "empty" | "corrupt" | "unavailable" } {
  if (typeof window === "undefined") return { status: "empty" };
  const journal = readJournal();
  if (journal === null) return { status: "empty" };
  if (journal === "corrupt" || journal === "unavailable") return { status: journal };
  return { status: "ok" };
}

export function clearCorruptStorageTransaction(): boolean {
  if (typeof window === "undefined" || readJournal() !== "corrupt") return false;
  return removeJournal();
}

export const reportStore = createBrowserStore(REPORT_KEY, isSavedReport);
export const feedbackStore = createBrowserStore(FEEDBACK_KEY, isFeedbackRecord);
export const birthDraftStore = createBrowserStore(BIRTH_DRAFT_KEY, isBirthDraft, "session");
export const profileStore = createBrowserStore("sajurium-profile", isBirthDraft);
export const libraryStore = createBrowserStore("sajurium-library", isLibraryData);
export const consultationStore = createBrowserStore("sajurium-consultations", isConsultationData);
export const peopleStore = createBrowserStore("sajurium-people", isPeopleData);
export const compatibilityStore = createBrowserStore("sajurium-compatibility", isCompatibilityData);
export const commerceStore = createBrowserStore("sajurium-commerce", isCommerceData);
export const settingsStore = createBrowserStore("sajurium-settings", isSettingsData);
export const feedbackListStore = createBrowserStore("sajurium-feedback-list", isFeedbackData);

function saveLocalValueAndClearBirthDraft<T>(
  store: {
    key: string;
    scope: StorageScope;
    encodeTransaction: (value: T) => { status: "ok"; raw: string | null } | { status: "invalid" };
    captureRaw: () => { status: "ok"; value: string | null } | { status: "unavailable" };
  },
  value: T,
): "committed" | "rolled-back" | "unreconciled" {
  if (typeof window === "undefined") return "unreconciled";
  const recovery = recoverStorageTransaction();
  if (recovery === "unreconciled" || recovery === "unavailable") return "unreconciled";
  if (store.scope !== "local") return "unreconciled";
  const encoded = store.encodeTransaction(value);
  const localBefore = store.captureRaw();
  const draftBefore = birthDraftStore.captureRaw();
  if (encoded.status !== "ok" || localBefore.status !== "ok" || draftBefore.status !== "ok") return "unreconciled";
  const localAuthority = STORE_AUTHORITY.get(store);
  const draftAuthority = STORE_AUTHORITY.get(birthDraftStore);
  if (!localAuthority?.validateRaw(localBefore.value) || !draftAuthority?.validateRaw(draftBefore.value)) return "unreconciled";
  const localStep: TransactionStep = {
    key: store.key,
    scope: store.scope,
    before: localBefore.value,
    beforeKnown: true,
    after: encoded.raw,
    afterKnown: true,
  };
  const draftStep: TransactionStep = {
    key: birthDraftStore.key,
    scope: birthDraftStore.scope,
    before: draftBefore.value,
    beforeKnown: true,
    after: null,
    afterKnown: true,
  };
  if (!replaceRaw(localStep, localStep.after)) {
    return replaceRaw(localStep, localStep.before) ? "rolled-back" : "unreconciled";
  }
  if (!replaceRaw(draftStep, null)) {
    const restored = replaceRaw(localStep, localStep.before);
    if (restored) notifyTransaction([localStep]);
    return restored ? "rolled-back" : "unreconciled";
  }
  notifyTransaction([localStep, draftStep]);
  return "committed";
}

export function saveProfileAndClearBirthDraft(profile: BirthDraft): "committed" | "rolled-back" | "unreconciled" {
  return saveLocalValueAndClearBirthDraft(profileStore, profile);
}

export function saveReportAndClearBirthDraft(report: SavedReport): "committed" | "rolled-back" | "unreconciled" {
  return saveLocalValueAndClearBirthDraft(reportStore, report);
}

type OwnedStoreRegistration = {
  id: string;
  label: string;
  scope: StorageScope;
  inspect: () => { status: "ok" | "empty" | "corrupt" | "unavailable"; count: number };
  remove: () => boolean;
};

function registerOwnedStore<T>(
  id: string,
  label: string,
  store: {
    scope: StorageScope;
    inspect: () => { status: "ok"; value: T } | { status: "empty" | "corrupt" | "unavailable" };
    remove: () => boolean;
  },
  count: (value: T) => number,
): OwnedStoreRegistration {
  return {
    id,
    label,
    scope: store.scope,
    inspect: () => {
      const inspection = store.inspect();
      return inspection.status === "ok" ? { status: "ok", count: count(inspection.value) } : { status: inspection.status, count: 0 };
    },
    remove: store.remove,
  };
}

const OWNED_STORE_REGISTRY: OwnedStoreRegistration[] = [
  registerOwnedStore("birth-draft", "입력 중인 출생 정보", birthDraftStore, () => 1),
  registerOwnedStore("profile", "저장 프로필", profileStore, () => 1),
  registerOwnedStore("report", "사주 리포트", reportStore, () => 1),
  registerOwnedStore("feedback-selection", "최근 평가 선택", feedbackStore, () => 1),
  registerOwnedStore("people", "저장 인물", peopleStore, (value) => value.people.length),
  registerOwnedStore("consultations", "상담", consultationStore, (value) => value.sessions.length + (value.draft ? 1 : 0)),
  registerOwnedStore("compatibility", "궁합", compatibilityStore, (value) => value.results.length),
  registerOwnedStore("library", "보관함", libraryStore, (value) => value.items.length),
  registerOwnedStore("feedback", "피드백", feedbackListStore, (value) => value.entries.length),
  registerOwnedStore("commerce", "체험 주문·이용권", commerceStore, (value) => value.orders.length + value.generations.length + value.creditHistory.length + (value.consultationCredits > 0 ? 1 : 0)),
  registerOwnedStore("settings", "환경설정", settingsStore, () => 1),
  {
    id: "transaction",
    label: "복구 대기 작업",
    scope: "local",
    inspect: () => {
      const journal = readJournal();
      if (journal === null) return { status: "empty", count: 0 };
      if (journal === "corrupt") return { status: "corrupt", count: 0 };
      if (journal === "unavailable") return { status: "unavailable", count: 0 };
      return { status: "ok", count: 1 };
    },
    remove: removeJournal,
  },
];

export function getOwnedStorageInventory() {
  return OWNED_STORE_REGISTRY.map((registration) => ({
    id: registration.id,
    label: registration.label,
    scope: registration.scope,
    ...registration.inspect(),
  }));
}

export function clearOwnedStorage(id: string): boolean {
  const registration = OWNED_STORE_REGISTRY.find((candidate) => candidate.id === id);
  return registration ? registration.remove() : false;
}

export function clearAllOwnedStorage(): { success: boolean; failedIds: string[] } {
  const failedIds = OWNED_STORE_REGISTRY.filter((registration) => !registration.remove()).map((registration) => registration.id);
  return { success: failedIds.length === 0, failedIds };
}

export function inspectCurrentBirth(fallback: BirthInfo):
  | { status: "ok"; birth: BirthInfo }
  | { status: "corrupt" | "unavailable"; store: "draft" | "profile" | "report" } {
  const draft = birthDraftStore.inspect();
  if (draft.status === "corrupt" || draft.status === "unavailable") return { status: draft.status, store: "draft" };
  if (draft.status === "ok") return { status: "ok", birth: draft.value.birth };
  const profile = profileStore.inspect();
  if (profile.status === "corrupt" || profile.status === "unavailable") return { status: profile.status, store: "profile" };
  if (profile.status === "ok") return { status: "ok", birth: profile.value.birth };
  const report = reportStore.inspect();
  if (report.status === "corrupt" || report.status === "unavailable") return { status: report.status, store: "report" };
  if (report.status === "ok") return { status: "ok", birth: report.value.birth };
  return { status: "ok", birth: fallback };
}

export function resetBirthSource(store: "draft" | "profile" | "report") {
  if (store === "draft") return birthDraftStore.remove();
  if (store === "profile") return profileStore.remove();
  return reportStore.remove();
}

