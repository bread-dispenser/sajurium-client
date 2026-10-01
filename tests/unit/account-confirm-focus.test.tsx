import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { LiveAccountScreen } from "@/components/account-notification-screens";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

vi.mock("@/lib/feature-availability", () => ({
  socialLoginEnabled: false,
  pushEnabled: false,
  googleLoginAvailable: false,
  googleClientId: "",
  appleLoginAvailable: false,
  appleClientId: "",
  appleRedirectUri: "",
}));

const AUTH_KEY = "sajurium.sasaju-auth.v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "X-Request-ID": "req_test" } });
}

const WITH_APPLE = {
  has_password: true, email: "me@example.com",
  identities: [{ provider: "google", linked_at: "2026-10-01T03:00:00Z" }, { provider: "apple", linked_at: "2026-09-20T03:00:00Z" }],
};
const WITHOUT_APPLE = { ...WITH_APPLE, identities: [WITH_APPLE.identities[0]] };

function mockApi({ deletion, unlink }: { deletion?: () => Response; unlink?: () => Response } = {}) {
  const lists = [WITH_APPLE, WITHOUT_APPLE];
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/v1/auth/social/providers")) return json({ enabled: false, providers: [] });
    if (url.endsWith("/api/v1/auth/identities") && method === "GET") return json(lists.length > 1 ? lists.shift() : lists[0]);
    if (url.includes("/api/v1/auth/identities/") && method === "DELETE" && unlink) return unlink();
    if (url.endsWith("/api/v1/auth/account") && method === "DELETE" && deletion) return deletion();
    return json({ code: "UNEXPECTED", message: `${method} ${url}` }, 500);
  });
}

describe("focus in account confirmation steps", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "account", accessToken: "acct_jwt", anonymousToken: null }));
  });
  afterEach(cleanup);

  it("moves focus to the delete confirmation and announces the question with it", async () => {
    mockApi();
    render(<LiveAccountScreen />);

    const start = screen.getByRole("button", { name: "계정 삭제" });
    start.focus();
    fireEvent.click(start);

    const confirm = screen.getByRole("button", { name: "계정 삭제 확정" });
    await waitFor(() => expect(document.activeElement).toBe(confirm));
    expect(confirm).toHaveAccessibleDescription("정말 계정을 삭제할까요?");
    expect(screen.getByRole("group", { name: "정말 계정을 삭제할까요?" })).toContainElement(confirm);
  });

  it("returns focus to the delete button when the confirmation is cancelled", async () => {
    mockApi();
    render(<LiveAccountScreen />);

    fireEvent.click(screen.getByRole("button", { name: "계정 삭제" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "계정 삭제 확정" })));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "계정 삭제" })));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("moves focus to the result status after the deletion succeeds", async () => {
    mockApi({ deletion: () => json({ status: "DELETED" }) });
    render(<LiveAccountScreen />);

    fireEvent.click(screen.getByRole("button", { name: "계정 삭제" }));
    fireEvent.click(await screen.findByRole("button", { name: "계정 삭제 확정" }));

    const status = await screen.findByText(/계정과 서버 기록을 삭제했어요/);
    expect(status).toHaveAttribute("role", "status");
    await waitFor(() => expect(document.activeElement).toBe(status));
  });

  it("moves focus to the error when the deletion fails", async () => {
    mockApi({ deletion: () => json({ code: "SERVER_ERROR", message: "server" }, 500) });
    render(<LiveAccountScreen />);

    fireEvent.click(screen.getByRole("button", { name: "계정 삭제" }));
    fireEvent.click(await screen.findByRole("button", { name: "계정 삭제 확정" }));

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(alert));
  });

  it("moves focus into the unlink confirmation and back to the unlink button on cancel", async () => {
    mockApi();
    render(<LiveAccountScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "Apple 연결 해제" }));
    const confirm = screen.getByRole("button", { name: "연결 해제 확정" });
    await waitFor(() => expect(document.activeElement).toBe(confirm));
    expect(confirm).toHaveAccessibleDescription(/Apple 연결을 해제할까요/);

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Apple 연결 해제" })));
  });

  it("moves focus to the status after an unlink succeeds", async () => {
    mockApi({ unlink: () => json({ provider: "apple", status: "UNLINKED" }) });
    render(<LiveAccountScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "Apple 연결 해제" }));
    fireEvent.click(screen.getByRole("button", { name: "연결 해제 확정" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Apple 연결을 해제했어요.");
    await waitFor(() => expect(document.activeElement).toBe(status));
  });
});
