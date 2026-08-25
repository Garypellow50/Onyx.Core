import { formatBytes } from "./format";
import { getFFmpeg, onFfmpegLog, runExclusive } from "./ffmpeg-engine";
import { log } from "./log";
import type { RemuxHandle, RemuxStatus } from "./stream-remux";

/**
 * Whole-file remuxer for containers that cannot be cut into byte windows.
 *
 * AVI (RIFF), MPEG-PS, WMV/ASF and FLV keep their index/headers away from the
 * data, so the windowed Matroska path does not apply: ffmpeg needs the whole
 * input. The file is pulled once (locally: zero copy; remotely: through the
 * range-aware relay), remuxed into a fragmented MP4 with the video stream
 * copied bit-for-bit whenever the browser has a decoder for it, and handed to
 * the element as a single blob URL so seeking stays instant.
 */

const CHUNK = 8 * 1024 * 1024;
const BROWSER_VIDEO_CODECS = ["h264", "hevc", "h265", "vp8", "vp9", "av1"];

function guessDurationFromLog(line: string): number | null {
  const m = line.match(/Duration:\s*(\d+):(\d\d):(\d\d(?:\.\d+)?)/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export async function startFileRemux(opts: {
  source: { name: string; size: number; file?: File | undefined; url?: string | undefined };
  video: () => HTMLVideoElement | null;
  attach: (url: string) => void;
  onStatus: (status: RemuxStatus) => void;
}): Promise<RemuxHandle> {
  const { source, attach, onStatus } = opts;
  if (!source.file && !source.url) throw new Error("No readable source for the remux");

  let destroyed = false;
  onStatus({ phase: "probe", message: "Loading the media engine", ratio: 0 });
  const ff = await getFFmpeg();
  if (destroyed) throw new Error("cancelled");

  /* ---- 1. bring the bytes in, reporting progress the whole way */
  let bytes: Uint8Array;
  if (source.file) {
    onStatus({ phase: "probe", message: `Reading ${source.name} from disk`, ratio: 0 });
    bytes = new Uint8Array(await source.file.arrayBuffer());
  } else {
    const res = await fetch(source.url!);
    if (!res.ok) throw new Error(`The host answered HTTP ${res.status} for that file`);
    const total = source.size || Number(res.headers.get("content-length") ?? 0);
    const reader = res.body?.getReader();
    if (!reader) {
      bytes = new Uint8Array(await res.arrayBuffer());
    } else {
      const parts: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done || destroyed) break;
        parts.push(value);
        got += value.byteLength;
        onStatus({
          phase: "probe",
          message: `Downloading ${formatBytes(got)}${total ? ` of ${formatBytes(total)}` : ""}`,
          ratio: total ? (got / total) * 0.5 : 0,
        });
      }
      if (destroyed) throw new Error("cancelled");
      bytes = new Uint8Array(got);
      let at = 0;
      for (const part of parts) {
        bytes.set(part, at);
        at += part.byteLength;
      }
    }
  }
  log.ok("remux", `Loaded ${source.name}`, `${formatBytes(bytes.byteLength)} in memory`);

  /* ---- 2. remux in one pass */
  const ext = source.name.split(".").pop()?.toLowerCase() || "bin";
  const input = `in_${Date.now()}.${ext}`;
  const output = `out_${Date.now()}.mp4`;

  let duration = 0;
  let videoCodec = "";
  const stop = onFfmpegLog((line) => {
    const d = guessDurationFromLog(line);
    if (d && !duration) duration = d;
    const v = line.match(/Stream #\d+:\d+.*: Video: ([\w-]+)/);
    if (v?.[1] && !videoCodec) videoCodec = v[1].toLowerCase();
  });

  const baseArgs = (copyVideo: boolean) => [
    "-hide_banner",
    "-fflags",
    "+igndts",
    "-i",
    input,
    "-map",
    "0:v:0?",
    "-map",
    "0:a:0?",
    "-sn",
    "-dn",
    ...(copyVideo ? ["-c:v", "copy"] : ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "24"]),
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ac",
    "2",
    "-movflags",
    "frag_keyframe+empty_moov+default_base_moof+faststart",
    "-f",
    "mp4",
    output,
  ];

  const data = await runExclusive(async () => {
    const progress = ({ progress }: { progress: number }) => {
      if (destroyed) return;
      onStatus({
        phase: "stream",
        message: `Remuxing ${source.name} to a browser-playable stream`,
        ratio: 0.5 + Math.min(Math.max(progress, 0), 1) * 0.5,
      });
    };
    ff.on("progress", progress);
    try {
      await ff.writeFile(input, bytes);
      onStatus({ phase: "stream", message: "Remuxing the container", ratio: 0.5 });
      let code = await ff.exec(baseArgs(true));
      if (code !== 0 || (videoCodec && !BROWSER_VIDEO_CODECS.includes(videoCodec))) {
        log.warn(
          "remux",
          videoCodec
            ? `No browser decoder for ${videoCodec} — re-encoding the picture to H.264`
            : "Stream copy failed — re-encoding the picture to H.264",
        );
        onStatus({ phase: "stream", message: "Re-encoding the picture to H.264", ratio: 0.5 });
        await ff.deleteFile(output).catch(() => {});
        code = await ff.exec(baseArgs(false));
      }
      if (code !== 0) throw new Error(`ffmpeg exited with code ${code} while remuxing this file`);
      const out = await ff.readFile(output);
      return typeof out === "string" ? new TextEncoder().encode(out) : out;
    } finally {
      ff.off("progress", progress);
      await ff.deleteFile(input).catch(() => {});
      await ff.deleteFile(output).catch(() => {});
    }
  });
  stop();
  if (destroyed) throw new Error("cancelled");

  const blob = new Blob([data as unknown as BlobPart], { type: "video/mp4" });
  const url = URL.createObjectURL(blob);
  attach(url);
  onStatus({ phase: "done", message: "Remux complete — playing the converted stream", ratio: 1 });
  log.ok(
    "remux",
    `${source.name} remuxed`,
    `${formatBytes(blob.size)} of fragmented MP4 · video ${videoCodec || "unknown"}`,
  );

  return {
    url,
    duration,
    seek(seconds: number) {
      const video = opts.video();
      if (video) video.currentTime = seconds;
    },
    destroy() {
      destroyed = true;
      URL.revokeObjectURL(url);
      log.info("remux", "Whole-file remux released");
    },
  };
}
