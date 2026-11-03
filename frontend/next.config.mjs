/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    // Deployed builds (Vercel/CI) must know the real backend; falling back to localhost would ship a broken proxy.
    if (!process.env.NEXT_PUBLIC_API_URL && (process.env.VERCEL || process.env.CI)) {
      throw new Error(
        "NEXT_PUBLIC_API_URL is required for deployed builds. Set it to the backend's public https URL (for example your Render service URL)."
      );
    }
    const backendUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
