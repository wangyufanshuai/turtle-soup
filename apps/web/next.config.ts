import type { NextConfig } from "next";

const BUILD_IDS: Record<string, string> = {
  "v1.4-internal-rc": "2H-4JbHlDL6pCcIbkoiHe",
  "v1.5-internal-rc": "black-soup-v15-golden-rc",
  "v1.6-internal-rc": "black-soup-v16-blackbox-rc",
  "v1.7-internal-rc": "black-soup-v17-golden-path-rc",
  "v1.8-internal-rc": "black-soup-v18-golden-nine-hardening-rc",
};

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  transpilePackages: ["@turtle-soup/mystery-core"],
  images: { unoptimized: true },
  generateBuildId: async () => BUILD_IDS[process.env.TURTLE_SOUP_RELEASE_PROFILE ?? "v1.4-internal-rc"] ?? "black-soup-local-build",
};

export default nextConfig;
