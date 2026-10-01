import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { LiveAccountScreen } from "@/components/account-notification-screens";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

// The build has Google and Apple client IDs; whether a button appears is then up to the backend.
vi.mock("@/lib/feature-availability", () => ({
  socialLoginEnabled: true,
  pushEnabled: false,
  googleLoginAvailable: true,
  googleClientId: "google-test-client",
  appleLoginAvailable: true,
  appleClientId: "apple-test-client",
  appleRedirectUri: "https://example.com/login",
}));

vi.mock("next/script", async () => {
  const React = await import("react");
  return { default: function ScriptStub({ onReady }: { onReady?: () => void }) {
    React.useEffect(() => { onReady?.(); }, [onReady]);
    return null;
  } };
});

const AUTH_KEY = "sajurium.sasaju-auth.v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Request-ID": "req_test" },
  });
}

type Identities = { has_password: boolean; email: string | null; identities: { provider: string; linked_at: string }[] };
type Route = (method: string, body: unknown) => Response;

function mockApi({ identities, providers = { enabled: false, providers: [] }, link, unlink }: {
  identities: Identities | Identities[];
  providers?: unknown;
  link?: Route;
  unlink?: Route;
}) {
  const lists = Array.isArray(identities) ? [...identities] : [identities];
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    if (url.endsWith("/api/v1/auth/social/providers")) return json(providers);
    if (url.endsWith("/api/v1/auth/identities") && method === "GET") return json(lists.length > 1 ? lists.shift() : lists[0]);
    if (url.endsWith("/api/v1/auth/identities") && method === "POST" && link) return link(method, body);
    if (url.includes("/api/v1/auth/identities/") && method === "DELETE" && unlink) return unlink(method, body);
    return json({ code: "UNEXPECTED", message: `${method} ${url}` }, 500);
  });
}

const PASSWORD_AND_GOOGLE: Identities = {
  has_password: true, email: "me@example.com",
  identities: [{ provider: "google", linked_at: "2026-10-01T03:00:00Z" }],
};
const ONLY_GOOGLE: Identities = { has_password: false, email: null, identities: [{ provider: "google", linked_at: "2026-10-01T03:00:00Z" }] };

describe("account login methods", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "account", accessToken: "acct_jwt", anonymousToken: null }));
  });
  afterEach(() => {
    cleanup();
    delete window.google;
    delete window.AppleID;
  });

  it("lists the email and password method and each linked provider with its link date", async () => {
    mockApi({ identities: PASSWORD_AND_GOOGLE });
    render(<LiveAccountScreen />);

    const list = await screen.findByRole("list", { name: "연결된 로그인 수단" });
    expect(within(list).getByText("이메일과 비밀번호")).toBeDefined();
    expect(within(list).getByText("me@example.com")).toBeDefined();
    expect(within(list).getByText("Google")).toBeDefined();
    expect(within(list).getByText("2026년 10월 1일에 연결했어요")).toBeDefined();
    expect(screen.getByText(/같은 이메일이라도 계정을 자동으로 합치지 않아요/)).toBeDefined();
  });

  it("asks for confirmation, unlinks, then refreshes the list", async () => {
    const withApple: Identities = { ...PASSWORD_AND_GOOGLE, identities: [...PASSWORD_AND_GOOGLE.identities, { provider: "apple", linked_at: "2026-09-20T03:00:00Z" }] };
    const unlink = vi.fn(() => json({ provider: "apple", status: "UNLINKED" }));
    const fetchMock = mockApi({ identities: [withApple, PASSWORD_AND_GOOGLE], unlink });
    render(<LiveAccountScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "Apple 연결 해제" }));
    expect(unlink).not.toHaveBeenCalled();
    expect(screen.getByText(/Apple 연결을 해제할까요/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "연결 해제 확정" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Apple 연결을 해제했어요.");
    expect(unlink).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/api/v1/auth/identities/apple") && init?.method === "DELETE")).toBe(true);
    await waitFor(() => expect(screen.queryByText("Apple")).toBeNull());
    expect(screen.getByText("Google")).toBeDefined();
  });

  it("disables unlinking the last login method and says why", async () => {
    const unlink = vi.fn(() => json({ provider: "google", status: "UNLINKED" }));
    mockApi({ identities: ONLY_GOOGLE, unlink });
    render(<LiveAccountScreen />);

    const button = await screen.findByRole("button", { name: "Google 연결 해제" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("남은 로그인 수단이 이것뿐이라 해제할 수 없어요.");
    fireEvent.click(button);
    expect(unlink).not.toHaveBeenCalled();
  });

  it("shows the server's LAST_LOGIN_METHOD refusal and refreshes the list", async () => {
    // The list was stale: the password was removed elsewhere, so the server refuses the unlink.
    const stale: Identities = { ...PASSWORD_AND_GOOGLE };
    const unlink = vi.fn(() => json({ code: "LAST_LOGIN_METHOD", message: "server", request_id: "req_last" }, 409));
    mockApi({ identities: [stale, ONLY_GOOGLE], unlink });
    render(<LiveAccountScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "Google 연결 해제" }));
    fireEvent.click(screen.getByRole("button", { name: "연결 해제 확정" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("남은 로그인 수단이 이것뿐이라 해제할 수 없어요. 다른 로그인 수단을 먼저 연결해 주세요.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Google 연결 해제" })).toBeDisabled());
    expect(screen.queryByText("이메일과 비밀번호")).toBeNull();
  });

  it("explains IDENTITY_ALREADY_LINKED after a provider credential is sent for linking", async () => {
    let googleCallback: ((response: { credential?: string }) => void) | undefined;
    window.google = { accounts: { id: {
      initialize: vi.fn((options) => { googleCallback = options.callback; }),
      renderButton: vi.fn((target) => {
        const button = document.createElement("button");
        button.textContent = "Google provider";
        button.onclick = () => googleCallback?.({ credential: "google-id-token" });
        target.append(button);
      }),
      disableAutoSelect: vi.fn(),
    } } };
    const link = vi.fn((_method: string, body: unknown) => {
      expect(body).toEqual({ provider: "google", id_token: "google-id-token" });
      return json({ code: "IDENTITY_ALREADY_LINKED", message: "server", request_id: "req_dup" }, 409);
    });
    const fetchMock = mockApi({
      identities: { has_password: true, email: "me@example.com", identities: [] },
      providers: { enabled: true, providers: [{ provider: "google", enabled: true }, { provider: "apple", enabled: false }, { provider: "kakao", enabled: true }] },
      link,
    });
    render(<LiveAccountScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "Google provider" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("이 소셜 계정은 이미 다른 회원 계정에 연결되어 있어요.");
    expect(link).toHaveBeenCalledTimes(1);
    // Linking never exchanges the credential for a new session.
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/api/v1/auth/social"))).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(AUTH_KEY) ?? "null")).toMatchObject({ accessToken: "acct_jwt" });
    // Apple is off on the server, and Kakao has no client flow, so neither gets a button.
    expect(screen.queryByRole("button", { name: "Apple 계정 연결" })).toBeNull();
    expect(screen.queryByRole("button", { name: /카카오/ })).toBeNull();
  });

  it("links a provider credential to this account and refreshes the list", async () => {
    let googleCallback: ((response: { credential?: string }) => void) | undefined;
    window.google = { accounts: { id: {
      initialize: vi.fn((options) => { googleCallback = options.callback; }),
      renderButton: vi.fn((target) => {
        const button = document.createElement("button");
        button.textContent = "Google provider";
        button.onclick = () => googleCallback?.({ credential: "google-id-token" });
        target.append(button);
      }),
      disableAutoSelect: vi.fn(),
    } } };
    const link = vi.fn((_method: string, body: unknown) => {
      expect(body).toEqual({ provider: "google", id_token: "google-id-token" });
      return json({ provider: "google", linked_at: "2026-10-01T03:00:00Z", status: "LINKED" });
    });
    const fetchMock = mockApi({
      identities: [{ has_password: true, email: "me@example.com", identities: [] }, PASSWORD_AND_GOOGLE],
      providers: { enabled: true, providers: [{ provider: "google", enabled: true }, { provider: "apple", enabled: false }] },
      link,
    });
    render(<LiveAccountScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "Google provider" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Google 계정을 연결했어요. 이제 Google로 로그인해도 이 계정이 열려요.");
    expect(link).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Google 연결 해제" })).toBeDefined();
    // An already linked provider is not offered again, and linking keeps the current session.
    expect(screen.queryByRole("button", { name: "Google provider" })).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/api/v1/auth/social"))).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(AUTH_KEY) ?? "null")).toMatchObject({ accessToken: "acct_jwt" });
  });

  it("shows no link buttons and a neutral note when the backend enables no provider", async () => {
    window.AppleID = { auth: { init: vi.fn(), signIn: vi.fn() } };
    mockApi({ identities: PASSWORD_AND_GOOGLE, providers: { enabled: false, providers: [{ provider: "google", enabled: false }, { provider: "apple", enabled: false }] } });
    render(<LiveAccountScreen />);

    expect(await screen.findByText("다른 로그인 수단은 준비되면 여기에서 연결할 수 있어요.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Apple 계정 연결" })).toBeNull();
    expect(screen.queryByText("다른 로그인 수단 연결")).toBeNull();
  });

  it("is not shown for an anonymous session and makes no identity request", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "anon_jwt", anonymousToken: "anon_raw" }));
    const fetchMock = mockApi({ identities: PASSWORD_AND_GOOGLE });
    render(<LiveAccountScreen />);

    expect(screen.getByRole("heading", { name: "로그인하면 지금 기록을 계정으로 옮겨요" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "로그인 수단" })).toBeNull();
    expect(screen.queryByText(/자동으로 합치지 않아요/)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a retryable alert when the list cannot be loaded", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => String(input).endsWith("/social/providers")
      ? json({ enabled: false, providers: [] })
      : json({ code: "INTERNAL_ERROR", message: "서버에서 문제가 발생했어요.", request_id: "req_500" }, 500));
    render(<LiveAccountScreen />);

    expect(await screen.findByRole("alert")).toHaveTextContent("서버에서 문제가 발생했어요.");
    expect(screen.getByRole("button", { name: "로그인 수단 다시 불러오기" })).toBeDefined();
  });
});
