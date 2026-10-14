// ibl.ai: Node.js 22+ localStorage polyfill (missing getItem/setItem in SSR)
if (
  typeof window === "undefined" &&
  typeof localStorage !== "undefined" &&
  typeof localStorage.getItem !== "function"
) {
  const _s: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (k: string) => _s[k] ?? null,
    setItem: (k: string, v: string) => {
      _s[k] = String(v);
    },
    removeItem: (k: string) => {
      delete _s[k];
    },
    clear: () => {
      for (const k in _s) delete _s[k];
    },
    get length() {
      return Object.keys(_s).length;
    },
    key: (i: number) => Object.keys(_s)[i] ?? null,
  } as Storage;
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel builds the regular output; standalone is for the Dockerfile.
  output: process.env.VERCEL ? undefined : "standalone",
  // The SDK's useVoiceChat never resets its isMounted ref after StrictMode's
  // dev double-mount, wedging voice input at "Processing…". Host workaround
  // (see /iblai-vibe-agent-chat "Known issues"); production runs effects once.
  reactStrictMode: false,
  // `next dev` would otherwise append its "AI agents" block to AGENTS.md on every start.
  agentRules: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  turbopack: {},
};

export default nextConfig;
