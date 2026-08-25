import { log } from "./log";

/**
 * Single shared ffmpeg.wasm instance.
 *
 * The core has one filesystem and one exec slot, so every caller goes through
 * `runExclusive` — the streaming remuxer and the audio rescue pass would
 * otherwise trample each other's temp files.
 *
 * Both JS files are served untransformed from /public: the worker loads the
 * core with a dynamic import, which a bundler would rewrite into a module
 * lookup the worker cannot resolve.
 */
const CORE_URL = "/ffmpeg/ffmpeg-core.js";
const WORKER_URL = "/ffmpeg/worker.js";
// Keep the matching binary in /public with the worker and core script. The
// former Lovable asset URL resolves to the app shell in local/dev previews,
// which makes WebAssembly try to compile `<!doctype html>`.
const WASM_URL = "/ffmpeg/ffmpeg-core.wasm";

export type FFmpegInstance = import("@ffmpeg/ffmpeg").FFmpeg;

let enginePromise: Promise<FFmpegInstance> | null = null;
const logListeners = new Set<(message: string) => void>();

/** Subscribe to raw ffmpeg stderr lines (used to read stream/duration info). */
export function onFfmpegLog(fn: (message: string) => void): () => void {
  logListeners.add(fn);
  return () => logListeners.delete(fn);
}

/**
 * Explains a failed core load in terms of the file that was actually served.
 *
 * A WebAssembly CompileError from a known-good build is almost never a code
 * problem: it means the bytes were not the build. The two ways that happens
 * here are a dev/preview server answering with the app shell instead of the
 * asset, and an incomplete copy of the 32 MB binary — a truncated download
 * reports as a bogus function-body length at whatever offset the file stops,
 * which reads like a limit that was exceeded rather than a file that ran out.
 * Both are invisible in the raw error, so state the observed facts.
 */
async function describeCoreAssets(): Promise<string | null> {
  const parts: string[] = [];
  for (const url of [WASM_URL, CORE_URL]) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      const length = res.headers.get("content-length");
      const type = res.headers.get("content-type") ?? "unknown";
      const size = length ? `${(Number(length) / 1e6).toFixed(1)} MB` : "size not reported";
      parts.push(`${url} → HTTP ${res.status} · ${type} · ${size}`);
    } catch {
      parts.push(`${url} → unreachable`);
    }
  }
  return parts.length ? parts.join("\n") : null;
}

export async function getFFmpeg(): Promise<FFmpegInstance> {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    log.info("transcode", "Loading the media engine (ffmpeg.wasm, ~32 MB, cached after this)");
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const ff = new FFmpeg();
    ff.on("log", ({ message }) => {
      log.debug("ffmpeg", message);
      for (const fn of logListeners) fn(message);
    });
    await ff.load({ coreURL: CORE_URL, wasmURL: WASM_URL, classWorkerURL: WORKER_URL });
    log.ok("transcode", "Media engine ready");
    return ff;
  })().catch(async (err) => {
    enginePromise = null;
    if (err instanceof WebAssembly.CompileError || /wasm|WebAssembly/i.test(String(err))) {
      const served = await describeCoreAssets();
      log.error(
        "transcode",
        "The media engine binary is not a valid WebAssembly module — the file served is not the build",
        served ? `${String(err)}\n${served}` : String(err),
      );
    }
    throw err;
  });
  return enginePromise;
}

let queue: Promise<unknown> = Promise.resolve();

/** Serializes work against the single wasm instance. */
export function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}
