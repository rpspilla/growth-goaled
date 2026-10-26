import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Phase 1 founder routes, folded into the five-step flow (HANDOFF §13.2)
  async redirects() {
    const toBaseline = ["/benchmark", "/icp", "/channels", "/hiring", "/deliverables"].map((source) => ({ source, destination: "/baseline", permanent: false }));
    return [
      { source: "/dashboard", destination: "/overview", permanent: false },
      { source: "/readiness/:path*", destination: "/data/:path*", permanent: false },
      { source: "/upload", destination: "/data", permanent: false },
      { source: "/questions", destination: "/data/questions", permanent: false },
      { source: "/intake/:path*", destination: "/profile/:path*", permanent: false },
      ...toBaseline,
    ];
  },
};

export default nextConfig;
