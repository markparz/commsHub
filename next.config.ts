import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Whisper runs in the browser; keep the package out of the Node server bundle.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
};

export default nextConfig;
