import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const ensureHtmlString = () => ({
  name: "ensure-html-string",
  enforce: "pre",
  generateBundle(_, bundle) {
    Object.values(bundle).forEach((chunk) => {
      if (chunk.type === "asset" && chunk.fileName.endsWith(".html")) {
        if (chunk.source != null && typeof chunk.source !== "string") {
          chunk.source = chunk.source.toString();
        }
      }
    });
  },
});

export default defineConfig({
  plugins: [ensureHtmlString(), viteSingleFile()],
  server: {
    allowedHosts: ["nonpredictive-boris-alarmingly.ngrok-free.dev"],
  },
  build: {
    target: "es2018",
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
