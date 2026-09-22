import { describe, expect, it, vi } from "vitest";
import { buildSecurityHeaders } from "@/lib/security-headers";

function headerMap() {
  return new Map(buildSecurityHeaders().map((header) => [header.key, header.value]));
}

describe("production security headers", () => {
  it("sets the required header keys", () => {
    const headers = headerMap();
    for (const key of [
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "X-Frame-Options",
      "Strict-Transport-Security",
    ]) {
      expect(headers.get(key), `missing ${key}`).toBeTruthy();
    }
  });

  it("locks down content types, referrers, and browser features", () => {
    const headers = headerMap();
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(headers.get("Permissions-Policy")).toContain("microphone=()");
    expect(headers.get("Permissions-Policy")).toContain("geolocation=()");
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=");
  });

  it("denies framing via X-Frame-Options and CSP frame-ancestors", () => {
    const headers = headerMap();
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("keeps the CSP scoped to self plus the configured API origin", () => {
    const headers = headerMap();
    const csp = headers.get("Content-Security-Policy")!;
    const apiOrigin = new URL(process.env.NEXT_PUBLIC_SAJURIUM_API_URL ?? "http://localhost:8000").origin;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain(`connect-src 'self' ${apiOrigin}`);
  });

  it("opens provider script and frame origins only for configured social login", () => {
    try {
      vi.stubEnv("NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED", "false");
      expect(headerMap().get("Content-Security-Policy")).not.toContain("accounts.google.com");
      vi.stubEnv("NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED", "true");
      vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "google-client");
      vi.stubEnv("NEXT_PUBLIC_APPLE_CLIENT_ID", "apple-client");
      vi.stubEnv("NEXT_PUBLIC_APPLE_REDIRECT_URI", "https://sajurium.justn.me/login");
      const csp = headerMap().get("Content-Security-Policy")!;
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).toContain("https://accounts.google.com/gsi/client");
      expect(csp).toContain("https://appleid.cdn-apple.com");
      expect(csp).toContain("frame-src 'self' https://accounts.google.com/gsi/ https://appleid.apple.com");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
