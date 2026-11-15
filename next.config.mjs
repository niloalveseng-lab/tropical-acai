/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fotos do cardápio enviadas pelo painel ficam no Supabase Storage.
  images: { remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" }] },
};

export default nextConfig;
