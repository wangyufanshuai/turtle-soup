import type { NextConfig } from "next";

const BUILD_IDS: Record<string, string> = {
  "v1.4-internal-rc": "2H-4JbHlDL6pCcIbkoiHe",
  "v1.5-internal-rc": "black-soup-v15-golden-rc",
  "v1.6-internal-rc": "black-soup-v16-blackbox-rc",
  "v1.7-internal-rc": "black-soup-v17-golden-path-rc",
  "v1.8-internal-rc": "black-soup-v18-golden-nine-hardening-rc",
  "v1.9-internal-rc": "black-soup-v19-ai-language-bridge-rc",
  "v2.0-internal-rc": "black-soup-v20-autonomous-experience-rc",
  "v2.1-internal-rc": "black-soup-v21-experience-continuity-rc",
  "v2.2-internal-rc": "black-soup-v22-cognitive-friction-rc",
  "v2.3-internal-rc": "black-soup-v23-resolution-payoff-rc",
  "v2.4-internal-rc": "black-soup-v24-investigation-rhythm-rc",
  "v2.5-internal-rc": "black-soup-v25-season5-content-rc",
  "v2.6-internal-rc": "black-soup-v26-investigation-workbench-rc",
  "v2.7-internal-rc": "black-soup-v27-player-first-rc",
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
