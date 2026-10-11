/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_OWNER_WORKSPACE: "1" },
  reactStrictMode: true,
  poweredByHeader: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false
  }
};

export default nextConfig;
