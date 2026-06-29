import { defineConfig } from "vite";

export default defineConfig({
  // Configure Vite dev server
  server: {
    port: 3000,
    // Proxy all API requests to the Express backend running on port 8000
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        secure: false
      }
    }
  },
  // Ensure correct build root directory
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: "index.html",
        login: "login.html",
        instructions: "instructions.html",
        exam: "exam.html",
        result: "result.html"
      }
    }
  }
});
