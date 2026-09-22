export type SecurityHeader = { key: string; value: string };

export function buildSecurityHeaders(): SecurityHeader[] {
  const apiOrigin = new URL(
    process.env.NEXT_PUBLIC_SAJURIUM_API_URL ?? "http://localhost:8000",
  ).origin;

  const isDev = process.env.NODE_ENV !== "production";
  const socialEnabled = process.env.NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED === "true";
  const googleEnabled = socialEnabled && Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
  const appleEnabled = socialEnabled && Boolean(process.env.NEXT_PUBLIC_APPLE_CLIENT_ID && process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI);

  const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${googleEnabled ? " https://accounts.google.com/gsi/client" : ""}${appleEnabled ? " https://appleid.cdn-apple.com" : ""}`,
    `style-src 'self' 'unsafe-inline'${googleEnabled ? " https://accounts.google.com/gsi/style" : ""}`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin}${googleEnabled ? " https://accounts.google.com/gsi/" : ""}${appleEnabled ? " https://appleid.apple.com" : ""}${isDev ? " ws: wss:" : ""}`,
    ...(googleEnabled || appleEnabled ? [`frame-src 'self'${googleEnabled ? " https://accounts.google.com/gsi/" : ""}${appleEnabled ? " https://appleid.apple.com" : ""}`] : []),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    },
  ];
}
