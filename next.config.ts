import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
