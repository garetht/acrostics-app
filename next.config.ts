import type { NextConfig } from "next";

const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
const basePath =
  rawBasePath && rawBasePath !== "/"
    ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}`
    : undefined;

const nextConfig: NextConfig = {
  basePath,
  output: "export",
  trailingSlash: true,
};

export default nextConfig;
