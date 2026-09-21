import { pathToFileURL } from "node:url";

export const LOCAL_API_ORIGIN = "http://localhost:8000";

type ValidationOptions = {
  allowLocal?: boolean;
};

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized === "::1"
    || normalized === "0.0.0.0"
    || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

export function validateApiOrigin(value: string | undefined, options: ValidationOptions = {}) {
  const candidate = value?.trim();
  if (!candidate) {
    throw new Error("NEXT_PUBLIC_SAJURIUM_API_URL is required for a production build.");
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("NEXT_PUBLIC_SAJURIUM_API_URL must be a valid absolute URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SAJURIUM_API_URL must use http or https.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("NEXT_PUBLIC_SAJURIUM_API_URL must not contain credentials.");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("NEXT_PUBLIC_SAJURIUM_API_URL must be an origin without a path, query, or fragment.");
  }
  if (!options.allowLocal && isLocalHostname(parsed.hostname)) {
    throw new Error("NEXT_PUBLIC_SAJURIUM_API_URL must not point to localhost for a production build.");
  }

  return parsed.origin;
}

function isDirectInvocation() {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isDirectInvocation()) {
  try {
    const origin = validateApiOrigin(process.env.NEXT_PUBLIC_SAJURIUM_API_URL, {
      allowLocal: process.argv.includes("--allow-local"),
    });
    console.log(`Validated Sajurium API origin: ${origin}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
