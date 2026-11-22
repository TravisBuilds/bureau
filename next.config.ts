import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Disabled cacheComponents and partialPrefetching to allow dynamic routes with generateStaticParams
  // cacheComponents: true,
  // partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
