import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import svelte from "@astrojs/svelte";
import vercel from "@astrojs/vercel/serverless";

export default defineConfig({
  output: "server",
  adapter: vercel({
    maxDuration: 60,
    // No runtime specified - let Vercel decide
  }),
  integrations: [svelte(), tailwind()],
  vite: {
    ssr: {
      noExternal: ["abcjs"],
    },
    server: {
      // Allow access from any host (Tailscale, LAN, phones, etc.) during dev.
      // Vite blocks non-localhost hostnames by default for security.
      allowedHosts: true,
    },
  },
});
