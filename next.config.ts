import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb'
    }
  },
  env: {
    PORT: process.env.PORT || '8080'
  },
  // Required for Azure Web App
  httpAgentOptions: {
    keepAlive: true,
  },
  // Ensure proper port binding
  serverOptions: {
    port: parseInt(process.env.PORT || '8080', 10)
  }
};

export default nextConfig;
