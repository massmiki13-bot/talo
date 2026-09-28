import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Test unitari della logica (npm test). Non usano il database né l'IA:
// da .env.local serve solo l'indirizzo pubblico di Supabase.
const { VITE_SUPABASE_URL = "" } = loadEnv("test", process.cwd(), "VITE_");

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    setupFiles: ["tests/setup.js"],
    env: { VITE_SUPABASE_URL },
  },
});
