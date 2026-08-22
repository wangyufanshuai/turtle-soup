import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  transpilePackages: ["@turtle-soup/mystery-core"],
  images: { unoptimized: true },
};

export default nextConfig;
