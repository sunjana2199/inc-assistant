import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // In development, send /api/py/* to the local FastAPI server (uvicorn on port 8000).
  // On Vercel, /api/py/* is handled by the Python function in api/index.py.
  async rewrites() {
    return [
      {
        source: "/api/py/:path*",
        destination:
          process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000/api/py/:path*" : "/api/",
      },
    ];
  },
};

export default nextConfig;
