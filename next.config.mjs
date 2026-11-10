/** @type {import('next').NextConfig} */
const nextConfig = {
  // These database packages use native or WASM files that must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Prompts and migrations are read from disk at runtime, so hosting must be told to include them.
  outputFileTracingIncludes: { "/**": ["./prompts/**/*"] },
  // Resume files are capped at 3 MB in code. This leaves room for form overhead,
  // and stays under the hosting limit of about 4.5 MB per request.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
