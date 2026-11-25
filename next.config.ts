import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["remotion", "@remotion/player"],
  serverExternalPackages: ["@cursor/sdk", "ffmpeg-static"],
  experimental: {
    agentUpgrade: "security",
  },
};

export default nextConfig;
