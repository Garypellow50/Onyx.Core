import { isNativeContainer, kindOf } from "./media";

/**
 * Lightweight poster frames for queued videos.
 *
 * A detached <video> element only pulls the byte ranges it needs to decode one
 * frame, so this stays cheap even for multi-gigabyte remote files. Non-native
 * containers (MKV/AVI/…) are skipped: they would need a full ffmpeg pass.
 */
const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

const MAX_PARALLEL = 2;
let active = 0;
const waiting: (() => void)[] = [];

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

export interface ThumbSource {
  key: string;
  name: string;
  url?: string | undefined;
  file?: File | undefined;
}

/** True when a poster frame can plausibly be decoded without transcoding. */
export function canThumbnail(source: ThumbSource): boolean {
  return (
    kindOf(source.name) === "video" && isNativeContainer(source.name) && Boolean(source.url ?? source.file)
  );
}

function grab(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    video.crossOrigin = "anonymous";
    video.playsInline = true;

    let settled = false;
    const done = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };

    const timer = setTimeout(() => done(null), 20000);

    video.addEventListener("error", () => done(null));
    video.addEventListener("loadedmetadata", () => {
      const target = Number.isFinite(video.duration) && video.duration > 4 ? video.duration * 0.12 : 0;
      try {
        video.currentTime = target;
      } catch {
        done(null);
      }
    });
    video.addEventListener("seeked", () => {
      try {
        const width = 224;
        const ratio = video.videoWidth && video.videoHeight ? video.videoHeight / video.videoWidth : 9 / 16;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = Math.max(1, Math.round(width * ratio));
        const ctx = canvas.getContext("2d");
        if (!ctx) return done(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        done(canvas.toDataURL("image/jpeg", 0.6));
      } catch {
        done(null);
      }
    });

    video.src = src;
  });
}

export function getThumbnail(source: ThumbSource): Promise<string | null> {
  const cached = cache.get(source.key);
  if (cached !== undefined) return Promise.resolve(cached);
  const running = inflight.get(source.key);
  if (running) return running;
  if (!canThumbnail(source)) {
    cache.set(source.key, null);
    return Promise.resolve(null);
  }

  const promise = slot(async () => {
    const objectUrl = source.file ? URL.createObjectURL(source.file) : null;
    try {
      return await grab(objectUrl ?? source.url!);
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  })
    .then((result) => {
      cache.set(source.key, result);
      inflight.delete(source.key);
      return result;
    })
    .catch(() => {
      cache.set(source.key, null);
      inflight.delete(source.key);
      return null;
    });

  inflight.set(source.key, promise);
  return promise;
}