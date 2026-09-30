import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas"],
  outputFileTracingIncludes: { "/*": ["./assets/fonts/**/*"] },
  experimental: {
    serverActions: {
      bodySizeLimit: "16mb"
    }
  }
};

export default nextConfig;
