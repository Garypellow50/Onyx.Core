import { log } from "./log";

export const VIDEO_EXTENSIONS = [
  "mp4",
  "m4v",
  "webm",
  "mkv",
  "mov",
  "avi",
  "ts",
  "m2ts",
  "mts",
  "flv",
  "wmv",
  "mpg",
  "mpeg",
  "ogv",
  "3gp",
];

export const AUDIO_EXTENSIONS = [
  "mp3",
  "m4a",
  "aac",
  "flac",
  "wav",
  "ogg",
  "oga",
  "opus",
  "wma",
  "alac",
];

export const SUBTITLE_EXTENSIONS = ["vtt", "srt", "ass", "ssa"];

/** Containers the browser can play directly, with no remux step. */
const NATIVE_EXTENSIONS = [
  "mp4",
  "m4v",
  "webm",
  "mov",
  "mp3",
  "m4a",
  "aac",
  "wav",
  "ogg",
  "oga",
  "opus",
  "flac",
];

export type MediaKind = "video" | "audio";

export interface MediaItem {
  id: string;
  name: string;
  kind: MediaKind;
  extension: string;
  size?: number | undefined;
  origin: "local" | "remote";
  file?: File | undefined;
  url?: string | undefined;
  native: boolean;
  mime: string;
}

export function extensionOf(name: string): string {
  const clean = name.split(/[?#]/)[0] ?? name;
  const parts = clean.split(".");
  return parts.length > 1 ? (parts.pop() ?? "").toLowerCase() : "";
}

export function isMediaFileName(name: string): boolean {
  const ext = extensionOf(name);
  return VIDEO_EXTENSIONS.includes(ext) || AUDIO_EXTENSIONS.includes(ext);
}

export function isSubtitleFileName(name: string): boolean {
  return SUBTITLE_EXTENSIONS.includes(extensionOf(name));
}

export function kindOf(name: string): MediaKind {
  return AUDIO_EXTENSIONS.includes(extensionOf(name)) ? "audio" : "video";
}

export function mimeFor(name: string): string {
  const ext = extensionOf(name);
  const map: Record<string, string> = {
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    ts: "video/mp2t",
    ogv: "video/ogg",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    wav: "audio/wav",
    ogg: "audio/ogg",
    oga: "audio/ogg",
    opus: "audio/ogg",
    flac: "audio/flac",
  };
  return map[ext] ?? (kindOf(name) === "audio" ? "audio/*" : "video/*");
}

export function isNativeContainer(name: string): boolean {
  return NATIVE_EXTENSIONS.includes(extensionOf(name));
}

/**
 * How a non-native container has to be converted:
 *  - "window": Matroska/WebM, cut on cluster boundaries and streamed
 *  - "file":   AVI/ASF/FLV/MPEG-PS, whose index lives away from the data, so
 *              ffmpeg needs the whole input in one pass
 */
export function remuxStrategy(name: string): "window" | "file" {
  return ["mkv", "mka", "mks", "webm"].includes(extensionOf(name)) ? "window" : "file";
}

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `m${idCounter}`;
}

export function itemFromFile(file: File): MediaItem {
  const name = file.name;
  return {
    id: nextId(),
    name,
    kind: kindOf(name),
    extension: extensionOf(name),
    size: file.size,
    origin: "local",
    file,
    native: isNativeContainer(name),
    mime: file.type || mimeFor(name),
  };
}

export function itemFromUrl(url: string, name: string, size?: number): MediaItem {
  return {
    id: nextId(),
    name,
    kind: kindOf(name),
    extension: extensionOf(name),
    size,
    origin: "remote",
    url,
    native: isNativeContainer(name),
    mime: mimeFor(name),
  };
}

/** Ask the browser whether it can decode this container/codec pair at all. */
export function probeSupport(item: MediaItem): {
  playable: boolean;
  confidence: string;
  reason: string;
} {
  if (typeof document === "undefined") {
    return { playable: false, confidence: "", reason: "no document" };
  }
  const el = document.createElement(item.kind === "audio" ? "audio" : "video");
  const canPlay = el.canPlayType(item.mime);
  const mseOk =
    typeof window !== "undefined" && "MediaSource" in window
      ? MediaSource.isTypeSupported(item.mime)
      : false;

  // `maybe` is especially misleading for Matroska: Chromium reports it for
  // video/x-matroska and then fails in the demuxer before decoding one frame.
  // Only known native containers may take the direct media-element path.
  if (item.native && (canPlay === "probably" || canPlay === "maybe")) {
    return {
      playable: true,
      confidence: canPlay,
      reason: `canPlayType("${item.mime}") = ${canPlay}`,
    };
  }
  return {
    playable: false,
    confidence: canPlay || "no",
    reason: item.native
      ? `canPlayType("${item.mime}") returned empty; MediaSource.isTypeSupported = ${mseOk}. This container needs a remux pass.`
      : `canPlayType("${item.mime}") = ${canPlay || "no"}, but this is not a browser-native container. Using the remux pipeline instead of trusting the browser's optimistic result.`,
  };
}

/** Reads the first bytes and identifies the real container, whatever the extension claims. */
export async function sniffContainer(item: MediaItem): Promise<string> {
  try {
    let head: Uint8Array | null = null;
    if (item.file) {
      head = new Uint8Array(await item.file.slice(0, 16).arrayBuffer());
    } else if (item.url) {
      const res = await fetch(item.url, { headers: { Range: "bytes=0-15" } });
      head = new Uint8Array(await res.arrayBuffer());
    }
    if (!head || head.length < 8) return "unknown";
    const ascii = String.fromCharCode(...head);
    if (ascii.includes("ftyp")) return "ISO-BMFF (MP4/MOV)";
    if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
      return "Matroska/WebM (EBML)";
    }
    if (ascii.startsWith("RIFF")) return "RIFF (AVI/WAV)";
    if (ascii.startsWith("OggS")) return "Ogg";
    if (ascii.startsWith("fLaC")) return "FLAC";
    if (ascii.startsWith("ID3") || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0)) {
      return "MPEG audio";
    }
    if (head[0] === 0x47) return "MPEG-TS";
    return "unknown";
  } catch (err) {
    log.warn("probe", "Container sniff failed", err);
    return "unknown";
  }
}
