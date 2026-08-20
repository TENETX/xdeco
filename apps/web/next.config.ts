import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: ["@plan-orchestrator/shared"],
};

export default nextConfig;
