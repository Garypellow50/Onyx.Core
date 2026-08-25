import { formatBytes } from "./format";
import { getFFmpeg, runExclusive } from "./ffmpeg-engine";
import { log } from "./log";

/**
 * Streaming remuxer for containers the browser refuses outright.
 *
 * Chrome/Edge/Firefox cannot demux Matroska at all (only WebM), so an .mkv
 * fails with DEMUXER_ERROR_COULD_NOT_OPEN even when its H.264 video and the
 * machine's decoders are perfectly fine. This pipeline fixes that without ever
 * downloading the whole file:
 *
 *   1. pull the EBML header once with a range request
 *   2. pull the body in bounded windows (range requests again)
 *   3. per window, run ffmpeg.wasm: video copied bit-for-bit, audio re-encoded
 *      to AAC (AC-3 / E-AC-3 / DTS have no browser decoder)
 *   4. append the resulting fragmented MP4 to a MediaSource buffer
 *
 * Memory stays flat regardless of file size — a 40 GB remux uses the same
 * working set as a 400 MB one — and the picture keeps its original bytes.
 */

const FIRST_WINDOW_BYTES = 5 * 1024 * 1024;
const MIN_WINDOW_BYTES = 4 * 1024 * 1024;
const WINDOW_BYTES = 16 * 1024 * 1024;
const MAX_WINDOW_BYTES = 24 * 1024 * 1024;
const HEADER_SCAN_BYTES = 4 * 1024 * 1024;
const KEEP_BEHIND = 20; // seconds kept behind it before eviction

const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];
const CLUSTER_ID = [0x1f, 0x43, 0xb6, 0x75];

export interface RemuxStatus {
  phase: "probe" | "stream" | "idle" | "done" | "error";
  message: string;
  ratio: number;
}

export interface RemuxHandle {
  url: string;
  duration: number;
  seek(seconds: number): void;
  destroy(): void;
}

interface ByteReader {
  size: number;
  read(start: number, end: number): Promise<Uint8Array>;
}

type NetworkPlan = { windowBytes: number; targetAhead: number; label: string };

/**
 * Uses actual range-request completion times instead of trusting the browser's
 * coarse connection hint. Throughput variation and failed reads both increase
 * the runway, giving a flapping mobile connection time to recover.
 */
class NetworkEstimator {
  private samples: number[] = [];
  private failures = 0;

  constructor(private readonly remote: boolean) {}

  record(bytes: number, elapsedMs: number) {
    if (!this.remote || elapsedMs < 1 || bytes < 1) return;
    this.samples = [...this.samples.slice(-7), (bytes * 1000) / elapsedMs];
    this.failures = Math.max(0, this.failures - 0.25);
  }

  failed() {
    if (this.remote) this.failures = Math.min(4, this.failures + 1);
  }

  plan(mediaBytesPerSecond: number): NetworkPlan {
    if (!this.remote) return { windowBytes: 16 * 1024 * 1024, targetAhead: 90, label: "local source" };
    const average = this.samples.length
      ? this.samples.reduce((sum, value) => sum + value, 0) / this.samples.length
      : 0;
    const deviation = this.samples.length > 1
      ? Math.sqrt(this.samples.reduce((sum, value) => sum + (value - average) ** 2, 0) / this.samples.length) /
        Math.max(average, 1)
      : 0;
    const instability = Math.min(1, deviation + this.failures * 0.25);
    const runwayRatio = mediaBytesPerSecond > 0 && average > 0 ? average / mediaBytesPerSecond : 2;
    let targetAhead = runwayRatio < 1.5 ? 150 : runwayRatio < 3 ? 105 : 60;
    targetAhead = Math.min(180, targetAhead + Math.round(instability * 55));
    let windowBytes = average < 1_500_000 ? MIN_WINDOW_BYTES : average < 5_000_000 ? 8 * 1024 * 1024 : 16 * 1024 * 1024;
    if (instability > 0.45) windowBytes = Math.max(MIN_WINDOW_BYTES, windowBytes / 2);
    windowBytes = Math.round(Math.min(MAX_WINDOW_BYTES, Math.max(MIN_WINDOW_BYTES, windowBytes)) / (1024 * 1024)) * 1024 * 1024;
    const mbps = average > 0 ? `${(average * 8 / 1_000_000).toFixed(1)} Mbps` : "measuring network";
    return { windowBytes, targetAhead, label: `${mbps}${instability > 0.35 ? " · unstable" : ""}` };
  }
}

function fileReader(file: File): ByteReader {
  return {
    size: file.size,
    async read(start, end) {
      return new Uint8Array(await file.slice(start, end).arrayBuffer());
    },
  };
}

function urlReader(url: string, size: number, network: NetworkEstimator): ByteReader {
  return {
    size,
    async read(start, end) {
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        const startedAt = performance.now();
        try {
          const res = await fetch(url, { headers: { Range: `bytes=${start}-${end - 1}` } });
          if (!res.ok) throw new Error(`Range request failed with HTTP ${res.status}`);
          const bytes = new Uint8Array(await res.arrayBuffer());
          // A host that ignores Range answers 200 with the whole file; trim it.
          const ranged = res.status === 200 && bytes.byteLength > end - start ? bytes.subarray(start, end) : bytes;
          network.record(ranged.byteLength, performance.now() - startedAt);
          return ranged;
        } catch (error) {
          lastError = error;
          network.failed();
        }
      }
      throw lastError instanceof Error ? lastError : new Error("Range request failed");
    },
  };
}

function indexOfBytes(haystack: Uint8Array, needle: number[], from = 0): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a, 0);
  out.set(b, a.byteLength);
  return out;
}

interface StreamProbe {
  duration: number;
  hasVideo: boolean;
  videoCodec: string;
  hasAudio: boolean;
  audioCodec: string;
}

const MKV_VIDEO_CODECS: Record<string, string> = {
  "V_MPEG4/ISO/AVC": "h264",
  "V_MPEGH/ISO/HVC": "hevc",
  V_VP9: "vp9",
  V_VP8: "vp8",
  V_AV1: "av1",
  "V_MPEG4/ISO/ASP": "mpeg4",
};
const MKV_AUDIO_CODECS: Record<string, string> = {
  A_AAC: "aac",
  A_OPUS: "opus",
  A_VORBIS: "vorbis",
  A_AC3: "ac3",
  A_EAC3: "eac3",
  A_DTS: "dts",
  A_FLAC: "flac",
  "A_MPEG/L3": "mp3",
};

/** Read a big-endian unsigned integer of `len` bytes. */
function beUint(bytes: Uint8Array, at: number, len: number): number {
  let v = 0;
  for (let i = 0; i < len; i++) v = v * 256 + (bytes[at + i] ?? 0);
  return v;
}

/** EBML element size: leading-ones vint. Returns [value, bytesRead]. */
function readVint(bytes: Uint8Array, at: number): [number, number] {
  const first = bytes[at] ?? 0;
  let len = 1;
  for (let mask = 0x80; mask > 0 && !(first & mask); mask >>= 1) len++;
  if (len > 8) return [0, 1];
  let value = first & (0xff >> len);
  for (let i = 1; i < len; i++) value = value * 256 + (bytes[at + i] ?? 0);
  return [value, len];
}

function findElement(bytes: Uint8Array, id: number[]): { at: number; len: number } | null {
  const at = indexOfBytes(bytes, id);
  if (at < 0) return null;
  const [size, read] = readVint(bytes, at + id.length);
  return { at: at + id.length + read, len: size };
}

/**
 * Parse codecs and duration straight out of the Matroska header instead of
 * shelling out to ffmpeg. Cheap, synchronous, and it cannot abort the wasm
 * core the way a probe run with no output file does.
 */
function parseMatroskaHeader(header: Uint8Array): StreamProbe {
  const probe: StreamProbe = {
    duration: 0,
    hasVideo: false,
    videoCodec: "",
    hasAudio: false,
    audioCodec: "",
  };

  let scale = 1_000_000; // ns per timecode unit (Matroska default)
  const ts = findElement(header, [0x2a, 0xd7, 0xb1]);
  if (ts && ts.len >= 1 && ts.len <= 8) scale = beUint(header, ts.at, ts.len) || scale;

  const dur = findElement(header, [0x44, 0x89]);
  if (dur && (dur.len === 4 || dur.len === 8)) {
    const view = new DataView(header.buffer, header.byteOffset + dur.at, dur.len);
    const raw = dur.len === 4 ? view.getFloat32(0) : view.getFloat64(0);
    if (Number.isFinite(raw) && raw > 0) probe.duration = (raw * scale) / 1_000_000_000;
  }

  // CodecID values are plain ASCII in the Tracks element.
  let text = "";
  for (let i = 0; i < header.length; i++) text += String.fromCharCode(header[i]!);
  for (const [id, name] of Object.entries(MKV_VIDEO_CODECS)) {
    if (!probe.hasVideo && text.includes(id)) {
      probe.hasVideo = true;
      probe.videoCodec = name;
    }
  }
  for (const [id, name] of Object.entries(MKV_AUDIO_CODECS)) {
    if (!probe.hasAudio && text.includes(id)) {
      probe.hasAudio = true;
      probe.audioCodec = name;
    }
  }
  return probe;
}

/** Codec strings MediaSource needs up front, keyed by what the file carries. */
const VIDEO_CODEC_TAGS: Record<string, string> = {
  h264: "avc1.640029",
  hevc: "hvc1.1.6.L120.90",
  h265: "hvc1.1.6.L120.90",
  vp9: "vp09.00.10.08",
  av1: "av01.0.05M.08",
};

export async function startRemuxStream(opts: {
  source: { name: string; size: number; file?: File | undefined; url?: string | undefined };
  /** Lazily resolved: the element only mounts once the object URL is attached. */
  video: () => HTMLVideoElement | null;
  attach: (url: string) => void;
  onStatus: (status: RemuxStatus) => void;
}): Promise<RemuxHandle> {
  const { source, attach, onStatus } = opts;
  const getVideo = opts.video;
  const network = new NetworkEstimator(!source.file);
  const reader = source.file ? fileReader(source.file) : urlReader(source.url!, source.size, network);
  if (!source.file && !source.url) throw new Error("No readable source for the remux stream");
  if (!("MediaSource" in window)) throw new Error("This browser has no MediaSource support");

  onStatus({ phase: "probe", message: "Reading the container header", ratio: 0 });
  log.info(
    "remux",
    `Opening ${source.name} for streaming remux`,
    `${formatBytes(reader.size)} · ${WINDOW_BYTES / 1024 / 1024} MB windows, nothing else is downloaded`,
  );

  const head = await reader.read(0, Math.min(reader.size, HEADER_SCAN_BYTES));
  if (indexOfBytes(head, EBML_MAGIC) !== 0) {
    throw new Error("This file is not Matroska/WebM, so it cannot be window-remuxed");
  }
  const clusterAt = indexOfBytes(head, CLUSTER_ID);
  if (clusterAt < 0) throw new Error("No Matroska cluster found in the first 4 MB");
  const header = head.slice(0, clusterAt);
  log.ok("remux", "Matroska header parsed", `${formatBytes(header.byteLength)} of setup data`);

  
  const probe = parseMatroskaHeader(header);

  if (!probe.hasVideo && !probe.hasAudio) {
    throw new Error("No video or audio track was declared in this file's header");
  }
  const duration = probe.duration;
  if (duration <= 0) log.warn("remux", "The header declares no duration; seeking will be approximate");
  log.ok(
    "remux",
    "Streams identified",
    `video ${probe.videoCodec || "none"} · audio ${probe.audioCodec || "none"} · ${duration.toFixed(1)}s`,
  );

  // ---- pick the output container this browser can actually take
  const hasVideo = probe.hasVideo;
  const hasAudio = probe.hasAudio;

  interface Target {
    label: string;
    ext: string;
    mime: string;
    videoArgs: string[];
    audioArgs: string[];
    audioCopied: boolean;
    formatArgs: string[];
    note: string;
  }

  function mp4Target(): Target | null {
    const copyTag = VIDEO_CODEC_TAGS[probe.videoCodec];
    const copy = Boolean(copyTag);
    const tag = copyTag ?? VIDEO_CODEC_TAGS["h264"]!;
    const audioCopy = probe.audioCodec === "aac";
    const mime = `video/mp4; codecs="${[hasVideo ? tag : "", hasAudio ? "mp4a.40.2" : ""]
      .filter(Boolean)
      .join(",")}"`;
    if (!MediaSource.isTypeSupported(mime)) return null;
    return {
      label: "fragmented MP4",
      ext: "mp4",
      mime,
      videoArgs: copy ? ["-c:v", "copy"] : ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "23"],
      audioArgs: audioCopy
        ? ["-c:a", "copy"]
        : ["-c:a", "aac", "-b:a", "160k", "-ac", "2", "-ar", "48000"],
      audioCopied: audioCopy,
      formatArgs: ["-movflags", "frag_keyframe+empty_moov+default_base_moof", "-f", "mp4"],
      note: `video ${copy ? "copied bit-for-bit" : "re-encoded H.264"} · audio ${audioCopy ? "copied" : "re-encoded AAC 192 kbps"}`,
    };
  }

  function webmTarget(): Target | null {
    // Chromium builds without proprietary codecs (and most Linux Firefox
    // builds) refuse AAC/H.264 entirely; WebM is always available there.
    const copy = probe.videoCodec === "vp9" || probe.videoCodec === "vp8";
    const tag = probe.videoCodec === "vp8" ? "vp8" : "vp9";
    const audioCopy = probe.audioCodec === "opus";
    const mime = `video/webm; codecs="${[hasVideo ? tag : "", hasAudio ? "opus" : ""]
      .filter(Boolean)
      .join(",")}"`;
    if (!MediaSource.isTypeSupported(mime)) return null;
    if (hasVideo && !copy) return null; // VP9 encoding in wasm is far too slow
    return {
      label: "WebM",
      ext: "webm",
      mime,
      videoArgs: ["-c:v", "copy"],
      audioArgs: audioCopy
        ? ["-c:a", "copy"]
        : ["-c:a", "libopus", "-b:a", "128k", "-ac", "2", "-ar", "48000"],
      audioCopied: audioCopy,
      formatArgs: ["-f", "webm"],
      note: `video copied bit-for-bit · audio ${audioCopy ? "copied" : "re-encoded Opus 160 kbps"}`,
    };
  }

  const chosen = mp4Target() ?? webmTarget();
  if (!chosen) {
    throw new Error(
      `This browser has no decoder for ${probe.videoCodec || "this video"}/${probe.audioCodec || "this audio"}, so no remux target is playable here`,
    );
  }
  const target: Target = chosen;
  const mime = target.mime;
  log.ok("remux", `Target: ${target.label} · ${mime}`, target.note);

  const windowArgs = (input: string, output: string) => {
    // Timestamp handling is what makes or breaks smoothness here:
    //  - genpts rebuilds a monotonic clock for cluster-sliced input
    //  - fps_mode passthrough stops ffmpeg from dropping/duplicating frames to
    //    hit a guessed constant frame rate (the source of the judder)
    //  - avoid_negative_ts/muxdelay keep each fragment starting cleanly at zero
    //    so MediaSource "sequence" mode chains windows without gaps
    const args = [
      "-hide_banner",
      "-nostats",
      "-loglevel",
      "error",
      "-threads",
      "1",
      "-fflags",
      "+genpts+discardcorrupt",
      "-i",
      input,
    ];
    if (hasVideo) args.push("-map", "0:v:0");
    if (hasAudio) args.push("-map", "0:a:0");
    args.push("-sn", "-dn");
    if (hasVideo) args.push(...target.videoArgs, "-fps_mode", "passthrough");
    if (hasAudio) {
      args.push(...target.audioArgs);
      // When audio is decoded for the remux, let ffmpeg gently compensate for
      // missing/duplicated timestamps before each fragment enters MediaSource.
      // This avoids a gradual A/V skew after a network stall without seeking.
      if (!target.audioCopied) args.push("-af", "aresample=async=1000:first_pts=0");
    }
    args.push(
      "-avoid_negative_ts",
      "make_zero",
      "-muxdelay",
      "0",
      "-muxpreload",
      "0",
      ...target.formatArgs,
      output,
    );
    return args;
  };

  const ff = await getFFmpeg();

  // ---- MediaSource plumbing
  const mediaSource = new MediaSource();
  const url = URL.createObjectURL(mediaSource);
  const opened = new Promise<void>((resolve) => {
    mediaSource.addEventListener("sourceopen", () => resolve(), { once: true });
  });
  attach(url);
  await opened;

  const sourceBuffer = mediaSource.addSourceBuffer(mime);
  sourceBuffer.mode = "sequence";
  if (duration > 0) {
    try {
      mediaSource.duration = duration;
    } catch {
      /* set later by the browser from the appended fragments */
    }
  }
  log.ok("remux", "MediaSource attached", "playback starts as soon as the first window lands");

  let destroyed = false;
  let generation = 0;
  let pendingSeek: number | null = null;

  const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

  async function whenIdle() {
    while (sourceBuffer.updating) await sleep(20);
  }

  function bufferedAhead(): number {
    const video = getVideo();
    if (!video) return 0;
    const b = video.buffered;
    for (let i = 0; i < b.length; i++) {
      if (video.currentTime >= b.start(i) - 0.5 && video.currentTime <= b.end(i)) {
        return b.end(i) - video.currentTime;
      }
    }
    return 0;
  }

  function clock(): number {
    return getVideo()?.currentTime ?? 0;
  }

  async function evict() {
    const b = sourceBuffer.buffered;
    if (b.length === 0) return;
    const cutoff = clock() - KEEP_BEHIND;
    if (cutoff <= b.start(0) + 1) return;
    await whenIdle();
    if (destroyed) return;
    sourceBuffer.remove(b.start(0), cutoff);
    await whenIdle();
    log.debug("remux", `Evicted buffer up to ${cutoff.toFixed(1)}s to keep memory flat`);
  }

  async function append(segment: Uint8Array) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await whenIdle();
      if (destroyed) return;
      try {
        sourceBuffer.appendBuffer(segment as unknown as BufferSource);
        await whenIdle();
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "QuotaExceededError") {
          log.debug("remux", "Buffer full — evicting older data and retrying");
          await evict();
          continue;
        }
        throw err;
      }
    }
    log.warn("remux", "Dropped one window: the media buffer stayed full");
  }

  async function remuxWindow(bytes: Uint8Array, index: number): Promise<Uint8Array | null> {
    const input = `w${index}.mkv`;
    const output = `w${index}.${target.ext}`;
    return runExclusive(async () => {
      await ff.writeFile(input, concat(header, bytes));
      try {
        const code = await ff.exec(windowArgs(input, output));
        if (code !== 0) {
          log.warn("remux", `Window ${index} produced no output (ffmpeg code ${code})`);
          return null;
        }
        const data = await ff.readFile(output);
        return typeof data === "string" ? new TextEncoder().encode(data) : data;
      } finally {
        await ff.deleteFile(input).catch(() => {});
        await ff.deleteFile(output).catch(() => {});
      }
    });
  }

  async function pump(startByte: number, startTime: number, myGeneration: number) {
    let offset = startByte;
    let index = 0;
    let windowSize = FIRST_WINDOW_BYTES;
    const mediaBytesPerSecond = duration > 0 ? reader.size / duration : 0;
    // Prefetched bytes for the next window, read while ffmpeg works on the
    // current one — network latency and wasm time no longer serialize.
    let prefetch: { start: number; end: number; bytes: Promise<Uint8Array> } | null = null;

    const readWindow = (from: number) => {
      const end = Math.min(reader.size, from + windowSize);
      if (prefetch && prefetch.start === from && prefetch.end === end) {
        const hit = prefetch.bytes;
        prefetch = null;
        return { end, bytes: hit };
      }
      prefetch = null;
      return { end, bytes: reader.read(from, end) };
    };

    if (startTime > 0) {
      try {
        sourceBuffer.timestampOffset = startTime;
      } catch {
        /* sequence mode will chain from the previous end instead */
      }
    }

    while (!destroyed && myGeneration === generation && offset < reader.size) {
      const networkPlan = network.plan(mediaBytesPerSecond);
      if (bufferedAhead() > networkPlan.targetAhead) {
        onStatus({
          phase: "idle",
          message: `Buffered ${bufferedAhead().toFixed(0)}s ahead — engine idle`,
          ratio: offset / reader.size,
        });
        await evict();
        await sleep(250);
        continue;
      }

      const pending = readWindow(offset);
      const end = pending.end;
      onStatus({
        phase: "stream",
        message: `Remuxing ${formatBytes(offset)} – ${formatBytes(end)} of ${formatBytes(reader.size)}`,
        ratio: offset / reader.size,
      });
      let raw = await pending.bytes;
      if (raw.byteLength === 0) raw = await reader.read(offset, end); // prefetch failed; read again
      if (destroyed || myGeneration !== generation) return;

      // Never hand ffmpeg a window beginning in the middle of a Matroska
      // cluster. Keep the final cluster for the next pass so the current input
      // ends at a clean boundary as well. Arbitrary byte cuts are what caused
      // `Invalid data found when processing input` after the first window.
      const firstCluster = indexOfBytes(raw, CLUSTER_ID);
      if (firstCluster < 0) {
        log.debug("remux", `No cluster boundary in window ${index + 1}; extending the scan`);
        offset = end;
        continue;
      }
      let lastCluster = firstCluster;
      for (;;) {
        const nextCluster = indexOfBytes(raw, CLUSTER_ID, lastCluster + CLUSTER_ID.length);
        if (nextCluster < 0) break;
        lastCluster = nextCluster;
      }
      const hasCompleteBoundary = lastCluster > firstCluster;
      const bytes = raw.subarray(firstCluster, hasCompleteBoundary ? lastCluster : raw.byteLength);
      const nextOffset = hasCompleteBoundary ? offset + lastCluster : end;

      // Kick off the next range request now, before the wasm pass blocks.
      // Adapt the next preloaded segment after every completed request. Slow
      // or unstable links use smaller ranges but retain a deeper decoded
      // runway; healthy links use larger segments to reduce remux overhead.
      windowSize = network.plan(mediaBytesPerSecond).windowBytes;
      if (nextOffset < reader.size) {
        const nextEnd = Math.min(reader.size, nextOffset + windowSize);
        prefetch = {
          start: nextOffset,
          end: nextEnd,
          bytes: reader.read(nextOffset, nextEnd).catch(() => new Uint8Array(0)),
        };
      }

      const segment = await remuxWindow(bytes, index++);
      if (destroyed || myGeneration !== generation) return;
      if (segment && segment.byteLength > 0) {
        await append(segment);
        log.debug(
          "remux",
          `Window ${index} appended`,
          `${formatBytes(segment.byteLength)} of fMP4 · ${bufferedAhead().toFixed(1)}s ahead`,
        );
      }
      if (pendingSeek !== null) {
        const target = pendingSeek;
        pendingSeek = null;
        const video = getVideo();
        if (video) video.currentTime = target;
      }
      offset = nextOffset;
    }

    if (!destroyed && myGeneration === generation) {
      onStatus({ phase: "done", message: "Whole file remuxed", ratio: 1 });
      log.ok("remux", "Reached the end of the source stream");
      await whenIdle();
      if (mediaSource.readyState === "open") mediaSource.endOfStream();
    }
  }

  void pump(clusterAt, 0, generation).catch((err) => {
    if (destroyed) return;
    log.error("remux", "Streaming remux stopped", err);
    onStatus({
      phase: "error",
      message: err instanceof Error ? err.message : String(err),
      ratio: 0,
    });
  });

  return {
    url,
    duration,
    seek(seconds: number) {
      if (destroyed || duration <= 0) return;
      const b = sourceBuffer.buffered;
      for (let i = 0; i < b.length; i++) {
        if (seconds >= b.start(i) && seconds <= b.end(i)) {
          const video = getVideo();
          if (video) video.currentTime = seconds;
          return;
        }
      }
      // Outside the window we hold: restart the pipeline at the matching byte.
      const byte = Math.max(clusterAt, Math.floor((seconds / duration) * reader.size));
      generation += 1;
      const myGeneration = generation;
      log.info(
        "remux",
        `Seeking to ${seconds.toFixed(1)}s`,
        `restarting the stream at byte ${formatBytes(byte)}`,
      );
      void (async () => {
        await whenIdle();
        if (destroyed) return;
        const range = sourceBuffer.buffered;
        if (range.length > 0) {
          sourceBuffer.remove(range.start(0), range.end(range.length - 1));
          await whenIdle();
        }
        pendingSeek = seconds;
        void pump(byte, seconds, myGeneration);
      })();
    },
    destroy() {
      destroyed = true;
      generation += 1;
      try {
        if (mediaSource.readyState === "open") mediaSource.endOfStream();
      } catch {
        /* already torn down */
      }
      URL.revokeObjectURL(url);
      log.info("remux", "Streaming remux torn down");
    },
  };
}
