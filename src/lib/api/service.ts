import type { components } from "@/lib/api/sasaju.generated";
import type { CreditLedgerEntry, LibraryAction, LibraryItemView, ProductView, ProfileInput } from "@/lib/contracts";
import { ApiRequestError, apiRequest } from "@/lib/api/client";

type Schema<Name extends keyof components["schemas"]> = components["schemas"][Name];
type ApiProfile = Schema<"SajuProfile">;
type ApiProfileSummary = Schema<"SajuProfileSummary">;
type ApiChart = Schema<"ChartSnapshot">;
type ApiReport = Schema<"Report">;
type ApiProduct = Schema<"Product">;
type ApiOrder = Schema<"Order">;
type ApiCompatibility = Schema<"CompatibilityReport">;
export type ApiConsultation = Schema<"ConsultationSessionDetail">;

export type ServerJourney = {
  profileId: string;
  chartId: string;
  reportId: string;
};

export type LiveReport = {
  report_id: string;
  chart_id: string;
  profile_id: string;
  kind: string;
  status: "READY" | "QUEUED" | "GENERATING" | "FAILED";
  sections: Array<{ section_id: string; title: string; access: "FREE" | "PAID" | "LOCKED"; content: string | null; evidence: string[] }>;
  excluded_scopes: string[];
  provenance: { model_version: string; prompt_version: string; template_version: string };
  created_at: string;
  updated_at: string;
};

export type LiveOrder = {
  order_id: string;
  status: string;
  amount_minor: number;
  currency: string;
  product_id: string;
  created_at: string;
};

export type CreditSnapshot = { balance: { balance: number }; ledger: { items: CreditLedgerEntry[] } };
export type ServerProfile = { id: string; nickname: string; isSelf: boolean; relationship: string | null; birthYear: number; birthTimeUnknown: boolean; birthLocation: string | null; createdAt: string };
export type ServerCompatibility = { id: string; relation: string; summary: string; limitedByUnknownTime: boolean; createdAt: string };

const API_BASE_URL = process.env.NEXT_PUBLIC_SAJURIUM_API_URL ?? "http://localhost:8000";
const AUTH_KEY = "sajurium.sasaju-auth.v1";
const JOURNEY_KEY = "sajurium.server-journey.v1";

// FastAPI answers an expired or malformed bearer token with 403, not 401: `deps._resolve_user`
// raises 401 only when no token is present and 403 (`Could not validate credentials`) when
// jwt.decode fails. Both credential failures and genuine authorization denials therefore carry
// `code: "FORBIDDEN"`, and only this message separates them, so recovery keys off it exactly
// instead of treating "any 403" as an expiry.
const CREDENTIAL_REJECTION_MESSAGE = "Could not validate credentials";

type SessionKind = "anonymous" | "account";

type StoredAuthSession = {
  kind: SessionKind;
  accessToken: string;
  anonymousToken: string | null;
};

export type AnonymousMigrationStatus = "migrated" | "already-migrated" | "unavailable" | "pending" | "not-needed";

export type AccountAuthResult = {
  token: Schema<"Token">;
  migration: AnonymousMigrationStatus;
};

export type LogoutResult = "complete" | "local-only";

const PRODUCT_IDS: Record<string, string> = {
  report_love_deep: "love-report",
  report_career_deep: "career-report",
  report_wealth_deep: "money-report",
  compatibility_deep: "compatibility-report",
  credit_pack_5: "consult-5",
};

const PRODUCT_CODES: Record<string, string> = Object.fromEntries(
  Object.entries(PRODUCT_IDS).map(([code, id]) => [id, code]),
);

function newIdempotencyKey(scope: string) {
  return `${scope}-${globalThis.crypto.randomUUID()}`;
}

function toIso(value: string | null | undefined) {
  if (!value) return value ?? null;
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
}

function readAuthSession(): StoredAuthSession | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(AUTH_KEY) ?? "null") as Partial<StoredAuthSession> | null;
    if (!value || typeof value.accessToken !== "string") return null;
    // An empty access token is a readable state: recovery clears it while keeping `anonymousToken`,
    // which must stay retrievable so login can still migrate the server-side data.
    if (!value.accessToken && !value.anonymousToken) return null;
    const anonymousToken = typeof value.anonymousToken === "string" && value.anonymousToken ? value.anonymousToken : null;
    // Sessions written before `kind` existed carry no discriminator. `storeAnonymousSession` always
    // recorded a raw anonymous token and `loginAccount` clears it once migration succeeds, so a
    // legacy session without one can only be an account session and must not be auto-replaced.
    const kind: SessionKind = value.kind === "account" ? "account" : value.kind === "anonymous" || anonymousToken ? "anonymous" : "account";
    return { kind, accessToken: value.accessToken, anonymousToken };
  } catch {
    return null;
  }
}

function storeAuthSession(session: StoredAuthSession) {
  window.localStorage.setItem(AUTH_KEY, JSON.stringify(session));
}

function readAccessToken() {
  return readAuthSession()?.accessToken || null;
}

function storeAccountSession(value: Schema<"Token">) {
  storeAuthSession({ kind: "account", accessToken: value.access_token, anonymousToken: readAuthSession()?.anonymousToken ?? null });
}

function clearAnonymousToken() {
  const session = readAuthSession();
  if (session) storeAuthSession({ ...session, anonymousToken: null });
}

function clearAuthSession() {
  window.localStorage.removeItem(AUTH_KEY);
}

function terminalMigrationStatus(error: unknown): AnonymousMigrationStatus | null {
  if (!(error instanceof ApiRequestError)) return null;
  const code = error.error.code;
  if (error.status === 409 && code === "ALREADY_MIGRATED") return "already-migrated";
  if (error.status === 404 && code === "ANONYMOUS_SESSION_NOT_FOUND") return "unavailable";
  if (error.status === 410 && code === "ANONYMOUS_SESSION_EXPIRED") return "unavailable";
  return null;
}

/**
 * True only when the server rejected the bearer token itself (expired, malformed, wrong signature),
 * which is recoverable by issuing a fresh anonymous session. A 403 that denies a resource the caller
 * is legitimately not allowed to touch carries the same `code` and must never trigger recovery, so
 * the message is matched exactly.
 */
function isCredentialRejection(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.status === 401 || error.status === 403) &&
    error.error.message === CREDENTIAL_REJECTION_MESSAGE
  );
}

async function migrateAnonymousSession(accountAccessToken: string, anonymousToken: string | null): Promise<AnonymousMigrationStatus> {
  if (!anonymousToken) return "not-needed";
  try {
    await apiRequest("/api/v1/auth/anonymous/migrate", {
      baseUrl: API_BASE_URL,
      credentials: "omit",
      method: "POST",
      headers: { Authorization: `Bearer ${accountAccessToken}`, "Idempotency-Key": newIdempotencyKey("migrate") },
      body: { anonymous_token: anonymousToken, merge_duplicate_profiles: true },
    });
    clearAnonymousToken();
    return "migrated";
  } catch (error) {
    const terminal = terminalMigrationStatus(error);
    if (!terminal) return "pending";
    clearAnonymousToken();
    return terminal;
  }
}

export async function registerAccount(email: string, password: string, fullName: string): Promise<AccountAuthResult> {
  await apiRequest<Schema<"User">>("/api/v1/auth/register", { baseUrl: API_BASE_URL, credentials: "omit", method: "POST", body: { email, password, full_name: fullName || null } });
  return loginAccount(email, password);
}

export async function loginAccount(email: string, password: string): Promise<AccountAuthResult> {
  const anonymousToken = readAuthSession()?.anonymousToken ?? null;
  const body = new URLSearchParams({ username: email, password });
  const token = (await apiRequest<Schema<"Token">>("/api/v1/auth/login/access-token", { baseUrl: API_BASE_URL, credentials: "omit", method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } })).data;
  storeAccountSession(token);
  const migration = await migrateAnonymousSession(token.access_token, anonymousToken);
  return { token, migration };
}

export async function logoutAccount(): Promise<LogoutResult> {
  const accessToken = readAccessToken();
  let result: LogoutResult = "complete";
  try {
    if (accessToken) {
      await apiRequest("/api/v1/auth/logout", {
        baseUrl: API_BASE_URL,
        credentials: "omit",
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }
  } catch {
    result = "local-only";
  } finally {
    clearAuthSession();
    window.localStorage.removeItem(JOURNEY_KEY);
  }
  return result;
}

export async function requestAccountDeletion(reason: string) {
  const result = (await request<Record<string, unknown>>("/api/v1/auth/account", { method: "DELETE", body: { reason: reason || null } })).data;
  if (result.status === "DELETED") {
    clearAuthSession();
    window.localStorage.removeItem(JOURNEY_KEY);
  }
  return result;
}

// Screens issue their reads concurrently, so one expired session produces several credential
// rejections at once. Sharing a single in-flight bootstrap keeps them from each minting a separate
// anonymous user — `/api/v1/auth/anonymous` always creates a new one, so the last writer would
// otherwise win and the others would hold tokens for rows they never rendered.
let bootstrapInFlight: Promise<string> | null = null;

async function ensureAccessToken() {
  const token = readAccessToken();
  if (token) return token;
  bootstrapInFlight ??= (async () => {
    const response = await apiRequest<Schema<"AnonymousSessionResponse">>("/api/v1/auth/anonymous", {
      baseUrl: API_BASE_URL,
      method: "POST",
      body: {},
      credentials: "omit",
    });
    // Keep any previously held raw token: re-issuing a session must not discard the only handle
    // `/api/v1/auth/anonymous/migrate` accepts for the data still attached to the expired one.
    const preserved = readAuthSession()?.anonymousToken ?? null;
    storeAuthSession({
      kind: "anonymous",
      accessToken: response.data.access_token,
      anonymousToken: preserved ?? response.data.anonymous_token,
    });
    return response.data.access_token;
  })();
  try {
    return await bootstrapInFlight;
  } finally {
    bootstrapInFlight = null;
  }
}

async function request<T>(path: string, options: Parameters<typeof apiRequest<T>>[1] = {}) {
  const send = (token: string) => apiRequest<T>(path, {
    baseUrl: API_BASE_URL,
    credentials: "omit",
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  const attemptedToken = await ensureAccessToken();
  try {
    return await send(attemptedToken);
  } catch (error) {
    if (!isCredentialRejection(error)) throw error;
    const session = readAuthSession();
    // An account session cannot be silently replaced: `/api/v1/auth/anonymous` mints a brand-new
    // user, so recovering would drop the caller into a stranger's empty account and lose the
    // session they would need for migration. Surface the expiry and let login recover it.
    if (!session || session.kind === "account") throw error;
    // A concurrent caller may already have replaced the rejected token by the time this rejection
    // settles; retrying with that session beats clearing it and minting yet another anonymous user.
    if (session.accessToken && session.accessToken !== attemptedToken) return send(session.accessToken);
    // Clear the rejected access token but keep `anonymousToken`, the only handle
    // `/api/v1/auth/anonymous/migrate` accepts for the data still attached to the expired session.
    // Journey references point at the previous user's rows and must not survive the new session.
    storeAuthSession({ ...session, accessToken: "" });
    window.localStorage.removeItem(JOURNEY_KEY);
    return send(await ensureAccessToken());
  }
}

/**
 * True when an account session's token was rejected, i.e. the user must log in again. Screens use
 * this to show a login affordance instead of a dead end, because an account session cannot be
 * silently replaced with an anonymous one.
 */
export function isAccountSessionExpired(error: unknown): boolean {
  return isCredentialRejection(error) && readAuthSession()?.kind === "account";
}

export function formatApiRequestError(error: unknown, fallback = "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."): string {
  if (error instanceof ApiRequestError) {
    const reference = error.error.request_id ? ` (문의 시 참조 ID: ${error.error.request_id})` : "";
    // The backend answers a rejected token with an English `Could not validate credentials`;
    // showing that verbatim tells the user nothing actionable, so each case gets its own copy.
    if (isCredentialRejection(error)) {
      return readAuthSession()?.kind === "account"
        ? `로그인 세션이 만료됐어요. 다시 로그인하면 저장된 기록을 이어갈 수 있습니다.${reference}`
        : `세션을 준비하지 못했어요. 잠시 후 다시 시도해 주세요.${reference}`;
    }
    return `${error.error.message}${reference}`;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function profilePayload(profile: ProfileInput): Schema<"SajuProfileCreate"> {
  const [birthYear, birthMonth, birthDay] = profile.birthDate.split("-").map(Number);
  const [hour, minute] = profile.birthTime?.split(":").map(Number) ?? [undefined, undefined];
  return {
    nickname: profile.displayName,
    is_self: profile.profileType === "self",
    relationship_type: profile.profileType === "self" ? null : profile.ownerRelationship,
    birth_year: birthYear,
    birth_month: birthMonth,
    birth_day: birthDay,
    birth_time_hour: profile.birthTimeUnknown ? null : hour ?? null,
    birth_time_minute: profile.birthTimeUnknown ? null : minute ?? null,
    birth_time_unknown: profile.birthTimeUnknown,
    calendar_type: profile.calendar,
    is_leap_month: profile.leapMonth,
    birth_location: profile.birthplace,
    timezone_offset: -new Date().getTimezoneOffset() / 60,
    gender_for_calculation: profile.calculationGender,
    interests: profile.personalization.interests.join(",") || null,
    relationship_status: profile.personalization.relationshipStatus,
    job_status: profile.personalization.occupationStatus,
    current_concerns: profile.personalization.primaryConcern,
    consent_for_storing_others_info: profile.thirdPartyConsent,
  };
}

function toServerProfile(profile: ApiProfileSummary): ServerProfile {
  return { id: String(profile.id), nickname: profile.nickname, isSelf: profile.is_self, relationship: profile.relationship_type ?? null, birthYear: profile.birth_year, birthTimeUnknown: profile.birth_time_unknown, birthLocation: profile.birth_location_masked ?? null, createdAt: toIso(profile.created_at)! };
}

export async function listProfiles(): Promise<ServerProfile[]> {
  return (await request<ApiProfileSummary[]>("/api/v1/profiles/")).data.map(toServerProfile);
}

export async function createProfile(profile: ProfileInput): Promise<ServerProfile> {
  const created = (await request<ApiProfile[]>("/api/v1/profiles/", { method: "POST", body: profilePayload(profile) })).data;
  const item = created.at(-1);
  if (!item) throw new Error("프로필 저장 결과가 없습니다.");
  return toServerProfile(item);
}

export async function deleteProfile(profileId: string) {
  await request(`/api/v1/profiles/${profileId}`, { method: "DELETE" });
}

export async function getNotificationPreferences(timeoutMs = 12_000) {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("알림 설정 응답이 지연되고 있어요. 다시 시도해 주세요."));
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([
      request<Schema<"NotificationPreference">>("/api/v1/notification-preferences", { signal: controller.signal }),
      deadline,
    ]);
    return response.data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function updateNotificationPreferences(body: Partial<Schema<"NotificationPreferenceUpdate">>) {
  return (await request<Schema<"NotificationPreference">>("/api/v1/notification-preferences", { method: "PATCH", body })).data;
}

export async function createReportShare(hours = 72) {
  const journey = readServerJourney();
  if (!journey) throw new Error("먼저 리포트를 생성해 주세요.");
  return (await request<Schema<"ShareLink">>("/api/v1/share-links", { method: "POST", body: { target_type: "report", target_id: Number(journey.reportId), expires_in_hours: hours } })).data;
}

export async function listShareLinks() {
  return (await request<Schema<"ShareLink">[]>("/api/v1/share-links")).data;
}

export async function deactivateShareLink(id: number) {
  return (await request<Schema<"ShareLink">>(`/api/v1/share-links/${id}`, { method: "PATCH", body: {} })).data;
}

export async function getSharedContent(token: string) {
  return (await apiRequest<Schema<"SharedContent">>(`/api/v1/shared/${token}`, { baseUrl: API_BASE_URL, credentials: "omit" })).data;
}

export async function requestPrivacyJob(type: "exports" | "deletions") {
  const job = (await request<Schema<"PrivacyJobResponse">>(`/api/v1/privacy/${type}`, { method: "POST", body: {} })).data;
  if (type === "deletions" && job.status === "COMPLETED") {
    clearAuthSession();
    window.localStorage.removeItem(JOURNEY_KEY);
  }
  return job;
}

export async function downloadPrivacyExport(jobId: number) {
  const exportData = (await request<Record<string, unknown>>(`/api/v1/privacy/exports/${jobId}`)).data;
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = "sajurium-account-export.json";
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function submitReportFeedback(reportId: string, rating: "helpful" | "unclear" | "wrong", detailReason: string, reported: boolean) {
  const serverRating = reported || rating === "wrong" ? "reported" : rating === "helpful" ? "helpful" : "not_helpful";
  return (await request<Schema<"Feedback">>("/api/v1/feedback", { method: "POST", body: { report_id: Number(reportId), rating: serverRating, detail_reason: detailReason } })).data;
}

export async function createCompatibility(profileAId: string, profileBId: string, relation: "couple" | "friend" | "colleague" | "family"): Promise<ServerCompatibility> {
  await Promise.all([request(`/api/v1/profiles/${profileAId}/chart`, { method: "POST", body: {} }), request(`/api/v1/profiles/${profileBId}/chart`, { method: "POST", body: {} })]);
  const result = (await request<ApiCompatibility>("/api/v1/compatibilities", { method: "POST", body: { profile_a_id: Number(profileAId), profile_b_id: Number(profileBId), relation_type: relation } })).data;
  const preview = ((result.result ?? {}) as { free_preview?: { summary?: string; limited_by_unknown_time?: boolean } }).free_preview;
  return { id: String(result.id), relation: result.relation_type, summary: preview?.summary ?? "관계 결과를 준비했습니다.", limitedByUnknownTime: preview?.limited_by_unknown_time ?? false, createdAt: toIso(result.created_at)! };
}

function reportStatus(value: string): LiveReport["status"] {
  return value === "READY" || value === "FAILED" || value === "GENERATING" ? value : "QUEUED";
}

function reportSections(report: ApiReport) {
  const raw = Array.isArray(report.content_json?.sections) ? report.content_json.sections : [];
  if (!raw.length) {
    return [{ section_id: "summary", title: report.title, access: report.requires_payment ? "LOCKED" : "FREE", content: report.content, evidence: [] }] as LiveReport["sections"];
  }
  return raw.map((section, index) => {
    const record = typeof section === "object" && section !== null ? section as Record<string, unknown> : {};
    const locked = record.locked === true || record.is_free === false && !report.purchased;
    return {
      section_id: String(record.key ?? index),
      title: String(record.title ?? report.title),
      access: locked ? "LOCKED" : report.requires_payment ? "PAID" : "FREE",
      content: typeof record.body === "string" ? record.body : null,
      evidence: [],
    };
  }) as LiveReport["sections"];
}

function toLiveReport(report: ApiReport, journey?: ServerJourney | null): LiveReport {
  return {
    report_id: String(report.id),
    chart_id: String(report.chart_snapshot_id),
    profile_id: journey?.profileId ?? "",
    kind: report.report_type.toUpperCase(),
    status: reportStatus(report.generation_status),
    sections: reportSections(report),
    excluded_scopes: [],
    provenance: {
      model_version: report.model_version ?? "template",
      prompt_version: report.prompt_version ?? "template",
      template_version: report.template_version ?? "sasaju",
    },
    created_at: toIso(report.created_at)!,
    updated_at: toIso(report.updated_at ?? report.created_at)!,
  };
}

export async function createBasicReading(profile: ProfileInput): Promise<{ journey: ServerJourney; report: LiveReport }> {
  const created = (await request<ApiProfile[]>("/api/v1/profiles/", { method: "POST", body: profilePayload(profile) })).data;
  const savedProfile = created.at(-1);
  if (!savedProfile) throw new Error("프로필 저장 결과가 없습니다.");
  const chart = (await request<ApiChart>(`/api/v1/profiles/${savedProfile.id}/chart`, { method: "POST", body: {} })).data;
  const report = (await request<ApiReport>(`/api/v1/charts/${chart.id}/reports/basic`, { method: "POST", body: {} })).data;
  const journey = { profileId: String(savedProfile.id), chartId: String(chart.id), reportId: String(report.id) };
  window.localStorage.setItem(JOURNEY_KEY, JSON.stringify(journey));
  return { journey, report: toLiveReport(report, journey) };
}

export function readServerJourney(): ServerJourney | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(JOURNEY_KEY) ?? "null") as Partial<ServerJourney> | null;
    return value && typeof value.profileId === "string" && typeof value.chartId === "string" && typeof value.reportId === "string" ? value as ServerJourney : null;
  } catch {
    return null;
  }
}

export async function getCurrentReport(): Promise<LiveReport | null> {
  const journey = readServerJourney();
  if (!journey) return null;
  return toLiveReport((await request<ApiReport>(`/api/v1/reports/${journey.reportId}`)).data, journey);
}

export async function getFlow(scope: "today" | "month" | "year"): Promise<LiveReport> {
  const journey = readServerJourney();
  if (!journey) throw new Error("먼저 출생 정보와 명식 계산을 완료해 주세요.");
  const report = (await request<ApiReport>(`/api/v1/profiles/${journey.profileId}/flow/${scope}`)).data;
  return toLiveReport(report, journey);
}

function toProductView(product: ApiProduct): ProductView | null {
  const id = PRODUCT_IDS[product.code];
  if (!id) return null;
  const kind = product.product_type === "credit_pack" ? "consultation_credit" : "report";
  return {
    id,
    slug: id,
    version: String(product.version),
    status: product.is_active ? "active" : "retired",
    kind,
    title: product.name,
    description: product.description ?? "서버 상품 카탈로그",
    answersQuestions: [],
    requiredInputs: kind === "report" ? ["프로필", "명식"] : ["상담 프로필"],
    priceAmount: product.price,
    priceCurrency: product.currency,
    requiresBirthTime: false,
    includedSections: [],
    generationMethod: "서버 검증 후 생성",
    refundPolicy: "결제 완료 후 주문 상태와 정책에 따라 처리합니다.",
  };
}

export async function listProducts(): Promise<ProductView[]> {
  return (await request<ApiProduct[]>("/api/v1/products")).data.map(toProductView).filter((product): product is ProductView => product !== null);
}

export async function getProduct(productId: string) {
  const product = (await listProducts()).find((item) => item.id === productId);
  if (!product) throw new Error("서버 카탈로그에서 상품을 찾을 수 없습니다.");
  return product;
}

function consultationTopic(value: string) {
  return value === "love" || value === "career" || value === "wealth" ? value : "general";
}

export async function createOrder(productId: string): Promise<LiveOrder> {
  const productCode = PRODUCT_CODES[productId];
  if (!productCode) throw new Error("이 상품은 실제 카탈로그에 없습니다.");
  const order = (await request<ApiOrder>("/api/v1/orders", {
    method: "POST",
    body: { product_code: productCode, idempotency_key: newIdempotencyKey("order") },
  })).data;
  return toLiveOrder(order);
}

function toLiveOrder(order: ApiOrder): LiveOrder {
  return { order_id: String(order.id), status: order.status, amount_minor: order.amount, currency: order.currency, product_id: PRODUCT_IDS[order.product_code] ?? order.product_code, created_at: toIso(order.created_at)! };
}

export async function getOrder(orderId: string): Promise<LiveOrder> {
  return toLiveOrder((await request<ApiOrder>(`/api/v1/orders/${orderId}`)).data);
}

function ledgerReason(value: string): CreditLedgerEntry["reason"] {
  const map: Record<string, CreditLedgerEntry["reason"]> = { PURCHASE_GRANT: "purchase", FREE_GRANT: "free_grant", CONSULTATION_USE: "consultation_use", REFUND: "refund", ERROR_RECOVERY: "error_recovery", ADMIN_ADJUSTMENT: "admin_adjustment" };
  return map[value] ?? "event_grant";
}

export async function getCredits(): Promise<CreditSnapshot> {
  const [balance, ledger] = await Promise.all([
    request<Schema<"CreditBalance">>("/api/v1/credits"),
    request<Schema<"CreditLedger">[]>("/api/v1/credit-ledger"),
  ]);
  return {
    balance: { balance: balance.data.balance },
    ledger: { items: ledger.data.map((item) => ({ id: String(item.id), delta: item.change_amount, balanceAfter: item.balance_after, source: item.order_id ? "order" : item.consultation_message_id ? "consultation" : "system", sourceId: item.order_id ? String(item.order_id) : item.consultation_message_id ? String(item.consultation_message_id) : null, reason: ledgerReason(item.transaction_type), description: item.description ?? "", createdAt: toIso(item.created_at)! })) },
  };
}

function normalizeConsultation(session: ApiConsultation): ApiConsultation {
  return {
    ...session,
    created_at: toIso(session.created_at)!,
    updated_at: toIso(session.updated_at),
    messages: session.messages.map((message) => ({ ...message, created_at: toIso(message.created_at)! })),
  };
}

export async function createConsultation(topic: string, content: string): Promise<ApiConsultation> {
  const journey = readServerJourney();
  if (!journey) throw new Error("먼저 출생 정보와 명식 계산을 완료해 주세요.");
  const session = (await request<ApiConsultation>("/api/v1/consultations", { method: "POST", body: { profile_id: Number(journey.profileId), consultation_type: consultationTopic(topic) } })).data;
  return sendConsultationMessage(String(session.id), content);
}

export async function sendConsultationMessage(sessionId: string, content: string): Promise<ApiConsultation> {
  await request<Schema<"MessageAcceptedResponse">>(`/api/v1/consultations/${sessionId}/messages`, { method: "POST", body: { content, idempotency_key: newIdempotencyKey("consultation") } });
  return normalizeConsultation((await request<ApiConsultation>(`/api/v1/consultations/${sessionId}`)).data);
}

export async function getConsultation(sessionId: string): Promise<ApiConsultation> {
  return normalizeConsultation((await request<ApiConsultation>(`/api/v1/consultations/${sessionId}`)).data);
}

export async function deleteConsultation(sessionId: string) {
  await request(`/api/v1/consultations/${sessionId}`, { method: "DELETE" });
}

export async function listConsultations(): Promise<{ items: ApiConsultation[] }> {
  const sessions = (await request<Schema<"ConsultationSession">[]>("/api/v1/consultations")).data;
  const details = await Promise.all(sessions.map((session) => request<ApiConsultation>(`/api/v1/consultations/${session.id}`).then((response) => normalizeConsultation(response.data))));
  return { items: details };
}

export async function listLibrary(): Promise<{ items: LibraryItemView[] }> {
  const [reports, consultations] = await Promise.all([
    request<ApiReport[]>("/api/v1/reports"),
    listConsultations(),
  ]);
  const reportItems = reports.data.map((report) => {
    const item = { id: `report-${report.id}`, type: "report" as const, title: report.title, subtitle: report.summary ?? report.content.slice(0, 120), href: `/report?reportId=${report.id}`, access: report.requires_payment && !report.purchased ? "locked" as const : "available" as const, purchased: report.purchased, read: false, hidden: report.is_hidden, profile: { id: String(report.user_id), displayName: "내 기록" }, topic: null, createdAt: toIso(report.created_at)! };
    return { ...item, allowedActions: (item.access === "available" ? ["open", "delete"] : ["open"]) as LibraryAction[] };
  });
  const consultationItems = consultations.items.map((session) => {
    const item = { id: `consultation-${session.id}`, type: "consultation" as const, title: session.session_title ?? "상담 기록", subtitle: session.messages.at(-1)?.content.slice(0, 120) ?? "상담을 이어볼 수 있어요.", href: `/consult/session/${session.id}`, access: "available" as const, purchased: false, read: false, hidden: session.status === "DELETED", profile: { id: String(session.profile_id ?? ""), displayName: "내 기록" }, topic: null, createdAt: session.created_at };
    return { ...item, allowedActions: ["open", "delete"] as LibraryAction[] };
  });
  return { items: [...reportItems, ...consultationItems].sort((left, right) => right.createdAt.localeCompare(left.createdAt)) };
}

export async function deleteLibraryItem(id: string): Promise<void> {
  const [type, rawId] = id.split("-", 2);
  if (!rawId || !/^\d+$/.test(rawId)) throw new Error("보관함 항목 식별자가 올바르지 않습니다.");
  if (type === "report") return void await request(`/api/v1/reports/${rawId}`, { method: "DELETE" });
  if (type === "consultation") return void await request(`/api/v1/consultations/${rawId}`, { method: "DELETE" });
  throw new Error("이 항목은 서버에서 삭제할 수 없습니다.");
}
