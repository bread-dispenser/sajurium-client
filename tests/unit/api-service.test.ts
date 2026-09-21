import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_BIRTH } from "@/lib/fixtures";

const AUTH_KEY = "sajurium.sasaju-auth.v1";
const API_ORIGIN = process.env.NEXT_PUBLIC_SAJURIUM_API_URL ?? "http://localhost:8000";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Request-ID": "req_test" },
  });
}

describe("live API journey", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("issues an anonymous JWT then persists FastAPI profile, chart, and report references", async () => {
    const responses = [
      json({ access_token: "jwt_1", token_type: "bearer", anonymous_token: "anonymous_1" }, 201),
      json([{ id: 101, user_id: 7, nickname: "서연", is_self: true, birth_year: 1992, birth_month: 6, birth_day: 18, birth_time_unknown: false, gender_for_calculation: "female", consent_for_storing_others_info: false, created_at: "2026-09-01T00:00:00Z" }], 201),
      json({ id: 202, profile_id: 101, input_hash: "hash", engine_version: "1", calendar_version: "1", calculation_method: "fixed", year_gan: "갑", year_ji: "자", month_gan: "을", month_ji: "축", day_gan: "병", day_ji: "인", is_current: true, calculation_timestamp: "2026-09-01T00:00:00Z" }, 201),
      json({ id: 303, chart_snapshot_id: 202, user_id: 7, report_type: "basic", title: "기본 사주 리포트", content: "결과", content_json: { sections: [{ key: "summary", title: "한 줄 요약", body: "결과", is_free: true }] }, generation_status: "READY", is_free_section: true, requires_payment: false, purchased: false, created_at: "2026-09-01T00:00:00Z" }, 201),
    ];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => responses.shift() ?? json({}, 500));
    const { createBasicReading, readServerJourney } = await import("@/lib/api/service");

    const result = await createBasicReading(INITIAL_BIRTH);

    expect(result.journey).toEqual({ profileId: "101", chartId: "202", reportId: "303" });
    expect(readServerJourney()).toEqual(result.journey);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const profileRequest = fetchMock.mock.calls[1];
    expect(profileRequest[0]).toBe(`${API_ORIGIN}/api/v1/profiles/`);
    expect(new Headers(profileRequest[1]?.headers).get("Authorization")).toBe("Bearer jwt_1");
    expect(JSON.parse(String(profileRequest[1]?.body))).toMatchObject({ nickname: "서연", calendar_type: "solar", birth_year: 1992 });
    expect(fetchMock.mock.calls[2][0]).toBe(`${API_ORIGIN}/api/v1/profiles/101/chart`);
  });

  it("recovers an expired anonymous token served as 403, keeps the anonymous token, and retries once", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "stale_jwt", anonymousToken: "stale_anon" }));
    const responses = [
      json({ code: "FORBIDDEN", message: "Could not validate credentials" }, 403),
      json({ access_token: "jwt_fresh", token_type: "bearer", anonymous_token: "anon_fresh" }, 201),
      json([], 200),
    ];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => responses.shift() ?? json({}, 500));
    const { listProfiles } = await import("@/lib/api/service");

    await expect(listProfiles()).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_ORIGIN}/api/v1/profiles/`);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer stale_jwt");
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_ORIGIN}/api/v1/auth/anonymous`);
    expect(fetchMock.mock.calls[1][1]?.method).toBe("POST");
    expect(fetchMock.mock.calls[2][0]).toBe(`${API_ORIGIN}/api/v1/profiles/`);
    expect(new Headers(fetchMock.mock.calls[2][1]?.headers).get("Authorization")).toBe("Bearer jwt_fresh");
    // the raw anonymous token is preserved: it is the only handle migrate accepts for the
    // server-side data still attached to the expired session
    expect(JSON.parse(window.localStorage.getItem(AUTH_KEY) ?? "null")).toMatchObject({ accessToken: "jwt_fresh", anonymousToken: "stale_anon" });
  });

  it("drops the stale journey reference when it re-issues an expired anonymous session", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "stale_jwt", anonymousToken: "stale_anon" }));
    window.localStorage.setItem("sajurium.server-journey.v1", JSON.stringify({ profileId: "1", chartId: "2", reportId: "3" }));
    const responses = [
      json({ code: "FORBIDDEN", message: "Could not validate credentials" }, 403),
      json({ access_token: "jwt_fresh", token_type: "bearer", anonymous_token: "anon_fresh" }, 201),
      json([], 200),
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => responses.shift() ?? json({}, 500));
    const { listProfiles, readServerJourney } = await import("@/lib/api/service");

    await expect(listProfiles()).resolves.toEqual([]);

    expect(readServerJourney()).toBeNull();
  });

  it("does not re-issue a session on a genuine authorization 403", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "anon_jwt", anonymousToken: "anon_raw" }));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({ code: "FORBIDDEN", message: "접근 권한이 없습니다." }, 403));
    const { ApiRequestError } = await import("@/lib/api/client");
    const { listProfiles } = await import("@/lib/api/service");

    const thrown = await listProfiles().catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(ApiRequestError);
    expect(thrown).toMatchObject({ status: 403, error: { code: "FORBIDDEN", message: "접근 권한이 없습니다." } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_ORIGIN}/api/v1/profiles/`);
  });

  it("never replaces an expired account session with an anonymous one", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "account", accessToken: "acct_jwt", anonymousToken: null }));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({ code: "FORBIDDEN", message: "Could not validate credentials" }, 403));
    const { listProfiles } = await import("@/lib/api/service");

    await expect(listProfiles()).rejects.toMatchObject({ status: 403 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(AUTH_KEY) ?? "null")).toMatchObject({ kind: "account", accessToken: "acct_jwt" });
  });

  it("bootstraps an anonymous session when none is stored", async () => {
    const responses = [
      json({ access_token: "jwt_new", token_type: "bearer", anonymous_token: "anon_new" }, 201),
      json([], 200),
    ];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => responses.shift() ?? json({}, 500));
    const { listProfiles } = await import("@/lib/api/service");

    await expect(listProfiles()).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_ORIGIN}/api/v1/auth/anonymous`);
    expect(JSON.parse(window.localStorage.getItem(AUTH_KEY) ?? "null")).toMatchObject({ accessToken: "jwt_new", anonymousToken: "anon_new" });
  });

  it("re-issues only one anonymous session when concurrent reads all hit a credential rejection", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "stale_jwt", anonymousToken: "stale_anon" }));
    const json403 = () => json({ code: "FORBIDDEN", message: "Could not validate credentials" }, 403);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/auth/anonymous")) return json({ access_token: "jwt_fresh", token_type: "bearer", anonymous_token: "anon_fresh" }, 201);
      // first pass is rejected for every concurrent caller; the retry succeeds
      return new Headers(init?.headers).get("Authorization") === "Bearer stale_jwt" ? json403() : json([], 200);
    });
    const { listProfiles } = await import("@/lib/api/service");

    await expect(Promise.all([listProfiles(), listProfiles(), listProfiles()])).resolves.toEqual([[], [], []]);

    const bootstrapCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes("/auth/anonymous"));
    expect(bootstrapCalls).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem(AUTH_KEY) ?? "null")).toMatchObject({ accessToken: "jwt_fresh", anonymousToken: "stale_anon" });
  });

  it("surfaces a second credential rejection after one recovery without looping", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "stale_jwt" }));
    const responses = [
      json({ code: "FORBIDDEN", message: "Could not validate credentials" }, 403),
      json({ access_token: "jwt_fresh", token_type: "bearer", anonymous_token: "anon_fresh" }, 201),
      json({ code: "FORBIDDEN", message: "Could not validate credentials" }, 403),
      json({ access_token: "jwt_extra", token_type: "bearer" }, 201),
      json([], 200),
    ];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => responses.shift() ?? json({}, 500));
    const { ApiRequestError } = await import("@/lib/api/client");
    const { formatApiRequestError, listProfiles } = await import("@/lib/api/service");

    const thrown = await listProfiles().catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(ApiRequestError);
    expect(thrown).toMatchObject({ status: 403, error: { request_id: "req_test" } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // the raw backend message ("Could not validate credentials") is not user-facing copy
    expect(formatApiRequestError(thrown)).toBe("세션을 준비하지 못했어요. 잠시 후 다시 시도해 주세요. (문의 시 참조 ID: req_test)");
  });

  it("tells an expired account session to log in and reports the reference id", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "account", accessToken: "acct_jwt", anonymousToken: null }));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({ code: "FORBIDDEN", message: "Could not validate credentials", request_id: "req_acct" }, 403));
    const { ApiRequestError } = await import("@/lib/api/client");
    const { formatApiRequestError, isAccountSessionExpired, listProfiles } = await import("@/lib/api/service");

    const thrown = await listProfiles().catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(ApiRequestError);
    expect(isAccountSessionExpired(thrown)).toBe(true);
    expect(formatApiRequestError(thrown)).toBe("로그인 세션이 만료됐어요. 다시 로그인하면 저장된 기록을 이어갈 수 있습니다. (문의 시 참조 ID: req_acct)");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not claim an account expiry for a genuine authorization denial", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "account", accessToken: "acct_jwt", anonymousToken: null }));
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({ code: "FORBIDDEN", message: "접근 권한이 없습니다.", request_id: "req_deny" }, 403));
    const { formatApiRequestError, isAccountSessionExpired, listProfiles } = await import("@/lib/api/service");

    const thrown = await listProfiles().catch((error: unknown) => error);

    expect(isAccountSessionExpired(thrown)).toBe(false);
    expect(formatApiRequestError(thrown)).toBe("접근 권한이 없습니다. (문의 시 참조 ID: req_deny)");
  });
});

describe("account authentication and anonymous migration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("migrates the anonymous session with the account bearer token after login", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ accessToken: "anon_jwt", anonymousToken: "anon_raw" }));
    const responses = [
      json({ access_token: "acct_jwt", token_type: "bearer" }, 200),
      json({ migrated_profile_ids: [101] }, 200),
    ];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => responses.shift() ?? json({}, 500));
    const { loginAccount } = await import("@/lib/api/service");

    const result = await loginAccount("user@example.com", "password123");

    expect(result.token.access_token).toBe("acct_jwt");
    expect(result.migration).toBe("migrated");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const loginRequest = fetchMock.mock.calls[0];
    expect(loginRequest[0]).toBe(`${API_ORIGIN}/api/v1/auth/login/access-token`);
    expect(String(loginRequest[1]?.body)).toContain("username=user%40example.com");
    const migrateRequest = fetchMock.mock.calls[1];
    expect(migrateRequest[0]).toBe(`${API_ORIGIN}/api/v1/auth/anonymous/migrate`);
    expect(migrateRequest[1]?.method).toBe("POST");
    expect(new Headers(migrateRequest[1]?.headers).get("Authorization")).toBe("Bearer acct_jwt");
    expect(JSON.parse(String(migrateRequest[1]?.body))).toEqual({ anonymous_token: "anon_raw", merge_duplicate_profiles: true });
    expect(JSON.parse(window.localStorage.getItem(AUTH_KEY) ?? "null")).toMatchObject({ accessToken: "acct_jwt", anonymousToken: null });
  });

  it("skips migration when there is no stored anonymous token", async () => {
    const responses = [json({ access_token: "acct_jwt", token_type: "bearer" }, 200)];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => responses.shift() ?? json({}, 500));
    const { loginAccount } = await import("@/lib/api/service");

    const result = await loginAccount("user@example.com", "password123");

    expect(result.migration).toBe("not-needed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_ORIGIN}/api/v1/auth/login/access-token`);
    expect(JSON.parse(window.localStorage.getItem(AUTH_KEY) ?? "null")).toMatchObject({ accessToken: "acct_jwt", anonymousToken: null });
  });

  it("retains the anonymous token when migration fails with a retryable server error", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ accessToken: "anon_jwt", anonymousToken: "anon_raw" }));
    const responses = [
      json({ access_token: "acct_jwt", token_type: "bearer" }, 200),
      json({ code: "MIGRATE_UNAVAILABLE", message: "이전을 처리하지 못했어요.", retryable: true }, 503),
    ];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => responses.shift() ?? json({}, 500));
    const { loginAccount } = await import("@/lib/api/service");

    const result = await loginAccount("user@example.com", "password123");

    expect(result.token.access_token).toBe("acct_jwt");
    expect(result.migration).toBe("pending");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(window.localStorage.getItem(AUTH_KEY) ?? "null")).toMatchObject({ accessToken: "acct_jwt", anonymousToken: "anon_raw" });
  });

  it("retains the anonymous token when migration fails at the network layer", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ accessToken: "anon_jwt", anonymousToken: "anon_raw" }));
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      calls += 1;
      if (calls === 1) return json({ access_token: "acct_jwt", token_type: "bearer" }, 200);
      throw new TypeError("fetch failed");
    });
    const { loginAccount } = await import("@/lib/api/service");

    const result = await loginAccount("user@example.com", "password123");

    expect(result.migration).toBe("pending");
    expect(JSON.parse(window.localStorage.getItem(AUTH_KEY) ?? "null")).toMatchObject({ accessToken: "acct_jwt", anonymousToken: "anon_raw" });
  });

  it.each([
    { status: 404, code: "ANONYMOUS_SESSION_NOT_FOUND", expected: "unavailable" },
    { status: 410, code: "ANONYMOUS_SESSION_EXPIRED", expected: "unavailable" },
    { status: 409, code: "ALREADY_MIGRATED", expected: "already-migrated" },
  ])("clears the anonymous token on terminal $status/$code and reports $expected", async ({ status, code, expected }) => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ accessToken: "anon_jwt", anonymousToken: "anon_raw" }));
    const responses = [
      json({ access_token: "acct_jwt", token_type: "bearer" }, 200),
      json({ code, message: "익명 세션 이전이 확정적으로 실패했어요.", retryable: false }, status),
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => responses.shift() ?? json({}, 500));
    const { loginAccount } = await import("@/lib/api/service");

    const result = await loginAccount("user@example.com", "password123");

    expect(result.token.access_token).toBe("acct_jwt");
    expect(result.migration).toBe(expected);
    expect(JSON.parse(window.localStorage.getItem(AUTH_KEY) ?? "null")).toMatchObject({ accessToken: "acct_jwt", anonymousToken: null });
  });

  it.each([
    { status: 401, code: "AUTH_EXPIRED" },
    { status: 403, code: "FORBIDDEN" },
    { status: 422, code: "VALIDATION_ERROR" },
    { status: 409, code: "PROFILE_MERGE_CONFLICT" },
    { status: 404, code: "SOME_OTHER_CODE" },
  ])("retains the anonymous token and reports pending on unlisted $status/$code", async ({ status, code }) => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ accessToken: "anon_jwt", anonymousToken: "anon_raw" }));
    const responses = [
      json({ access_token: "acct_jwt", token_type: "bearer" }, 200),
      json({ code, message: "처리하지 못했어요.", retryable: false }, status),
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => responses.shift() ?? json({}, 500));
    const { loginAccount } = await import("@/lib/api/service");

    const result = await loginAccount("user@example.com", "password123");

    expect(result.token.access_token).toBe("acct_jwt");
    expect(result.migration).toBe("pending");
    expect(JSON.parse(window.localStorage.getItem(AUTH_KEY) ?? "null")).toMatchObject({ accessToken: "acct_jwt", anonymousToken: "anon_raw" });
  });

  it("runs the same login and migration flow after registration", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ accessToken: "anon_jwt", anonymousToken: "anon_raw" }));
    const responses = [
      json({ id: 7, email: "user@example.com", full_name: "서연", is_active: true }, 201),
      json({ access_token: "acct_jwt", token_type: "bearer" }, 200),
      json({ migrated_profile_ids: [101] }, 200),
    ];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => responses.shift() ?? json({}, 500));
    const { registerAccount } = await import("@/lib/api/service");

    const result = await registerAccount("user@example.com", "password123", "서연");

    expect(result.token.access_token).toBe("acct_jwt");
    expect(result.migration).toBe("migrated");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const registerRequest = fetchMock.mock.calls[0];
    expect(registerRequest[0]).toBe(`${API_ORIGIN}/api/v1/auth/register`);
    expect(JSON.parse(String(registerRequest[1]?.body))).toMatchObject({ email: "user@example.com", full_name: "서연" });
    const migrateRequest = fetchMock.mock.calls[2];
    expect(migrateRequest[0]).toBe(`${API_ORIGIN}/api/v1/auth/anonymous/migrate`);
    expect(new Headers(migrateRequest[1]?.headers).get("Authorization")).toBe("Bearer acct_jwt");
    expect(JSON.parse(String(migrateRequest[1]?.body))).toEqual({ anonymous_token: "anon_raw", merge_duplicate_profiles: true });
    expect(JSON.parse(window.localStorage.getItem(AUTH_KEY) ?? "null")).toMatchObject({ accessToken: "acct_jwt", anonymousToken: null });
  });
});

describe("formatApiRequestError", () => {
  it("includes the normalized request_id as a support reference", async () => {
    const { ApiRequestError } = await import("@/lib/api/client");
    const { formatApiRequestError } = await import("@/lib/api/service");
    const error = new ApiRequestError(
      500,
      { code: "REPORT_FAILED", message: "리포트를 만들지 못했어요.", field_errors: {}, request_id: "req_support_123", retryable: true },
      null,
      new Headers(),
    );

    expect(formatApiRequestError(error)).toBe("리포트를 만들지 못했어요. (문의 시 참조 ID: req_support_123)");
    expect(formatApiRequestError(new Error("network down"))).toBe("network down");
    expect(formatApiRequestError("oops", "서버에서 결과를 만들지 못했어요.")).toBe("서버에서 결과를 만들지 못했어요.");
  });
});

describe("account logout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ accessToken: "acct_jwt", anonymousToken: null }));
    window.localStorage.setItem("sajurium.server-journey.v1", JSON.stringify({ profileId: "1", chartId: "2", reportId: "3" }));
  });

  it("notifies the backend and clears local account state", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ message: "logged_out" }, 200));
    const { logoutAccount } = await import("@/lib/api/service");

    await expect(logoutAccount()).resolves.toBe("complete");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_ORIGIN}/api/v1/auth/logout`);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer acct_jwt");
    expect(window.localStorage.getItem(AUTH_KEY)).toBeNull();
    expect(window.localStorage.getItem("sajurium.server-journey.v1")).toBeNull();
  });

  it("still clears local account state when the backend is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network unavailable"));
    const { logoutAccount } = await import("@/lib/api/service");

    await expect(logoutAccount()).resolves.toBe("local-only");

    expect(window.localStorage.getItem(AUTH_KEY)).toBeNull();
    expect(window.localStorage.getItem("sajurium.server-journey.v1")).toBeNull();
  });
});
