import { log } from "./log";
import { formatBytes } from "./format";
import { getFFmpeg, onFfmpegLog, runExclusive } from "./ffmpeg-engine";

/**
 * Browser-only audio rescue pass.
 *
 * Chrome/Edge/Firefox ship no AC-3, E-AC-3, DTS or TrueHD decoder, so files
 * carrying those tracks play with perfect video and no sound. This extracts
 * just the audio track with ffmpeg.wasm, re-encodes it to AAC in an MP4
 * container, and hands back a blob URL the player can run alongside the video.
 *
 * Video is never touched: it keeps decoding natively at original quality.
 */

export interface TranscodeProgress {
  ratio: number;
  message: string;
  phase: "download" | "stage" | "encode" | "done";
}

// The read/download leg is the first third of the reported progress bar; the
// encode leg fills the rest, so the ETA stays roughly linear end to end.
const DOWNLOAD_WEIGHT = 0.35;

async function readSource(
  source: { file?: File | undefined; url?: string | undefined },
  onProgress: (p: TranscodeProgress) => void,
): Promise<Uint8Array> {
  if (source.file) {
    onProgress({
      phase: "download",
      ratio: 0,
      message: `Reading ${source.file.name} from disk (${formatBytes(source.file.size)})`,
    });
    return new Uint8Array(await source.file.arrayBuffer());
  }
  if (!source.url) throw new Error("No readable source for the audio pass");
  onProgress({ phase: "download", ratio: 0, message: "Downloading the file for the audio pass" });
  const res = await fetch(source.url);
  if (!res.ok) throw new Error(`Download failed with HTTP ${res.status}`);

  const total = Number(res.headers.get("content-length") ?? 0);
  if (!res.body || total <= 0) return new Uint8Array(await res.arrayBuffer());

  // Stream so the panel can show real byte progress on multi-GB files.
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress({
      phase: "download",
      ratio: (received / total) * DOWNLOAD_WEIGHT,
      message: `Downloading ${formatBytes(received)} of ${formatBytes(total)}`,
    });
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Picks an output the running browser can actually decode. */
function pickTarget(): { ext: string; mime: string; args: string[]; label: string } {
  const probe = document.createElement("audio");
  if (probe.canPlayType('audio/mp4; codecs="mp4a.40.2"')) {
    return {
      ext: "m4a",
      mime: "audio/mp4",
      args: ["-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"],
      label: "AAC 192 kbps in MP4",
    };
  }
  // Chromium builds without proprietary codecs (and some Linux Firefox builds)
  // reject AAC, so fall back to Opus in WebM which is always available there.
  return {
    ext: "webm",
    mime: "audio/webm",
    args: ["-c:a", "libopus", "-b:a", "160k"],
    label: "Opus 160 kbps in WebM",
  };
}

/** Extracts + re-encodes the chosen audio track. Returns a playable blob URL. */
export async function extractPlayableAudio(
  source: { name: string; file?: File | undefined; url?: string | undefined },
  options: { trackIndex?: number } = {},
  onProgress: (p: TranscodeProgress) => void = () => {},
): Promise<string> {
  const target = pickTarget();
  const ff = await getFFmpeg();
  const input = `in_${Date.now()}`;
  const output = `out_${Date.now()}.${target.ext}`;

  const bytes = await readSource(source, onProgress);
  onProgress({
    phase: "stage",
    ratio: DOWNLOAD_WEIGHT,
    message: `Staging ${formatBytes(bytes.byteLength)} in the transcoder`,
  });
  const handler = ({ progress }: { progress: number }) => {
    const clamped = Math.min(1, Math.max(0, progress));
    onProgress({
      phase: "encode",
      ratio: Math.min(0.99, DOWNLOAD_WEIGHT + clamped * (1 - DOWNLOAD_WEIGHT)),
      message: `Re-encoding audio to ${target.label} — ${Math.round(clamped * 100)}%`,
    });
  };
  ff.on("progress", handler);
  const errors: string[] = [];
  const unsubscribe = onFfmpegLog((message) => {
    if (/error|invalid|failed|could not|unknown decoder/i.test(message)) errors.push(message);
  });

  try {
    const data = await runExclusive(async () => {
      await ff.writeFile(input, bytes);
      const map = options.trackIndex === undefined ? "0:a:0" : `0:a:${options.trackIndex}`;
      log.info("transcode", `Extracting audio stream ${map} and encoding it to ${target.label}`);
      const code = await ff.exec([
        "-hide_banner",
        "-i",
        input,
        "-vn",
        "-sn",
        "-dn",
        "-map",
        map,
        ...target.args,
        output,
      ]);
      if (code !== 0) {
        const detail = errors.at(-1);
        throw new Error(detail ? `Audio conversion failed: ${detail}` : `Audio conversion failed (code ${code})`);
      }
      return ff.readFile(output);
    });
    const buffer = typeof data === "string" ? new TextEncoder().encode(data) : data;
    const blob = new Blob([buffer as unknown as BlobPart], { type: target.mime });
    onProgress({ phase: "done", ratio: 1, message: "Audio track recovered" });
    log.ok("transcode", "Audio recovered", `${formatBytes(blob.size)} of ${target.label}`);
    return URL.createObjectURL(blob);
  } finally {
    unsubscribe();
    ff.off("progress", handler);
    await ff.deleteFile(input).catch(() => {});
    await ff.deleteFile(output).catch(() => {});
  }
}
