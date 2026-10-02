import type { components } from "@/lib/api/sasaju.generated";
import type { CreditLedgerEntry, LibraryAction, LibraryItemView, ProductView, ProfileInput } from "@/lib/contracts";
import type { ProductId } from "@/lib/domain";
import { ApiRequestError, apiRequest } from "@/lib/api/client";
import { toChartView, type ChartView } from "@/lib/saju";
import { markdownPreview, markdownTitle } from "@/lib/markdown";

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
  title: string;
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
  order_number: string;
  status: string;
  fulfillment_status: string | null;
  amount_minor: number;
  currency: string;
  product_id: string;
  product_name: string;
  created_at: string;
  /** Reference profile the order was bought for. Null for credit packs, or once the profile was deleted. */
  profile_id: string | null;
  profile_display_name: string | null;
  partner_profile_id: string | null;
  partner_profile_display_name: string | null;
  relation_type: string | null;
};

export type LiveRefund = { id: string; orderId: string; amount: number; reason: string | null; status: string; createdAt: string };
/** A row of `GET /refunds`: my refund requests across all orders, with the order number and product name. */
export type LiveRefundListItem = LiveRefund & { orderNumber: string | null; productName: string | null };

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

export type SocialProvider = "google" | "apple" | "kakao";
export type ServerNotification = Schema<"NotificationDelivery">;

export type LogoutResult = "complete" | "local-only";

/**
 * Server product code -> client product id. Every active server product must be either mapped here
 * or listed in `UNLISTED_PRODUCT_CODES`; `tests/unit/product-catalog.test.ts` checks this against the
 * server seed so a new server product cannot silently vanish from the product list.
 */
export const PRODUCT_IDS: Readonly<Record<string, ProductId>> = {
  report_love_deep: "love-report",
  report_career_deep: "career-report",
  report_wealth_deep: "money-report",
  report_family_deep: "family-report",
  compatibility_deep: "compatibility-report",
  report_decade_deep: "decade-report",
  credit_pack_5: "consult-5",
  credit_pack_1: "consult-1",
};

/**
 * Active server products the product list deliberately does not show. `report_basic` is the free
 * basic report every user gets from `/report`; it is not something to buy.
 */
export const UNLISTED_PRODUCT_CODES: ReadonlySet<string> = new Set(["report_basic"]);

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

/** Which session this browser holds, for choosing account copy. Never exposes tokens. */
export function getSessionKind(): SessionKind | "none" {
  const session = readAuthSession();
  return session && session.accessToken ? session.kind : "none";
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

export async function loginSocialAccount(provider: SocialProvider, idToken: string): Promise<AccountAuthResult> {
  if (!idToken.trim()) throw new Error("소셜 로그인 응답에 인증 토큰이 없습니다.");
  const anonymousToken = readAuthSession()?.anonymousToken ?? null;
  const token = (await apiRequest<Schema<"Token">>("/api/v1/auth/social", {
    baseUrl: API_BASE_URL,
    credentials: "omit",
    method: "POST",
    body: { provider, id_token: idToken },
  })).data;
  storeAccountSession(token);
  const migration = await migrateAnonymousSession(token.access_token, anonymousToken);
  return { token, migration };
}

/* ---------- Login methods (account linking) ---------- */

export type LinkedIdentity = { provider: string; linkedAt: string };
export type AccountIdentities = { hasPassword: boolean; email: string | null; identities: LinkedIdentity[] };
export type IdentityLinkResult = { provider: string; linkedAt: string | null; status: string };

const SOCIAL_PROVIDERS: readonly SocialProvider[] = ["google", "apple", "kakao"];

/**
 * Providers the backend currently accepts (`GET /auth/social/providers`, public). A provider is
 * enabled only when the global switch and its own switch are both on. Unknown names are dropped.
 */
export async function listEnabledSocialProviders(): Promise<SocialProvider[]> {
  const result = (await apiRequest<Schema<"SocialProvidersResponse">>("/api/v1/auth/social/providers", { baseUrl: API_BASE_URL, credentials: "omit" })).data;
  if (!result.enabled) return [];
  return result.providers
    .filter((item) => item.enabled)
    .map((item) => item.provider)
    .filter((provider): provider is SocialProvider => (SOCIAL_PROVIDERS as readonly string[]).includes(provider));
}

export async function listIdentities(): Promise<AccountIdentities> {
  const data = (await request<Schema<"IdentitiesResponse">>("/api/v1/auth/identities")).data;
  return {
    hasPassword: data.has_password,
    email: data.email ?? null,
    identities: data.identities.map((item) => ({ provider: item.provider, linkedAt: toIso(item.linked_at)! })),
  };
}

/** Links a provider identity to the signed-in account. The id_token comes from the same provider button the login screen uses. */
export async function linkIdentity(provider: SocialProvider, idToken: string): Promise<IdentityLinkResult> {
  if (!idToken.trim()) throw new Error("소셜 계정 응답에 인증 토큰이 없어요. 다시 연결해 주세요.");
  const body: Schema<"IdentityLinkRequest"> = { provider, id_token: idToken };
  const data = (await request<{ provider: string; linked_at?: string | null; status: string }>("/api/v1/auth/identities", { method: "POST", body })).data;
  return { provider: data.provider, linkedAt: toIso(data.linked_at ?? null), status: data.status };
}

export async function unlinkIdentity(provider: string): Promise<{ provider: string; status: string }> {
  return (await request<{ provider: string; status: string }>(`/api/v1/auth/identities/${encodeURIComponent(provider)}`, { method: "DELETE" })).data;
}

const IDENTITY_ERROR_MESSAGES: Record<string, string> = {
  ACCOUNT_REQUIRED: "로그인 수단은 회원 계정에서만 관리할 수 있어요. 먼저 로그인하거나 계정을 만들어 주세요.",
  IDENTITY_ALREADY_LINKED: "이 소셜 계정은 이미 다른 회원 계정에 연결되어 있어요. 그 계정을 쓰려면 이 소셜 계정으로 로그인해 주세요.",
  PROVIDER_ALREADY_LINKED: "이 계정에는 같은 서비스의 다른 소셜 계정이 이미 연결되어 있어요. 기존 연결을 해제한 뒤 다시 연결해 주세요.",
  LAST_LOGIN_METHOD: "남은 로그인 수단이 이것뿐이라 해제할 수 없어요. 다른 로그인 수단을 먼저 연결해 주세요.",
  IDENTITY_NOT_FOUND: "이미 해제됐거나 연결되지 않은 로그인 수단이에요.",
  SOCIAL_LOGIN_DISABLED: "지금은 소셜 계정을 연결할 수 없어요. 나중에 다시 확인해 주세요.",
  SOCIAL_PROVIDER_DISABLED: "이 소셜 계정은 지금 연결할 수 없어요.",
  SOCIAL_PROVIDER_NOT_CONFIGURED: "이 소셜 계정 연결은 아직 준비 중이에요.",
  SOCIAL_PROVIDER_UNAVAILABLE: "소셜 계정 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
  INVALID_SOCIAL_TOKEN: "소셜 계정 인증을 확인하지 못했어요. 처음부터 다시 연결해 주세요.",
  SOCIAL_LOGIN_RATE_LIMITED: "연결 시도가 많았어요. 잠시 후 다시 시도해 주세요.",
};

/** Korean copy for identity list/link/unlink failures; other errors fall back to `formatApiRequestError`. */
export function formatIdentityError(error: unknown, fallback = "로그인 수단을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요."): string {
  if (error instanceof ApiRequestError && !isCredentialRejection(error)) {
    const message = IDENTITY_ERROR_MESSAGES[error.error.code];
    if (message) return error.error.request_id ? `${message} (문의 시 참조 ID: ${error.error.request_id})` : message;
  }
  return formatApiRequestError(error, fallback);
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

/**
 * Copy for a failed read: server errors keep their message and reference ID, while a network
 * failure (fetch rejects with `TypeError: Failed to fetch`, or the request was aborted) gets
 * Korean connection copy instead of the browser's English message.
 */
export function formatConnectionError(error: unknown, fallback = "연결 상태를 확인한 뒤 다시 시도해 주세요."): string {
  if (error instanceof Error && (error.name === "TypeError" || error.name === "AbortError")) return fallback;
  return formatApiRequestError(error, fallback);
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

/* ---------- Profile birth edit ---------- */

export type ServerProfileDetail = {
  id: string;
  nickname: string;
  isSelf: boolean;
  relationship: string | null;
  birthYear: number;
  birthMonth: number;
  birthDay: number;
  birthTimeHour: number | null;
  birthTimeMinute: number | null;
  birthTimeUnknown: boolean;
  calendar: "solar" | "lunar";
  leapMonth: boolean;
  birthLocation: string | null;
  gender: "female" | "male";
};

export type ProfileBirthUpdate = Omit<ServerProfileDetail, "id" | "isSelf" | "relationship">;

function toProfileDetail(profile: Schema<"SajuProfileDetail">): ServerProfileDetail {
  return {
    id: String(profile.id),
    nickname: profile.nickname,
    isSelf: profile.is_self,
    relationship: profile.relationship_type ?? null,
    birthYear: profile.birth_year,
    birthMonth: profile.birth_month,
    birthDay: profile.birth_day,
    birthTimeHour: profile.birth_time_unknown ? null : profile.birth_time_hour ?? null,
    birthTimeMinute: profile.birth_time_unknown ? null : profile.birth_time_minute ?? null,
    birthTimeUnknown: profile.birth_time_unknown,
    calendar: profile.calendar_type === "lunar" ? "lunar" : "solar",
    leapMonth: profile.is_leap_month,
    birthLocation: profile.birth_location ?? null,
    gender: profile.gender_for_calculation === "male" ? "male" : "female",
  };
}

export async function getProfile(profileId: string): Promise<ServerProfileDetail> {
  return toProfileDetail((await request<Schema<"SajuProfileDetail">>(`/api/v1/profiles/${profileId}`)).data);
}

/**
 * Saves edited birth information, then calculates a new chart snapshot. The server never
 * overwrites earlier charts or reports, so they stay in the library. When the edited profile is
 * the one this browser's journey points at, a new basic report is made for the new chart and the
 * journey moves to it so the chart and report screens show the same snapshot.
 */
export async function updateProfileBirth(profileId: string, update: ProfileBirthUpdate): Promise<{ profile: ServerProfileDetail; chartId: string; journey: ServerJourney | null }> {
  const body: Schema<"SajuProfileUpdate"> = {
    nickname: update.nickname,
    birth_year: update.birthYear,
    birth_month: update.birthMonth,
    birth_day: update.birthDay,
    birth_time_unknown: update.birthTimeUnknown,
    birth_time_hour: update.birthTimeUnknown ? null : update.birthTimeHour,
    birth_time_minute: update.birthTimeUnknown ? null : update.birthTimeMinute ?? 0,
    calendar_type: update.calendar,
    is_leap_month: update.calendar === "lunar" && update.leapMonth,
    birth_location: update.birthLocation,
    gender_for_calculation: update.gender,
  };
  const profile = toProfileDetail((await request<Schema<"SajuProfileDetail">>(`/api/v1/profiles/${profileId}`, { method: "PATCH", body })).data);
  const chart = (await request<ApiChart>(`/api/v1/profiles/${profileId}/chart`, { method: "POST", body: {} })).data;
  const current = readServerJourney();
  if (!current || current.profileId !== profileId) return { profile, chartId: String(chart.id), journey: null };
  const report = (await request<ApiReport>(`/api/v1/charts/${chart.id}/reports/basic`, { method: "POST", body: {} })).data;
  const journey = { profileId, chartId: String(chart.id), reportId: String(report.id) };
  window.localStorage.setItem(JOURNEY_KEY, JSON.stringify(journey));
  return { profile, chartId: journey.chartId, journey };
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

export async function listNotifications(): Promise<ServerNotification[]> {
  return (await request<ServerNotification[]>("/api/v1/notifications")).data;
}

/* ---------- Notification read state ---------- */

/** Window event the inbox dispatches with the new unread count, so the header bell follows along. */
export const UNREAD_COUNT_EVENT = "sajurium:unread-notifications";

export function announceUnreadCount(count: number) {
  window.dispatchEvent(new CustomEvent(UNREAD_COUNT_EVENT, { detail: count }));
}

/**
 * Unread inbox count for the header badge. Without a stored session there is no inbox yet, and
 * asking the server would mint an anonymous user just to learn the answer is zero.
 */
export async function getUnreadNotificationCount(): Promise<number> {
  if (!readAccessToken()) return 0;
  return (await request<Schema<"NotificationUnreadCount">>("/api/v1/notifications/unread-count")).data.unread_count;
}

/** Marks one notification read; the server answers with the updated row (`read_at` set). */
export async function markNotificationRead(id: number): Promise<ServerNotification> {
  return (await request<ServerNotification>(`/api/v1/notifications/${id}/read`, { method: "POST", body: {} })).data;
}

export async function markAllNotificationsRead(): Promise<{ updatedCount: number; unreadCount: number }> {
  const result = (await request<Schema<"NotificationReadAllResult">>("/api/v1/notifications/read-all", { method: "POST", body: {} })).data;
  return { updatedCount: result.updated_count, unreadCount: result.unread_count };
}

export async function registerPushToken(token: string) {
  return (await request<{ push_token_id: number; status: string }>("/api/v1/push-tokens", {
    method: "POST", body: { token, platform: "web" },
  })).data;
}

export async function revokePushToken(token: string) {
  return (await request<{ status: string }>("/api/v1/push-tokens", {
    method: "DELETE", body: { token },
  })).data;
}

/* ---------- Share links ---------- */

export type ShareTargetType = "report" | "compatibility";

/**
 * Public fields a share link may expose, per target and in the server's order. The server rejects any
 * other key, a report key on a compatibility link (and the reverse), and an empty list.
 */
export const SHARE_INCLUDE_KEYS = {
  report: ["summary", "day_pillar", "five_elements", "birth_date", "birth_time"],
  compatibility: ["summary", "dimensions"],
} as const satisfies Record<ShareTargetType, readonly string[]>;
export type ShareIncludeKey = (typeof SHARE_INCLUDE_KEYS)[ShareTargetType][number];
/** What a new link carries when nothing was chosen: birth fields stay off for reports. */
export const DEFAULT_SHARE_INCLUDE: Record<ShareTargetType, readonly ShareIncludeKey[]> = {
  report: ["summary", "day_pillar", "five_elements"],
  compatibility: ["summary", "dimensions"],
};

export async function createShareLink(target: { type: ShareTargetType; id: string | number }, hours = 72, include: readonly ShareIncludeKey[] = DEFAULT_SHARE_INCLUDE[target.type]) {
  const allowed: readonly ShareIncludeKey[] = SHARE_INCLUDE_KEYS[target.type];
  const selected = allowed.filter((key) => include.includes(key));
  if (selected.length === 0) throw new Error("공유할 정보를 하나 이상 골라 주세요.");
  return (await request<Schema<"ShareLink">>("/api/v1/share-links", { method: "POST", body: { target_type: target.type, target_id: Number(target.id), expires_in_hours: hours, include: selected } })).data;
}

export async function createReportShare(hours = 72, include: readonly ShareIncludeKey[] = DEFAULT_SHARE_INCLUDE.report) {
  const journey = readServerJourney();
  if (!journey) throw new Error("먼저 리포트를 생성해 주세요.");
  return createShareLink({ type: "report", id: journey.reportId }, hours, include);
}

export async function createCompatibilityShare(compatibilityId: string, hours = 72, include: readonly ShareIncludeKey[] = DEFAULT_SHARE_INCLUDE.compatibility) {
  return createShareLink({ type: "compatibility", id: compatibilityId }, hours, include);
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

/* ---------- Feedback ---------- */

export type FeedbackRating = "helpful" | "unclear" | "wrong";
export type ServerFeedbackRating = "helpful" | "unclear" | "inaccurate" | "reported";
export type FeedbackTargetRef = { type: "report"; reportId: string } | { type: "consultation_message"; messageId: string };
export type ServerFeedbackItem = {
  id: string;
  targetType: "report" | "consultation";
  targetTitle: string | null;
  reportId: string | null;
  consultationSessionId: string | null;
  rating: ServerFeedbackRating | "not_helpful" | null;
  detailReason: string | null;
  reportReason: string | null;
  status: "RECEIVED" | "REVIEWING" | "RESOLVED" | string;
  createdAt: string;
};

/** A report always wins over the chosen rating; otherwise each screen rating maps to its own server value. */
export function serverFeedbackRating(rating: FeedbackRating, reported: boolean): ServerFeedbackRating {
  if (reported) return "reported";
  return rating === "wrong" ? "inaccurate" : rating;
}

export async function submitFeedback(
  target: FeedbackTargetRef,
  { rating, reported = false, reason = null, comment = "" }: { rating: FeedbackRating; reported?: boolean; reason?: string | null; comment?: string },
) {
  const detail = [reason, comment.trim()].filter(Boolean).join("\n") || null;
  const body: Schema<"FeedbackCreate"> = {
    ...(target.type === "report" ? { report_id: Number(target.reportId) } : { consultation_message_id: Number(target.messageId) }),
    rating: serverFeedbackRating(rating, reported),
    detail_reason: detail,
    report_reason: reported ? reason || "문제 신고" : null,
  };
  return (await request<Schema<"Feedback">>("/api/v1/feedback", { method: "POST", body })).data;
}

export async function listFeedback(): Promise<ServerFeedbackItem[]> {
  const rows = (await request<Schema<"FeedbackListItem">[]>("/api/v1/feedback?limit=100")).data;
  return rows.map((row) => ({
    id: String(row.id),
    targetType: row.target_type === "consultation" ? "consultation" : "report",
    targetTitle: row.target_title ?? null,
    reportId: row.report_id != null ? String(row.report_id) : null,
    consultationSessionId: row.consultation_session_id != null ? String(row.consultation_session_id) : null,
    rating: (row.rating ?? null) as ServerFeedbackItem["rating"],
    detailReason: row.detail_reason ?? null,
    reportReason: row.report_reason ?? null,
    status: row.status,
    createdAt: toIso(row.created_at)!,
  }));
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
      content: locked ? null : typeof record.body === "string" ? record.body : null,
      evidence: locked ? [] : stringList(record.evidence),
    };
  }) as LiveReport["sections"];
}

/** Section keys the server excluded because the birth time is unknown. Empty when nothing was excluded. */
function excludedScopes(report: ApiReport): string[] {
  const content = report.content_json ?? null;
  const listed = (content?.excluded_sections ?? []).map((section) => section.key);
  if (listed.length) return listed;
  const sections = Array.isArray(content?.sections) ? content.sections : [];
  return sections.some((section) => (section as { key?: unknown }).key === "excluded_scope") ? ["hour_pillar"] : [];
}

function toLiveReport(report: ApiReport, journey?: ServerJourney | null): LiveReport {
  return {
    report_id: String(report.id),
    title: report.title,
    chart_id: String(report.chart_snapshot_id),
    profile_id: journey?.profileId ?? "",
    kind: report.report_type.toUpperCase(),
    status: reportStatus(report.generation_status),
    sections: reportSections(report),
    excluded_scopes: excludedScopes(report),
    provenance: {
      model_version: report.model_version ?? "template",
      prompt_version: report.prompt_version ?? "template",
      template_version: report.template_version ?? "sasaju",
    },
    created_at: toIso(report.created_at)!,
    updated_at: toIso(report.updated_at ?? report.created_at)!,
  };
}

/* ---------- Compatibility results ---------- */

/** One piece of structured evidence behind a perspective summary; `person` refers to profile a or b. */
export type CompatibilityEvidence =
  | { type: "day_gan"; person: "a" | "b"; gan: string; element: string }
  | { type: "day_gan_relation"; relation: "same" | "a_generates_b" | "b_generates_a" | "a_controls_b" | "b_controls_a" }
  | { type: "five_elements"; element: string; a: number; b: number };

export type CompatibilityDimension = { key: string; title: string; summary: string; evidence: CompatibilityEvidence[] };
export type CompatibilityPaidSection = { title: string; body: string | null; locked: boolean };

export type ServerCompatibilityDetail = {
  id: string;
  relation: "couple" | "friend" | "colleague" | "family" | string;
  summary: string;
  limitedByUnknownTime: boolean;
  /** The server's own unknown-birth-time notice, present only when `limitedByUnknownTime`. */
  notice: string | null;
  dimensions: CompatibilityDimension[];
  profileAId: string;
  profileBId: string;
  snapshotAId: string;
  snapshotBId: string;
  status: string;
  /** Paid sections: before purchase only the title (`locked`), after purchase the body too. */
  paidSections: CompatibilityPaidSection[];
  createdAt: string;
};

const DAY_GAN_RELATIONS = new Set(["same", "a_generates_b", "b_generates_a", "a_controls_b", "b_controls_a"]);

/** Keeps the evidence shapes this client can phrase; anything else is dropped rather than shown raw. */
function toEvidence(value: unknown): CompatibilityEvidence[] {
  if (!value || typeof value !== "object") return [];
  const item = value as Record<string, unknown>;
  if (item.type === "day_gan" && (item.person === "a" || item.person === "b") && typeof item.gan === "string" && typeof item.element === "string") {
    return [{ type: "day_gan", person: item.person, gan: item.gan, element: item.element }];
  }
  if (item.type === "day_gan_relation" && typeof item.relation === "string" && DAY_GAN_RELATIONS.has(item.relation)) {
    return [{ type: "day_gan_relation", relation: item.relation as Extract<CompatibilityEvidence, { type: "day_gan_relation" }>["relation"] }];
  }
  if (item.type === "five_elements" && typeof item.element === "string" && typeof item.a === "number" && typeof item.b === "number") {
    return [{ type: "five_elements", element: item.element, a: item.a, b: item.b }];
  }
  return [];
}

function toDimensions(value: unknown): CompatibilityDimension[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    if (typeof item.title !== "string" || typeof item.summary !== "string" || !item.summary.trim()) return [];
    return [{ key: String(item.key ?? item.title), title: item.title, summary: item.summary, evidence: Array.isArray(item.evidence) ? item.evidence.flatMap(toEvidence) : [] }];
  });
}

function compatibilityPreview(result: ApiCompatibility) {
  const value = (result.result ?? {}) as {
    free_preview?: { summary?: string; limited_by_unknown_time?: boolean; notice?: unknown; dimensions?: unknown };
    paid_detail?: { sections?: Array<{ title?: unknown; body?: unknown; locked?: unknown }> };
  };
  const limited = value.free_preview?.limited_by_unknown_time ?? false;
  const notice = value.free_preview?.notice;
  return {
    summary: value.free_preview?.summary ?? "관계 결과를 준비했습니다.",
    limited,
    notice: limited && typeof notice === "string" && notice.trim() ? notice : null,
    dimensions: toDimensions(value.free_preview?.dimensions),
    paid: (value.paid_detail?.sections ?? []).flatMap((section) => {
      if (typeof section.title !== "string") return [];
      const body = typeof section.body === "string" && section.body.trim() ? section.body : null;
      // A section without a body is never shown as open, whatever its flag says.
      return [{ title: section.title, body: section.locked === true ? null : body, locked: section.locked === true || body === null }];
    }),
  };
}

export async function getCompatibility(id: string): Promise<ServerCompatibilityDetail> {
  const result = (await request<ApiCompatibility>(`/api/v1/compatibilities/${id}`)).data;
  const preview = compatibilityPreview(result);
  return {
    id: String(result.id),
    relation: result.relation_type,
    summary: preview.summary,
    limitedByUnknownTime: preview.limited,
    notice: preview.notice,
    dimensions: preview.dimensions,
    profileAId: String(result.profile_a_id),
    profileBId: String(result.profile_b_id),
    snapshotAId: String(result.snapshot_a_id),
    snapshotBId: String(result.snapshot_b_id),
    status: result.generation_status,
    paidSections: preview.paid,
    createdAt: toIso(result.created_at)!,
  };
}

export async function getChart(chartId: string): Promise<ChartView> {
  return toChartView((await request<ApiChart>(`/api/v1/charts/${chartId}`)).data);
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

/** A stored report by id, such as one opened from the library, with the chart it was written from. */
export async function getReportWithChart(reportId: string): Promise<{ report: LiveReport; chart: ChartView | null }> {
  const report = (await request<ApiReport>(`/api/v1/reports/${encodeURIComponent(reportId)}`)).data;
  const chart = await request<ApiChart>(`/api/v1/charts/${report.chart_snapshot_id}`).then((response) => toChartView(response.data)).catch(() => null);
  return { report: toLiveReport(report), chart };
}

/** Asks the server to generate a FAILED report again. */
export async function retryReport(reportId: string) {
  await request(`/api/v1/reports/${encodeURIComponent(reportId)}/retry`, { method: "POST", body: {} });
}

export async function getCurrentChart(): Promise<ChartView | null> {
  const journey = readServerJourney();
  if (!journey) return null;
  return toChartView((await request<ApiChart>(`/api/v1/charts/${journey.chartId}`)).data);
}

/* ---------- Topic and decade reports ---------- */

/** Topics the server writes topic reports for. The client calls the money topic `money`; the server calls it `wealth`. */
export type ServerReportTopic = "love" | "career" | "wealth" | "family";

export function toServerReportTopic(topic: "love" | "career" | "money" | "family"): ServerReportTopic {
  return topic === "money" ? "wealth" : topic;
}

export type ReportSectionView = {
  key: string;
  title: string;
  /** Always null while the section is locked, whatever the response carried. */
  body: string | null;
  isFree: boolean;
  locked: boolean;
  evidence: string[];
  requiresBirthTime: boolean;
};

export type DaeunPeriodSummary = {
  sequence: number | null;
  ganji: string;
  startAge: number;
  endAge: number;
  startYear: number | null;
  endYear: number | null;
  stemTenGod: string;
  branchTenGod: string;
  isCurrent: boolean;
  evidence: string[];
};

export type TopicReport = {
  id: string;
  topic: ServerReportTopic;
  title: string;
  referenceYear: number | null;
  purchased: boolean;
  sections: ReportSectionView[];
  excludedDueToUnknownTime: boolean;
  excludedSections: Array<{ key: string; title: string; reason: string }>;
  currentPeriod: DaeunPeriodSummary | null;
};

export type DecadeReport = {
  id: string;
  title: string;
  referenceYear: number | null;
  purchased: boolean;
  sections: ReportSectionView[];
  periods: DaeunPeriodSummary[];
  currentPeriod: DaeunPeriodSummary | null;
};

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toSectionView(section: Schema<"ReportSection">, purchased: boolean): ReportSectionView {
  const locked = section.locked === true || (section.is_free === false && !purchased);
  return {
    key: section.key,
    title: section.title,
    body: locked || typeof section.body !== "string" ? null : section.body,
    isFree: section.is_free === true,
    locked,
    evidence: locked ? [] : stringList(section.evidence),
    requiresBirthTime: section.requires_birth_time === true,
  };
}

function toPeriodSummary(period: Schema<"DaeunPeriodView">): DaeunPeriodSummary {
  return {
    sequence: period.sequence ?? null,
    ganji: period.ganji,
    startAge: period.start_age,
    endAge: period.end_age,
    startYear: period.start_year ?? null,
    endYear: period.end_year ?? null,
    stemTenGod: period.stem_ten_god,
    branchTenGod: period.branch_ten_god,
    isCurrent: period.is_current === true,
    evidence: stringList(period.evidence),
  };
}

function reportContent(report: ApiReport) {
  const content = report.content_json ?? null;
  return {
    sections: (Array.isArray(content?.sections) ? content.sections : []).map((section) => toSectionView(section, report.purchased)),
    referenceYear: typeof content?.reference_year === "number" ? content.reference_year : null,
    currentPeriod: content?.current_period ? toPeriodSummary(content.current_period) : null,
  };
}

/** Creates (or, for the same chart, topic and year, returns again) the topic report: free preview sections plus locked paid titles. */
export async function getTopicReport(chartId: string, topic: ServerReportTopic): Promise<TopicReport> {
  const report = (await request<ApiReport>(`/api/v1/charts/${chartId}/reports/topics/${topic}`, { method: "POST", body: {} })).data;
  const content = report.content_json ?? null;
  return {
    id: String(report.id),
    topic,
    title: report.title,
    purchased: report.purchased,
    ...reportContent(report),
    excludedDueToUnknownTime: content?.excluded_due_to_unknown_time === true,
    excludedSections: (content?.excluded_sections ?? []).map(({ key, title, reason }) => ({ key, title, reason })),
  };
}

/** Creates (or returns again) the 10-year report: the daeun periods, free current-period commentary and locked per-period detail. */
export async function getDecadeReport(chartId: string): Promise<DecadeReport> {
  const report = (await request<ApiReport>(`/api/v1/charts/${chartId}/reports/decade`, { method: "POST", body: {} })).data;
  const periods = report.content_json?.periods;
  return {
    id: String(report.id),
    title: report.title,
    purchased: report.purchased,
    ...reportContent(report),
    periods: Array.isArray(periods) ? periods.map(toPeriodSummary) : [],
  };
}

export async function getFlow(scope: "today" | "month" | "year"): Promise<LiveReport> {
  const journey = readServerJourney();
  if (!journey) throw new Error("먼저 출생 정보와 명식 계산을 완료해 주세요.");
  const report = (await request<ApiReport>(`/api/v1/profiles/${journey.profileId}/flow/${scope}`)).data;
  return toLiveReport(report, journey);
}

function toProductView(product: ApiProduct): ProductView | null {
  const id = PRODUCT_IDS[product.code];
  if (!id) {
    if (!UNLISTED_PRODUCT_CODES.has(product.code) && process.env.NODE_ENV !== "production") {
      console.warn(`[sajurium] Server product "${product.code}" has no client mapping and is hidden from the product list. Add it to PRODUCT_IDS or UNLISTED_PRODUCT_CODES.`);
    }
    return null;
  }
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

/** Client display order: the `PRODUCT_IDS` order, so topic reports stay together whatever order the server seeded them in. */
const PRODUCT_ORDER: readonly string[] = Object.values(PRODUCT_IDS);

export async function listProducts(): Promise<ProductView[]> {
  return (await request<ApiProduct[]>("/api/v1/products")).data
    .map(toProductView)
    .filter((product): product is ProductView => product !== null)
    .sort((a, b) => PRODUCT_ORDER.indexOf(a.id) - PRODUCT_ORDER.indexOf(b.id));
}

export async function getProduct(productId: string) {
  const product = (await listProducts()).find((item) => item.id === productId);
  if (!product) throw new Error("서버 카탈로그에서 상품을 찾을 수 없습니다.");
  return product;
}

function consultationTopic(value: string) {
  return value === "love" || value === "career" || value === "wealth" ? value : "general";
}

export type CompatibilityRelation = "couple" | "friend" | "colleague" | "family";

/** Which reference profiles an order needs: none for credit packs, one for reports, two for compatibility. */
export type OrderProfileRequirement = "none" | "single" | "pair";

/** What the buyer picked in checkout. Ids are the string ids from `listProfiles()`. */
export type OrderProfileSelection = {
  profileId?: string | null;
  partnerProfileId?: string | null;
  relationType?: CompatibilityRelation | null;
};

export function orderProfileRequirement(productId: string): OrderProfileRequirement {
  const code = PRODUCT_CODES[productId];
  if (!code || code.startsWith("credit_pack")) return "none";
  return code.startsWith("compatibility") ? "pair" : "single";
}

/** Korean copy for a selection the server would reject, or null when the selection can be sent. */
export function validateOrderSelection(productId: string, selection: OrderProfileSelection): string | null {
  const requirement = orderProfileRequirement(productId);
  if (requirement === "none") return null;
  if (!selection.profileId) return requirement === "pair" ? "기준이 될 사람을 골라 주세요." : "어느 명식으로 볼지 골라 주세요.";
  if (requirement === "single") return null;
  if (!selection.partnerProfileId) return "함께 볼 사람을 골라 주세요.";
  if (selection.partnerProfileId === selection.profileId) return "서로 다른 두 사람을 골라 주세요.";
  return null;
}

/**
 * Body for `POST /orders`. Reports carry `profile_id`; compatibility carries both profiles and the
 * relation; credit packs carry neither (the server would ignore them anyway). Throws the Korean
 * validation copy when the selection is incomplete so an invalid body is never sent.
 */
export function buildOrderRequest(productId: string, selection: OrderProfileSelection, idempotencyKey: string): Schema<"OrderCreate"> {
  const productCode = PRODUCT_CODES[productId];
  if (!productCode) throw new Error("이 상품은 실제 카탈로그에 없습니다.");
  const invalid = validateOrderSelection(productId, selection);
  if (invalid) throw new Error(invalid);
  const body: Schema<"OrderCreate"> = { product_code: productCode, idempotency_key: idempotencyKey };
  const requirement = orderProfileRequirement(productId);
  if (requirement === "none") return body;
  body.profile_id = Number(selection.profileId);
  if (requirement === "pair") {
    body.partner_profile_id = Number(selection.partnerProfileId);
    body.relation_type = selection.relationType ?? "couple";
  }
  return body;
}

const ORDER_ERROR_COPY: Record<string, string> = {
  PROFILE_REQUIRED: "어느 명식으로 볼지 골라 주세요.",
  PROFILE_NOT_FOUND: "고른 사람을 찾을 수 없어요. 사람 보관함에서 지워졌을 수 있으니 목록을 새로 불러와 다시 골라 주세요.",
  CHART_REQUIRED: "고른 사람의 명식이 아직 없어요. 사람 보관함에서 명식을 계산한 뒤 다시 시도해 주세요.",
  SAME_PROFILE: "서로 다른 두 사람을 골라 주세요.",
  PAYMENTS_DISABLED: "결제와 주문은 준비 중이에요. 지금은 구매할 수 없어요.",
  PRODUCT_NOT_FOUND: "지금 판매하지 않는 상품이에요. 상품 목록에서 다시 골라 주세요.",
};

/** Korean copy for a failed `POST /orders`, covering the server's profile ownership and validation codes. */
export function formatOrderError(error: unknown): string {
  if (error instanceof ApiRequestError && !isCredentialRejection(error)) {
    const copy = ORDER_ERROR_COPY[error.error.code];
    if (copy) return `${copy}${error.error.request_id ? ` (문의 시 참조 ID: ${error.error.request_id})` : ""}`;
  }
  return formatApiRequestError(error, "주문을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
}

export function newOrderIdempotencyKey() {
  return newIdempotencyKey("order");
}

/** Pass the same key when retrying the same order so a lost response does not create a second order. */
export async function createOrder(productId: string, selection: OrderProfileSelection = {}, idempotencyKey = newOrderIdempotencyKey()): Promise<LiveOrder> {
  const body = buildOrderRequest(productId, selection, idempotencyKey);
  const order = (await request<ApiOrder>("/api/v1/orders", { method: "POST", body })).data;
  return toLiveOrder(order);
}

function toLiveOrder(order: ApiOrder): LiveOrder {
  return {
    order_id: String(order.id),
    order_number: order.order_number,
    status: order.status,
    fulfillment_status: order.fulfillment_status ?? null,
    amount_minor: order.amount,
    currency: order.currency,
    product_id: PRODUCT_IDS[order.product_code] ?? order.product_code,
    product_name: order.product_name,
    created_at: toIso(order.created_at)!,
    profile_id: order.profile_id != null ? String(order.profile_id) : null,
    profile_display_name: order.profile_display_name ?? null,
    partner_profile_id: order.partner_profile_id != null ? String(order.partner_profile_id) : null,
    partner_profile_display_name: order.partner_profile_display_name ?? null,
    relation_type: order.relation_type ?? null,
  };
}

export async function listOrders(): Promise<LiveOrder[]> {
  return (await request<ApiOrder[]>("/api/v1/orders")).data.map(toLiveOrder);
}

/** All of my refund requests in one call (`GET /refunds`, newest first). Works while payments are paused. */
export async function listRefunds(): Promise<LiveRefundListItem[]> {
  const refunds = (await request<Schema<"RefundListItem">[]>("/api/v1/refunds?skip=0&limit=50")).data;
  return refunds.map((refund) => ({
    id: String(refund.id),
    orderId: String(refund.order_id),
    orderNumber: refund.order_number ?? null,
    productName: refund.product_name ?? null,
    amount: refund.amount,
    reason: refund.reason ?? null,
    status: refund.status,
    createdAt: toIso(refund.created_at)!,
  }));
}

export async function getOrder(orderId: string): Promise<LiveOrder> {
  return toLiveOrder((await request<ApiOrder>(`/api/v1/orders/${orderId}`)).data);
}

export type LiveOrderRefund = { id: string; amount: number; reason: string | null; status: string; createdAt: string };

function toOrderRefund(refund: Schema<"Refund">): LiveOrderRefund {
  return { id: String(refund.id), amount: refund.amount, reason: refund.reason ?? null, status: refund.status, createdAt: toIso(refund.created_at)! };
}

/** Refund requests for one order. Works while payments are paused. */
export async function listOrderRefunds(orderId: string): Promise<LiveOrderRefund[]> {
  return (await request<Schema<"Refund">[]>(`/api/v1/orders/${orderId}/refunds`)).data.map(toOrderRefund);
}

export function newRefundIdempotencyKey() {
  return newIdempotencyKey("refund");
}

/** Requests a full refund of what is left on the order. Retrying with the same key returns the same refund. */
export async function requestRefund(orderId: string, reason: string, idempotencyKey: string): Promise<LiveOrderRefund> {
  const body: Schema<"RefundCreate"> = { reason: reason.trim() || null, idempotency_key: idempotencyKey };
  return toOrderRefund((await request<Schema<"Refund">>(`/api/v1/orders/${orderId}/refunds`, { method: "POST", body })).data);
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

/** One first question. Retrying the same attempt reuses its session and idempotency key, so a
 * retry after a lost response neither opens a second session nor spends a second credit. */
export type ConsultationAttempt = { sessionId: string | null; idempotencyKey: string };

export function newConsultationAttempt(): ConsultationAttempt {
  return { sessionId: null, idempotencyKey: newIdempotencyKey("consultation") };
}

export async function createConsultation(topic: string, content: string, attempt: ConsultationAttempt = newConsultationAttempt()): Promise<ApiConsultation> {
  if (!attempt.sessionId) {
    const journey = readServerJourney();
    if (!journey) throw new Error("먼저 출생 정보와 명식 계산을 완료해 주세요.");
    const session = (await request<ApiConsultation>("/api/v1/consultations", { method: "POST", body: { profile_id: Number(journey.profileId), consultation_type: consultationTopic(topic) } })).data;
    attempt.sessionId = String(session.id);
  }
  return sendConsultationMessage(attempt.sessionId, content, attempt.idempotencyKey);
}

export async function sendConsultationMessage(sessionId: string, content: string, idempotencyKey = newIdempotencyKey("consultation")): Promise<ApiConsultation> {
  await request<Schema<"MessageAcceptedResponse">>(`/api/v1/consultations/${sessionId}/messages`, { method: "POST", body: { content, idempotency_key: idempotencyKey } });
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

/** Library rows show a plain preview; stored reports and messages are never changed. */
const LIBRARY_TITLE_LENGTH = 80;

export async function listLibrary(): Promise<{ items: LibraryItemView[] }> {
  const [reports, consultations] = await Promise.all([
    request<ApiReport[]>("/api/v1/reports"),
    listConsultations(),
  ]);
  const reportItems = reports.data.map((report) => {
    const item = { id: `report-${report.id}`, type: "report" as const, title: markdownTitle(report.title, LIBRARY_TITLE_LENGTH) || "사주 리포트", subtitle: markdownPreview(report.summary) || markdownPreview(report.content) || "리포트를 열어 내용을 볼 수 있어요.", href: `/report?reportId=${report.id}`, access: report.requires_payment && !report.purchased ? "locked" as const : "available" as const, purchased: report.purchased, read: false, hidden: report.is_hidden, profile: { id: String(report.user_id), displayName: "내 기록" }, topic: null, createdAt: toIso(report.created_at)! };
    return { ...item, allowedActions: (item.access === "available" ? ["open", "delete"] : ["open"]) as LibraryAction[] };
  });
  const consultationItems = consultations.items.map((session) => {
    const item = { id: `consultation-${session.id}`, type: "consultation" as const, title: markdownTitle(session.session_title, LIBRARY_TITLE_LENGTH) || "상담 기록", subtitle: markdownPreview(session.messages.at(-1)?.content) || "상담을 이어볼 수 있어요.", href: `/consult/session/${session.id}`, access: "available" as const, purchased: false, read: false, hidden: session.status === "DELETED", profile: { id: String(session.profile_id ?? ""), displayName: "내 기록" }, topic: null, createdAt: session.created_at };
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
