import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained production build: .next/standalone carries server.js and
  // the minimal node_modules needed at runtime — no `npm install` on the server.
  output: "standalone",

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            // Allow embedding ONLY by Telegram Web (Mini Apps iframe).
            // Everyone else is blocked — clickjacking protection.
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
