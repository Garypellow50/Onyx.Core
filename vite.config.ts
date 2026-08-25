// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * Serve files under /ffmpeg/ directly from public/ffmpeg/ with correct MIME
 * types.  Without this, the TanStack Start SSR catch-all returns the HTML app
 * shell for .wasm and .js requests, which makes WebAssembly try to compile
 * "<!doctype html>" and crash.
 */
function serveFFmpegStatic(): Plugin {
  const MIME: Record<string, string> = {
    ".wasm": "application/wasm",
    ".js": "text/javascript",
    ".json": "application/json",
  };

  return {
    name: "serve-ffmpeg-static",
    configureServer(server) {
      // Runs before the SSR handler in Vite's middleware stack.
      server.middlewares.use((req, res, next) => {
        const url = req.url;
        if (!url || !url.startsWith("/ffmpeg/")) return next();

        const filePath = join(server.config.root, "public", url);
        if (!existsSync(filePath)) return next();

        const stat = statSync(filePath);
        const ext = extname(filePath);
        res.writeHead(200, {
          "Content-Type": MIME[ext] || "application/octet-stream",
          "Content-Length": stat.size,
        });
        createReadStream(filePath).pipe(res);
      });
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [serveFFmpegStatic()],
  },
});
