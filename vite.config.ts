import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Built assets are served from file:// by the tinyjs desktop shell.
  base: "./",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    watch: {
      // tinyjs scratch output and the backend (its own process) don't affect the page.
      ignored: ["**/.build/**", "**/backend/**"],
    },
  },
});
