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
};

export type LiveRefund = { id: string; orderId: string; amount: number; reason: string | null; status: string; createdAt: string };

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
  compatibility_deep: "compatibility-report",
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

/** Public fields a share link may expose; the server rejects anything else and an empty list. */
export const SHARE_INCLUDE_KEYS = ["summary", "day_pillar", "five_elements", "birth_date", "birth_time"] as const;
export type ShareIncludeKey = (typeof SHARE_INCLUDE_KEYS)[number];
export const DEFAULT_SHARE_INCLUDE: readonly ShareIncludeKey[] = ["summary", "day_pillar", "five_elements"];

export async function createReportShare(hours = 72, include: readonly ShareIncludeKey[] = DEFAULT_SHARE_INCLUDE) {
  const journey = readServerJourney();
  if (!journey) throw new Error("먼저 리포트를 생성해 주세요.");
  const selected = SHARE_INCLUDE_KEYS.filter((key) => include.includes(key));
  if (selected.length === 0) throw new Error("공유할 정보를 하나 이상 골라 주세요.");
  return (await request<Schema<"ShareLink">>("/api/v1/share-links", { method: "POST", body: { target_type: "report", target_id: Number(journey.reportId), expires_in_hours: hours, include: selected } })).data;
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

/* ---------- Compatibility results ---------- */

export type ServerCompatibilityDetail = {
  id: string;
  relation: "couple" | "friend" | "colleague" | "family" | string;
  summary: string;
  limitedByUnknownTime: boolean;
  profileAId: string;
  profileBId: string;
  snapshotAId: string;
  snapshotBId: string;
  status: string;
  lockedSections: string[];
  createdAt: string;
};

function compatibilityPreview(result: ApiCompatibility) {
  const value = (result.result ?? {}) as { free_preview?: { summary?: string; limited_by_unknown_time?: boolean }; paid_detail?: { sections?: Array<{ title?: unknown; locked?: unknown }> } };
  return {
    summary: value.free_preview?.summary ?? "관계 결과를 준비했습니다.",
    limited: value.free_preview?.limited_by_unknown_time ?? false,
    locked: (value.paid_detail?.sections ?? []).filter((section) => section.locked === true && typeof section.title === "string").map((section) => section.title as string),
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
    profileAId: String(result.profile_a_id),
    profileBId: String(result.profile_b_id),
    snapshotAId: String(result.snapshot_a_id),
    snapshotBId: String(result.snapshot_b_id),
    status: result.generation_status,
    lockedSections: preview.locked,
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

export async function getCurrentChart(): Promise<ChartView | null> {
  const journey = readServerJourney();
  if (!journey) return null;
  return toChartView((await request<ApiChart>(`/api/v1/charts/${journey.chartId}`)).data);
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
  };
}

export async function listOrders(): Promise<LiveOrder[]> {
  return (await request<ApiOrder[]>("/api/v1/orders")).data.map(toLiveOrder);
}

export async function listOrderRefunds(orderId: string): Promise<LiveRefund[]> {
  const refunds = (await request<Schema<"Refund">[]>(`/api/v1/orders/${orderId}/refunds`)).data;
  return refunds.map((refund) => ({ id: String(refund.id), orderId: String(refund.order_id), amount: refund.amount, reason: refund.reason ?? null, status: refund.status, createdAt: toIso(refund.created_at)! }));
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
