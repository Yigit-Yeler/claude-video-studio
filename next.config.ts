import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["remotion", "@remotion/player"],
  serverExternalPackages: ["ffmpeg-static"],
  experimental: {
    agentUpgrade: "security",
  },
};

export default nextConfig;
