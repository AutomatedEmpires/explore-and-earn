import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@explore-and-earn/ui", "@explore-and-earn/contracts"]
};

export default nextConfig;
