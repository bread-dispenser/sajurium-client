import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { LiveLoginScreen } from "@/components/account-notification-screens";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const AUTH_KEY = "sajurium.sasaju-auth.v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Request-ID": "req_test" },
  });
}

function seedAnonymousSession() {
  window.localStorage.setItem(AUTH_KEY, JSON.stringify({ accessToken: "anon_jwt", anonymousToken: "anon_raw" }));
}

function submitLogin() {
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "user@example.com" } });
  fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "password123" } });
  fireEvent.click(screen.getByRole("button", { name: "로그인" }));
}

describe("LiveLoginScreen anonymous migration messaging", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });
  afterEach(cleanup);

  it("reports login success with a pending migration notice when anonymous migration is retryable", async () => {
    seedAnonymousSession();
    const responses = [
      json({ access_token: "acct_jwt", token_type: "bearer" }, 200),
      json({ code: "MIGRATE_UNAVAILABLE", message: "이전을 처리하지 못했어요.", retryable: true }, 503),
    ];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => responses.shift() ?? json({}, 500));

    render(<LiveLoginScreen />);
    submitLogin();

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("로그인됐어요");
    expect(status).toHaveTextContent("익명 데이터 이전을 마치지 못해 다음 로그인에서 이어서 시도돼요.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(window.localStorage.getItem(AUTH_KEY) ?? "null")).toMatchObject({ accessToken: "acct_jwt", anonymousToken: "anon_raw" });
  });

  it.each([
    { status: 410, code: "ANONYMOUS_SESSION_EXPIRED" },
    { status: 404, code: "ANONYMOUS_SESSION_NOT_FOUND" },
  ])("tells the user login succeeded but anonymous data was unrecoverable on $status/$code", async ({ status, code }) => {
    seedAnonymousSession();
    const responses = [
      json({ access_token: "acct_jwt", token_type: "bearer" }, 200),
      json({ code, message: "익명 세션 이전이 확정적으로 실패했어요.", retryable: false }, status),
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => responses.shift() ?? json({}, 500));

    render(<LiveLoginScreen />);
    submitLogin();

    const statusMessage = await screen.findByRole("status");
    expect(statusMessage).toHaveTextContent("로그인됐어요");
    expect(statusMessage).toHaveTextContent("익명 데이터가 만료되었거나 존재하지 않아 이전하지 못했어요.");
    expect(JSON.parse(window.localStorage.getItem(AUTH_KEY) ?? "null")).toMatchObject({ accessToken: "acct_jwt", anonymousToken: null });
  });

  it("tells the user the anonymous data was already migrated on 409/ALREADY_MIGRATED", async () => {
    seedAnonymousSession();
    const responses = [
      json({ access_token: "acct_jwt", token_type: "bearer" }, 200),
      json({ code: "ALREADY_MIGRATED", message: "이미 이전된 세션이에요.", retryable: false }, 409),
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => responses.shift() ?? json({}, 500));

    render(<LiveLoginScreen />);
    submitLogin();

    const statusMessage = await screen.findByRole("status");
    expect(statusMessage).toHaveTextContent("로그인됐어요");
    expect(statusMessage).toHaveTextContent("익명 데이터는 이미 계정으로 이전되어 있어요.");
    expect(JSON.parse(window.localStorage.getItem(AUTH_KEY) ?? "null")).toMatchObject({ accessToken: "acct_jwt", anonymousToken: null });
  });
});
