import createNextIntlPlugin from 'next-intl/plugin';

// next-intl plugin: tells the bundler where the request config lives so the
// locale (cookie-driven, no URL prefix) is resolved per request.
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default withNextIntl(nextConfig);
