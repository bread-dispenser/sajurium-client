import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/lib/security-headers";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingRoot: appRoot,
  turbopack: {
    root: appRoot,
  },
  async headers() {
    return [{ source: "/:path*", headers: buildSecurityHeaders() }];
  },
};

export default nextConfig;
