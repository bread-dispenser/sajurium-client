import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function validateBackendOpenApiUrl(value: string | undefined) {
  const candidate = value?.trim();
  if (!candidate) throw new Error("SAJURIUM_BACKEND_OPENAPI_URL is required.");

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("SAJURIUM_BACKEND_OPENAPI_URL must be a valid absolute URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("SAJURIUM_BACKEND_OPENAPI_URL must use http or https.");
  }
  return parsed.toString();
}

function isDirectInvocation() {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isDirectInvocation()) {
  try {
    const schemaUrl = validateBackendOpenApiUrl(process.env.SAJURIUM_BACKEND_OPENAPI_URL);
    const result = spawnSync(
      "bunx",
      ["openapi-typescript", schemaUrl, "-o", "src/lib/api/sasaju.generated.ts", "--check"],
      { stdio: "inherit" },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
