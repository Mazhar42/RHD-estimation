import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Backend port is overridable (VITE_DEV_BACKEND_PORT) so a second backend
// instance -- e.g. for E2E tests, which need their own throwaway DB -- can
// run alongside a normal dev server without a port clash.
const backendTarget = `http://127.0.0.1:${process.env.VITE_DEV_BACKEND_PORT || 8001}`;

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    globals: false,
    css: false,
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
  server: {
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
