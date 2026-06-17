import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  define: {
    "process.env": {},
    global: "globalThis",
  },
  optimizeDeps: {
    include: ["buffer", "@coral-xyz/anchor", "@solana/web3.js"],
  },
});
