import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SocialLoginOptions } from "@/components/social-login-options";

vi.mock("@/lib/feature-availability", () => ({
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

describe("configured social provider controls", () => {
  beforeEach(() => {
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
    let appleState = "";
    window.AppleID = { auth: {
      init: vi.fn((options) => { appleState = options.state; }),
      signIn: vi.fn(async () => ({ authorization: { state: appleState, id_token: "apple-id-token" } })),
    } };
  });
  afterEach(() => {
    cleanup();
    delete window.google;
    delete window.AppleID;
  });

  it("passes Google and Apple ID tokens to the backend login callback", async () => {
    const onCredential = vi.fn(async () => undefined);
    render(<SocialLoginOptions onCredential={onCredential} onError={vi.fn()} pending={false} />);

    fireEvent.click(await screen.findByRole("button", { name: "Google provider" }));
    await waitFor(() => expect(onCredential).toHaveBeenCalledWith("google", "google-id-token"));
    fireEvent.click(screen.getByRole("button", { name: "Apple로 계속" }));
    await waitFor(() => expect(onCredential).toHaveBeenCalledWith("apple", "apple-id-token"));
  });

  it("rejects an Apple response with a mismatched state", async () => {
    const onCredential = vi.fn(async () => undefined);
    const onError = vi.fn();
    window.AppleID!.auth.signIn = vi.fn(async () => ({ authorization: { state: "wrong", id_token: "apple-id-token" } }));
    render(<SocialLoginOptions onCredential={onCredential} onError={onError} pending={false} />);

    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Apple로 계속" })); });
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onCredential).not.toHaveBeenCalled();
  });
});
