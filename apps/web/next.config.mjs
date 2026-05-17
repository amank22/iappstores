/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@iappstores/contracts"],
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
