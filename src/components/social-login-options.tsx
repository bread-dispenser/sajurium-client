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

export function SocialLoginOptions({
  onCredential,
  onError,
  pending,
}: {
  onCredential: (provider: SocialProvider, idToken: string) => Promise<void>;
  onError: (message: string) => void;
  pending: boolean;
}) {
  const googleMount = useRef<HTMLDivElement>(null);
  const [appleReady, setAppleReady] = useState(false);
  const pendingRef = useRef(pending);
  useEffect(() => { pendingRef.current = pending; }, [pending]);

  if (!googleLoginAvailable && !appleLoginAvailable) return null;

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
    <section className="social-login-options" aria-label="소셜 로그인">
      <p className="supporting">또는 소셜 계정으로 계속하기</p>
      {googleLoginAvailable && <>
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive"
                onReady={renderGoogleButton} onError={() => onError("Google 로그인 화면을 불러오지 못했어요.")} />
        <div ref={googleMount} className="social-login-google" />
      </>}
      {appleLoginAvailable && <>
        <Script src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"
                strategy="afterInteractive" onReady={() => setAppleReady(true)}
                onError={() => onError("Apple 로그인 화면을 불러오지 못했어요.")} />
        <button className="secondary-button" type="button" disabled={!appleReady || pending}
                onClick={() => { void signInWithApple(); }}>Apple로 계속</button>
      </>}
    </section>
  );
}
