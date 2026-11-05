/** @type {import('next').NextConfig} */
const nextConfig = {
  // These database packages use native or WASM files that must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Prompts and migrations are read from disk at runtime, so hosting must be told to include them.
  outputFileTracingIncludes: { "/**": ["./prompts/**/*"] },
};

export default nextConfig;
