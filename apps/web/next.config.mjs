import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Docker image sets NEXT_OUTPUT=standalone so the runtime stage only ships the files
  // Next traces as needed. Local `next start` keeps the default output.
  ...(process.env.NEXT_OUTPUT === "standalone"
    ? { output: "standalone", outputFileTracingRoot: path.join(import.meta.dirname, "../..") }
    : {}),
  transpilePackages: ["@iappstores/contracts"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000"
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin"
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN"
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()"
          }
        ]
      },
      {
        source: "/api/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, follow"
          }
        ]
      }
    ];
  },
  async rewrites() {
    const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";

    return [
      {
        source: "/api/:path*",
        destination: `${apiInternalUrl}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
