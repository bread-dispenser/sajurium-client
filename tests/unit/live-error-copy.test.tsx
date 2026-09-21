import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { LiveHomeScreen } from "@/components/core-screens";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const AUTH_KEY = "sajurium.sasaju-auth.v1";
const JOURNEY_KEY = "sajurium.server-journey.v1";

function seedJourney() {
  window.localStorage.setItem(JOURNEY_KEY, JSON.stringify({ profileId: "1", chartId: "2", reportId: "3" }));
}

function json(body: unknown, status = 200, requestId = "req_server") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Request-ID": requestId },
  });
}

describe("live error copy reaches the screen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    seedJourney();
  });
  afterEach(cleanup);

  it("shows the server reference id when a read fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      json({ code: "INTERNAL_ERROR", message: "서버에서 문제가 발생했어요.", request_id: "req_abc123", retryable: true }, 500, "req_abc123"),
    );

    render(<LiveHomeScreen />);

    await waitFor(() => expect(screen.getByText(/req_abc123/)).toBeDefined());
    expect(screen.getByText(/서버에서 문제가 발생했어요/)).toBeDefined();
  });

  it("offers a login link instead of a dead end when the account session expired", async () => {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "account", accessToken: "acct_jwt", anonymousToken: null }));
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      json({ code: "FORBIDDEN", message: "Could not validate credentials", request_id: "req_expired" }, 403, "req_expired"),
    );

    render(<LiveHomeScreen />);

    await waitFor(() => expect(screen.getByText("다시 로그인해 주세요")).toBeDefined());
    expect(screen.getByRole("link", { name: "로그인" }).getAttribute("href")).toBe("/login");
    expect(screen.getByText(/req_expired/)).toBeDefined();
  });

  it("does not offer a login link for a recoverable anonymous session", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/auth/anonymous")) return json({ access_token: "jwt_fresh", token_type: "bearer", anonymous_token: "anon_fresh" }, 201);
      return json({ code: "FORBIDDEN", message: "Could not validate credentials", request_id: "req_anon" }, 403, "req_anon");
    });

    render(<LiveHomeScreen />);

    await waitFor(() => expect(screen.getByText(/req_anon/)).toBeDefined());
    expect(screen.queryByRole("link", { name: "로그인" })).toBeNull();
  });
});
