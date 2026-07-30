/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  /**
   * Backend web ilova bilan bir manzildan xizmat qiladi.
   * Shunda Mini App tunnel yoki domen orqali ochilganda ham
   * API chaqiruvlari ishlaydi va CORS muammosi bo'lmaydi.
   */
  async rewrites() {
    const target = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';
    return [
      { source: '/api/:path*', destination: `${target}/api/:path*` },
      { source: '/health', destination: `${target}/health` },
    ];
  },

  async headers() {
    return [
      {
        // Telegram Mini App sahifasi Telegram ichida iframe'da ochiladi
        source: '/app/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          {
            key: 'Content-Security-Policy',
            value: 'frame-ancestors https://web.telegram.org https://*.telegram.org self;',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
