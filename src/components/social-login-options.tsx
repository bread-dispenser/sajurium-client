"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { appleClientId, appleLoginAvailable, appleRedirectUri, googleClientId, googleLoginAvailable } from "@/lib/feature-availability";
import type { SocialProvider } from "@/lib/api/service";

type GoogleCredential = { credential?: string; state?: string };
type AppleAuthorization = { authorization?: { id_token?: string; state?: string } };

declare global {
  interface Window {
    google?: { accounts: { id: {
      initialize(options: { client_id: string; callback: (response: GoogleCredential) => void; ux_mode: "popup" }): void;
      renderButton(parent: HTMLElement, options: { theme: "outline"; size: "large"; text: "continue_with"; width: number }): void;
      disableAutoSelect(): void;
    } } };
    AppleID?: { auth: {
      init(options: { clientId: string; redirectURI: string; scope: string; state: string; nonce: string; usePopup: true }): void;
      signIn(): Promise<AppleAuthorization>;
    } };
  }
}

type CredentialHandler = (provider: SocialProvider, idToken: string) => Promise<void>;

/** Client-side providers that can hand back an id_token in this build (Kakao has no client flow yet). */
export function clientSocialProviders(): SocialProvider[] {
  return [...(googleLoginAvailable ? ["google" as const] : []), ...(appleLoginAvailable ? ["apple" as const] : [])];
}

/**
 * Provider buttons that obtain an id_token and pass it to `onCredential`. The login screen exchanges
 * it for a session; the account screen links it to the signed-in account.
 */
export function SocialProviderButtons({
  providers,
  onCredential,
  onError,
  pending,
  appleLabel = "Apple로 계속",
}: {
  providers: readonly SocialProvider[];
  onCredential: CredentialHandler;
  onError: (message: string) => void;
  pending: boolean;
  appleLabel?: string;
}) {
  const googleMount = useRef<HTMLDivElement>(null);
  const [appleReady, setAppleReady] = useState(false);
  const pendingRef = useRef(pending);
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  const showGoogle = googleLoginAvailable && providers.includes("google");
  const showApple = appleLoginAvailable && providers.includes("apple");

  function renderGoogleButton() {
    const target = googleMount.current;
    const identity = window.google?.accounts.id;
    if (!target || !identity) return onError("Google 로그인 화면을 불러오지 못했어요.");
    target.replaceChildren();
    identity.initialize({
      client_id: googleClientId,
      ux_mode: "popup",
      callback: (response) => {
        if (!response.credential) return onError("Google 인증 정보가 전달되지 않았어요.");
        if (!pendingRef.current) void onCredential("google", response.credential);
      },
    });
    identity.renderButton(target, {
      theme: "outline", size: "large", text: "continue_with",
      width: Math.min(target.clientWidth || 280, 320),
    });
  }

  async function signInWithApple() {
    const identity = window.AppleID?.auth;
    if (!identity) return onError("Apple 로그인 화면을 불러오지 못했어요.");
    const state = window.crypto.randomUUID();
    const nonce = window.crypto.randomUUID();
    try {
      identity.init({ clientId: appleClientId, redirectURI: appleRedirectUri,
                      scope: "name email", state, nonce, usePopup: true });
      const response = await identity.signIn();
      if (response.authorization?.state !== state || !response.authorization.id_token) {
        throw new Error("INVALID_APPLE_RESPONSE");
      }
      await onCredential("apple", response.authorization.id_token);
    } catch {
      onError("Apple 로그인을 완료하지 못했어요. 취소했다면 다시 시도해 주세요.");
    }
  }

  return (
    <>
      {showGoogle && <>
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive"
                onReady={renderGoogleButton} onError={() => onError("Google 로그인 화면을 불러오지 못했어요. 새로고침한 뒤 다시 시도해 주세요.")} />
        <div ref={googleMount} style={{ display: "flex", justifyContent: "center", minHeight: 44 }} />
      </>}
      {showApple && <>
        <Script src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"
                strategy="afterInteractive" onReady={() => setAppleReady(true)}
                onError={() => onError("Apple 로그인 화면을 불러오지 못했어요. 새로고침한 뒤 다시 시도해 주세요.")} />
        <button className="sj-button-secondary" type="button" disabled={!appleReady || pending}
                style={{ minHeight: 52, background: "var(--sj-ink)", borderColor: "var(--sj-ink)", color: "#ffffff" }}
                onClick={() => { void signInWithApple(); }}>{appleLabel}</button>
      </>}
    </>
  );
}

export function SocialLoginOptions({
  onCredential,
  onError,
  pending,
}: {
  onCredential: CredentialHandler;
  onError: (message: string) => void;
  pending: boolean;
}) {
  const providers = clientSocialProviders();

  return (
    <section className="sj-section" style={{ gap: 10 }} aria-label="다른 방법으로 계속하기">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }} aria-hidden="true">
        <span style={{ flex: "1 1 auto", height: 1, background: "var(--sj-line)" }} />
        <span className="sj-meta">또는</span>
        <span style={{ flex: "1 1 auto", height: 1, background: "var(--sj-line)" }} />
      </div>
      <SocialProviderButtons providers={providers} onCredential={onCredential} onError={onError} pending={pending} />
      <button className="sj-button-secondary" type="button" disabled aria-describedby="kakao-login-note"
              style={{ minHeight: 52, borderStyle: "dashed", background: "var(--sj-sunk)", color: "var(--sj-muted)" }}>
        카카오로 계속<span id="kakao-login-note" className="sj-badge" style={{ background: "var(--sj-surface)" }}>준비 중</span>
      </button>
      {providers.length === 0 && <p className="sj-fine sj-center">소셜 로그인은 준비 중이에요. 지금은 이메일로 로그인할 수 있어요.</p>}
    </section>
  );
}
