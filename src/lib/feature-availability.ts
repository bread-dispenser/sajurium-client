/** Public build settings. A provider appears only after its backend rollout. */
export const socialLoginEnabled = process.env.NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED === "true";
export const googleClientId = socialLoginEnabled ? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "" : "";
export const appleClientId = socialLoginEnabled ? process.env.NEXT_PUBLIC_APPLE_CLIENT_ID ?? "" : "";
export const appleRedirectUri = socialLoginEnabled ? process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI ?? "" : "";
export const pushEnabled = process.env.NEXT_PUBLIC_PUSH_ENABLED === "true";

export const googleLoginAvailable = Boolean(googleClientId);
export const appleLoginAvailable = Boolean(appleClientId && appleRedirectUri);
