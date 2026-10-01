import { beforeEach, describe, expect, it, vi } from "vitest";

const AUTH_KEY = "sajurium.sasaju-auth.v1";
const API_ORIGIN = process.env.NEXT_PUBLIC_SAJURIUM_API_URL ?? "http://localhost:8000";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Request-ID": "req_test" },
  });
}

function seedAccount() {
  window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "account", accessToken: "acct_jwt", anonymousToken: null }));
}

describe("login method service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    window.localStorage.clear();
    seedAccount();
  });

  it("lists the password method and linked providers with the account token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({
      has_password: true, email: "me@example.com",
      identities: [{ provider: "google", linked_at: "2026-10-01T09:00:00" }],
    }));
    const { listIdentities } = await import("@/lib/api/service");

    await expect(listIdentities()).resolves.toEqual({
      hasPassword: true, email: "me@example.com",
      identities: [{ provider: "google", linkedAt: "2026-10-01T09:00:00Z" }],
    });
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_ORIGIN}/api/v1/auth/identities`);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer acct_jwt");
  });

  it("links a provider id_token without replacing the stored session", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ provider: "apple", linked_at: "2026-10-01T09:00:00Z", status: "LINKED" }));
    const { linkIdentity } = await import("@/lib/api/service");

    await expect(linkIdentity("apple", "apple-id-token")).resolves.toEqual({ provider: "apple", linkedAt: "2026-10-01T09:00:00Z", status: "LINKED" });
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_ORIGIN}/api/v1/auth/identities`);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ provider: "apple", id_token: "apple-id-token" });
    expect(JSON.parse(window.localStorage.getItem(AUTH_KEY) ?? "null")).toMatchObject({ kind: "account", accessToken: "acct_jwt" });
  });

  it("refuses to send an empty id_token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { linkIdentity } = await import("@/lib/api/service");

    await expect(linkIdentity("google", "  ")).rejects.toThrow("인증 토큰이 없어요");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("unlinks a provider with DELETE on its path", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ provider: "google", status: "UNLINKED" }));
    const { unlinkIdentity } = await import("@/lib/api/service");

    await expect(unlinkIdentity("google")).resolves.toMatchObject({ status: "UNLINKED" });
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_ORIGIN}/api/v1/auth/identities/google`);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("DELETE");
  });

  it("reports only providers the backend has enabled", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ enabled: true, providers: [
      { provider: "kakao", enabled: true }, { provider: "google", enabled: false }, { provider: "apple", enabled: true }, { provider: "line", enabled: true },
    ] }));
    const { listEnabledSocialProviders } = await import("@/lib/api/service");

    await expect(listEnabledSocialProviders()).resolves.toEqual(["kakao", "apple"]);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_ORIGIN}/api/v1/auth/social/providers`);
  });

  it("reports no provider when social login is switched off globally", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ enabled: false, providers: [{ provider: "google", enabled: true }] }));
    const { listEnabledSocialProviders } = await import("@/lib/api/service");

    await expect(listEnabledSocialProviders()).resolves.toEqual([]);
  });

  it.each([
    [409, "IDENTITY_ALREADY_LINKED", "이미 다른 회원 계정에 연결되어 있어요"],
    [409, "PROVIDER_ALREADY_LINKED", "기존 연결을 해제한 뒤 다시 연결해 주세요"],
    [409, "LAST_LOGIN_METHOD", "남은 로그인 수단이 이것뿐이라 해제할 수 없어요"],
    [404, "IDENTITY_NOT_FOUND", "이미 해제됐거나 연결되지 않은 로그인 수단이에요"],
    [403, "ACCOUNT_REQUIRED", "회원 계정에서만 관리할 수 있어요"],
    [503, "SOCIAL_LOGIN_DISABLED", "지금은 소셜 계정을 연결할 수 없어요"],
    [503, "SOCIAL_PROVIDER_DISABLED", "이 소셜 계정은 지금 연결할 수 없어요"],
    [503, "SOCIAL_PROVIDER_UNAVAILABLE", "소셜 계정 서버에 연결하지 못했어요"],
    [503, "SOCIAL_PROVIDER_NOT_CONFIGURED", "아직 준비 중이에요"],
    [401, "INVALID_SOCIAL_TOKEN", "처음부터 다시 연결해 주세요"],
    [429, "SOCIAL_LOGIN_RATE_LIMITED", "연결 시도가 많았어요"],
  ])("maps %i %s to Korean copy with the reference id", async (status, code, copy) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ code, message: "server message", request_id: "req_link" }, status));
    const { formatIdentityError, linkIdentity } = await import("@/lib/api/service");

    const error = await linkIdentity("google", "google-id-token").catch((reason: unknown) => reason);
    const message = formatIdentityError(error);
    expect(message).toContain(copy);
    expect(message).toContain("req_link");
    expect(message).not.toContain("server message");
  });

  it("falls back to the server message for codes it does not know", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ code: "INTERNAL_ERROR", message: "서버에서 문제가 발생했어요.", request_id: "req_500" }, 500));
    const { formatIdentityError, listIdentities } = await import("@/lib/api/service");

    const error = await listIdentities().catch((reason: unknown) => reason);
    expect(formatIdentityError(error)).toBe("서버에서 문제가 발생했어요. (문의 시 참조 ID: req_500)");
  });
});
