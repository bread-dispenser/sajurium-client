import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingRoot: appRoot,
  turbopack: {
    root: appRoot,
  },
};

export default nextConfig;
