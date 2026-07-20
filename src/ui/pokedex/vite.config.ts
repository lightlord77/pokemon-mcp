// src/ui/pokedex/vite.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const INPUT = process.env.INPUT;
if (!INPUT) {
  throw new Error("INPUT environment variable is not set");
}

const isDevelopment = process.env.NODE_ENV === "development";

export default defineConfig({
  // root fixado explicitamente (não o cwd) porque este config vive em
  // src/ui/pokedex/, não na raiz do projeto.
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [viteSingleFile()],
  build: {
    sourcemap: isDevelopment ? "inline" : undefined,
    cssMinify: !isDevelopment,
    minify: !isDevelopment,
    rollupOptions: { input: INPUT },
    outDir: "dist", // relativo ao root => src/ui/pokedex/dist/mcp-app.html
    emptyOutDir: false,
  },
});
