import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  transpilePackages: ["@turtle-soup/mystery-core"],
  images: { unoptimized: true },
};

export default nextConfig;
