/** @type {import('next').NextConfig} */

// Origin of the Go edge, reachable from the Next.js server. API mutations flow
// through app/api/[...path]; this value is also used for server-rendered catalog data.
const BACKEND_ORIGIN = (
    process.env.GO_API_BASE_URL
    || process.env.NEXT_PUBLIC_BACKEND_URL
    || 'http://127.0.0.1:8088'
).replace(/\/$/, '');
const PUBLIC_BACKEND_ORIGIN = (
    process.env.NEXT_PUBLIC_BACKEND_URL
    || process.env.VITE_BACKEND_URL
    || BACKEND_ORIGIN
).replace(/\/$/, '');

const isDev = process.env.NODE_ENV !== 'production';

const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://images.unsplash.com https://*.tile.openstreetmap.org https://server.arcgisonline.com https://api.midtrans.com https://api.sandbox.midtrans.com",
    `connect-src 'self' ${BACKEND_ORIGIN} ${PUBLIC_BACKEND_ORIGIN} https://nominatim.openstreetmap.org https://*.tile.openstreetmap.org https://server.arcgisonline.com${isDev ? ' ws: wss:' : ''}`,
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(process.env.FORCE_HTTPS === 'true' ? ['upgrade-insecure-requests'] : []),
].join('; ');

const nextConfig = {
    reactStrictMode: true,
    // Allow the dev server (HMR/assets) to be used from other devices on the local
    // network without cross-origin warnings. Add your machine's LAN IP here.
    allowedDevOrigins: ['192.168.18.112', '192.168.18.*', '192.168.*'],
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    { key: 'Content-Security-Policy', value: contentSecurityPolicy },
                    { key: 'X-Frame-Options', value: 'DENY' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)' },
                ],
            },
        ];
    },
};

export default nextConfig;
