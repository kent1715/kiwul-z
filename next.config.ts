import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  serverExternalPackages: ['edge-tts'],
  allowedDevOrigins: ['http://127.0.0.1:81', 'http://localhost:81'],
};

export default nextConfig;
