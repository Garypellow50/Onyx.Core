import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ControlBar, type AudioTrackInfo, type FitMode } from "./ControlBar";
import { LogPanel } from "./LogPanel";
import { Playlist } from "./Playlist";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { StatsOverlay, type PlaybackStats } from "./StatsOverlay";
import { SourceIntake } from "./SourceIntake";
import { OverlayCard } from "./OverlayCard";
import { formatBytes, formatTime } from "@/lib/player/format";
import { cn } from "@/lib/utils";
import { clearLog, log } from "@/lib/player/log";
import {
  isMediaFileName,
  isSubtitleFileName,
  itemFromFile,
  probeSupport,
  remuxStrategy,
  sniffContainer,
  type MediaItem,
} from "@/lib/player/media";
import { probeRemoteUrl } from "@/lib/player/remote";
import { attachAudioSync } from "@/lib/player/audio-sync";
import {
  isFolderLink,
  itemFromChild,
  listFolderLink,
  type FolderChild,
  type FolderResult,
} from "@/lib/player/folder";
import { FolderPicker } from "./FolderPicker";
import { subtitleFileToTrack, type SubtitleTrack } from "@/lib/player/subtitles";
import { usePersisted, readPersisted, writePersisted } from "@/lib/player/ui-state";
import { relayUrl } from "@/lib/player/link";
import { useTouchGestures } from "./useTouchGestures";
import { Maximize, Minimize } from "lucide-react";

const SKIP_SECONDS = 10;
const RECOVERED_TRACK_ID = "__recovered_aac";
/** How long the floating transport stays up after the last interaction. */
const CONTROLS_HOLD_MS = 3400;
/** Once shown it never disappears before this — no flash-and-gone taps. */
const MIN_VISIBLE_MS = 2000;

export function MediaPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const recoveredAudioRef = useRef<HTMLAudioElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const remuxRef = useRef<import("@/lib/player/stream-remux").RemuxHandle | null>(null);

  const [items, setItems] = useState<MediaItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [intakeBusy, setIntakeBusy] = useState(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [folderListing, setFolderListing] = useState<FolderResult | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState<[number, number][]>([]);
  const [volume, setVolume] = usePersisted("volume", 1);
  const [muted, setMuted] = usePersisted("muted", false);
  const [rate, setRate] = useState(1);
  const [rotation, setRotation] = usePersisted("rotation", 0);
  const [fit, setFit] = usePersisted<FitMode>("fit", "contain");
  const [rotationScale, setRotationScale] = useState(1);

  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState(-1);
  const [cueText, setCueText] = useState("");
  const [subtitleSize, setSubtitleSize] = usePersisted("subtitleSize", 28);
  const [subtitleOffset, setSubtitleOffset] = usePersisted("subtitleOffset", 16);
  const [audioTracks, setAudioTracks] = useState<AudioTrackInfo[]>([]);
  const [audioIssue, setAudioIssue] = useState<string | null>(null);
  const [recoveredAudio, setRecoveredAudio] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<{
    busy: boolean;
    ratio: number;
    message: string;
    startedAt: number;
    eta: number | null;
  } | null>(null);
  const [audioSource, setAudioSource] = useState<"original" | "recovered">("original");
  const [preferredAudio, setPreferredAudio] = usePersisted<string | null>("audioTrack", null);
  const [remux, setRemux] = useState<import("@/lib/player/stream-remux").RemuxStatus | null>(null);
  const usingRecoveredRef = useRef(false);
  const autoRecoveredRef = useRef<string | null>(null);
  const [recoveryElapsed, setRecoveryElapsed] = useState(0);

  // Tick a wall clock while the pass runs so elapsed/ETA stay live.
  useEffect(() => {
    if (!recovery?.busy) return;
    const startedAt = recovery.startedAt;
    const id = window.setInterval(
      () => setRecoveryElapsed((performance.now() - startedAt) / 1000),
      500,
    );
    return () => window.clearInterval(id);
  }, [recovery?.busy, recovery?.startedAt]);

  const etaLabel = useMemo(() => {
    const eta = recovery?.eta;
    if (eta === null || eta === undefined || !Number.isFinite(eta)) return null;
    return `~${formatTime(Math.max(1, Math.round(eta)))}`;
  }, [recovery?.eta]);

  useEffect(() => {
    usingRecoveredRef.current = audioSource === "recovered" && Boolean(recoveredAudio);
  }, [audioSource, recoveredAudio]);

  const [statsVisible, setStatsVisible] = usePersisted("statsVisible", false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [container, setContainer] = useState("—");
  const [stats, setStats] = useState<PlaybackStats>({
    resolution: "—",
    fps: 0,
    droppedFrames: 0,
    totalFrames: 0,
    bufferedAhead: 0,
    bufferedRanges: 0,
    bitrate: 0,
    container: "—",
    cores: 1,
  });

  const current = useMemo(() => items.find((i) => i.id === currentId) ?? null, [items, currentId]);
  const currentIndex = useMemo(
    () => items.findIndex((i) => i.id === currentId),
    [items, currentId],
  );

  // The picker lists the container's own tracks plus the ffmpeg-recovered one.
  const audioOptions = useMemo<AudioTrackInfo[]>(() => {
    const original: AudioTrackInfo[] = audioTracks.map((t) => ({
      ...t,
      enabled: audioSource === "original" && t.enabled,
      detail: "from the file, decoded by the browser",
    }));
    if (original.length === 0 && recoveredAudio) {
      original.push({
        id: "__original",
        label: "Original track",
        language: "",
        enabled: audioSource === "original",
        detail: "from the file, may be silent on this browser",
      });
    }
    if (!recoveredAudio) return original;
    return [
      ...original,
      {
        id: RECOVERED_TRACK_ID,
        label: "Recovered track",
        language: "",
        enabled: audioSource === "recovered",
        detail: "transcoded locally for this browser",
      },
    ];
  }, [audioTracks, audioSource, recoveredAudio]);

  /* ---------------------------------------------------------------- intake */

  const addFiles = useCallback(async (files: File[]) => {
    setIntakeError(null);
    log.info("intake", `Received ${files.length} file(s) from the picker/drop`);

    const mediaFiles = files.filter((f) => isMediaFileName(f.name));
    const subFiles = files.filter((f) => isSubtitleFileName(f.name));
    const skipped = files.length - mediaFiles.length - subFiles.length;

    if (skipped > 0) {
      log.debug("intake", `Ignored ${skipped} non-media file(s)`);
    }

    for (const file of subFiles) {
      try {
        const track = await subtitleFileToTrack(file);
        setSubtitles((prev) => [...prev, track]);
        log.ok("subtitles", `Converted ${file.name} to WebVTT`, `${track.cues} cues`);
      } catch (err) {
        log.error("subtitles", `Could not parse ${file.name}`, err);
      }
    }

    if (mediaFiles.length === 0) {
      if (subFiles.length === 0) {
        setIntakeError("No playable media found in that selection.");
        log.warn("intake", "Nothing playable in the selection");
      }
      return;
    }

    const newItems = mediaFiles.map(itemFromFile);
    for (const item of newItems) {
      log.ok(
        "intake",
        `Queued ${item.name}`,
        `${formatBytes(item.size)} · ${item.mime} · ${item.native ? "native container" : "needs remux"}`,
      );
    }
    setItems((prev) => [...prev, ...newItems]);
    setCurrentId((prev) => prev ?? newItems[0]?.id ?? null);
  }, []);

  const addUrl = useCallback(async (url: string) => {
    setIntakeBusy(true);
    setIntakeError(null);

    if (isFolderLink(url)) {
      const listing = await listFolderLink(url);
      setIntakeBusy(false);
      if (!listing.ok || !listing.entries) {
        setIntakeError(listing.error ?? "That folder could not be read.");
        return;
      }
      // Let the user decide what to queue instead of guessing for them.
      setFolderListing(listing);
      return;
    }

    const probe = await probeRemoteUrl(url);

    if (!probe.ok || !probe.item) {
      // A Drive /file/d/<id> link is often actually a folder id — retry as a folder.
      if (/(^|\.)google\.com/i.test(url) && /\/file\/d\//.test(url)) {
        const listing = await listFolderLink(url);
        if (listing.ok && listing.entries?.length) {
          setIntakeBusy(false);
          setFolderListing(listing);
          return;
        }
      }
      setIntakeBusy(false);
      setIntakeError(probe.error ?? "That link could not be read.");
      return;
    }
    setIntakeBusy(false);

    log.ok(
      "intake",
      `Remote source accepted: ${probe.item.name}`,
      `${formatBytes(probe.size)} · range requests ${probe.acceptsRanges ? "supported" : "unavailable"}`,
    );
    const item = probe.item;
    setItems((prev) => [...prev, item]);
    setCurrentId((prev) => prev ?? item.id);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setCurrentId((prev) => (prev === id ? null : prev));
    log.info("queue", `Removed item ${id}`);
  }, []);

  const addFolderChildren = useCallback(
    (children: FolderChild[]) => {
      const queuedUrls = new Set(items.map((item) => item.url).filter(Boolean));
      const newItems = children
        .filter(
          (child) =>
            !queuedUrls.has(child.needsRelay ? relayUrl(child.url, child.name) : child.url),
        )
        .map(itemFromChild);
      if (newItems.length === 0) {
        setIntakeError("All supported files from that shared folder are already in the queue.");
        setFolderListing(null);
        return;
      }
      for (const item of newItems) {
        log.ok(
          "intake",
          `Queued ${item.name}`,
          `${formatBytes(item.size)} · ${item.mime} · ${item.native ? "native container" : "needs remux"}`,
        );
      }
      setItems((prev) => [...prev, ...newItems]);
      setCurrentId((prev) => prev ?? newItems[0]?.id ?? null);
      setFolderListing(null);
    },
    [items],
  );

  /* ------------------------------------------------------------ source src */

  useEffect(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    remuxRef.current?.destroy();
    remuxRef.current = null;
    setRemux(null);
    if (!current) {
      setSrc(null);
      return;
    }

    const support = probeSupport(current);
    if (support.playable) {
      log.ok("probe", `Browser can decode this file`, support.reason);
    } else {
      log.warn("probe", `Browser cannot decode this container directly`, support.reason);
    }

    if (!support.playable) {
      // Matroska and friends never open in a browser demuxer. Stream them
      // through the windowed remuxer instead of handing the element bytes it
      // will refuse.
      let cancelled = false;
      setRemux({ phase: "probe", message: "Preparing the streaming remux", ratio: 0 });
      void (async () => {
        try {
          const strategy = remuxStrategy(current.name);
          const start =
            strategy === "window"
              ? (await import("@/lib/player/stream-remux")).startRemuxStream
              : (await import("@/lib/player/file-remux")).startFileRemux;
          if (cancelled) return;
          log.info(
            "remux",
            strategy === "window"
              ? "Using the windowed streaming remuxer"
              : `Using the whole-file remuxer for .${current.extension} (its index is not window-safe)`,
          );
          const handle = await start({
            source: {
              name: current.name,
              size: current.size ?? 0,
              file: current.file,
              url: current.url,
            },
            video: () => videoRef.current,
            attach: (url) => setSrc(url),
            onStatus: (status) => {
              if (!cancelled) setRemux(status);
            },
          });
          if (cancelled) {
            handle.destroy();
            return;
          }
          remuxRef.current = handle;
        } catch (err) {
          log.error("remux", "Could not start the streaming remux", err);
          setRemux({
            phase: "error",
            message: err instanceof Error ? err.message : String(err),
            ratio: 0,
          });
        }
      })();
      void sniffContainer(current).then((detected) => {
        setContainer(detected);
        log.debug("probe", `Header sniff says: ${detected}`);
      });
      return () => {
        cancelled = true;
        remuxRef.current?.destroy();
        remuxRef.current = null;
      };
    }

    if (current.file) {
      const url = URL.createObjectURL(current.file);
      objectUrlRef.current = url;
      setSrc(url);
      log.info("source", `Reading ${current.name} in place from disk (zero copy)`);
    } else if (current.url) {
      setSrc(current.url);
      log.info("source", `Streaming ${current.name} over HTTP range requests`);
    }

    void sniffContainer(current).then((detected) => {
      setContainer(detected);
      log.debug("probe", `Header sniff says: ${detected}`);
    });

    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [current]);

  /* ------------------------------------------------------ media event wiring */

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const resumeKey = current ? `mp:resume:${current.name}:${current.size ?? 0}` : null;

    function readBuffered() {
      const ranges: [number, number][] = [];
      for (let i = 0; i < video!.buffered.length; i++) {
        ranges.push([video!.buffered.start(i), video!.buffered.end(i)]);
      }
      setBuffered(ranges);
    }

    const onLoadedMetadata = () => {
      setDuration(video.duration);
      // Restore the levels the user last chose (survives rotation/reload).
      video.volume = usingRecoveredRef.current ? 0 : readPersisted("volume", 1);
      video.muted = readPersisted("muted", false);
      log.ok(
        "playback",
        `Metadata ready`,
        `${video.videoWidth || "?"}x${video.videoHeight || "?"} · ${video.duration.toFixed(1)}s`,
      );
      readAudioTracks(video);
      if (resumeKey) {
        const saved = Number(localStorage.getItem(resumeKey) ?? "0");
        if (saved > 5 && saved < video.duration - 10) {
          video.currentTime = saved;
          log.info("playback", `Resumed at ${saved.toFixed(0)}s from your last session`);
        }
      }
    };
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onPlay = () => {
      setPlaying(true);
      log.debug("playback", "play");
    };
    const onPause = () => {
      setPlaying(false);
      log.debug("playback", "pause");
      if (resumeKey) localStorage.setItem(resumeKey, String(video.currentTime));
    };
    const onWaiting = () => log.warn("playback", "Buffer starved — waiting for more data");
    const onSeeking = () => log.debug("playback", `Seeking to ${video.currentTime.toFixed(2)}s`);
    const onRateChange = () => setRate(video.playbackRate);
    const onVolumeChange = () => {
      // While the recovered sink is live the video element is held at zero, so
      // its volume is not the level the user sees.
      if (!usingRecoveredRef.current) setVolume(video.volume);
      setMuted(video.muted);
    };
    const onError = () => {
      const err = video.error;
      const raw = err?.message ?? "";
      if (err?.code === 4 && /DEMUXER_ERROR_COULD_NOT_OPEN/i.test(raw)) {
        const explain =
          "This browser could not open the file's streams. Usually the container or one of its codecs (AC-3/E-AC-3/DTS audio, HEVC video) has no decoder here — a remux/transcode pass is needed.";
        setAudioIssue(explain);
        log.error("playback", "Demuxer could not open this file", `${raw} — ${explain}`);
        return;
      }
      log.error(
        "playback",
        "The media element reported an error",
        err ? `code ${err.code}: ${raw || "no message"}` : "unknown",
      );
    };
    const onEnded = () => {
      log.info("playback", "Reached the end of the file");
      if (resumeKey) localStorage.removeItem(resumeKey);
      playNext();
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("progress", readBuffered);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("ratechange", onRateChange);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("error", onError);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("progress", readBuffered);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("ratechange", onRateChange);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("error", onError);
      video.removeEventListener("ended", onEnded);
      if (resumeKey && video.currentTime > 5) {
        localStorage.setItem(resumeKey, String(video.currentTime));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, current]);

  /* --------------------------------------------- position persistence */

  // Rotating a phone, resizing the window or backgrounding the tab must never
  // lose the playhead, so checkpoint it on a timer and on every lifecycle
  // event that could precede a re-layout or unload.
  useEffect(() => {
    if (!current) return;
    const key = `mp:resume:${current.name}:${current.size ?? 0}`;
    const save = () => {
      const video = videoRef.current;
      if (!video || !Number.isFinite(video.currentTime) || video.currentTime < 3) return;
      localStorage.setItem(key, String(video.currentTime));
    };
    const id = window.setInterval(save, 5000);
    window.addEventListener("pagehide", save);
    window.addEventListener("orientationchange", save);
    window.addEventListener("resize", save);
    document.addEventListener("visibilitychange", save);
    return () => {
      save();
      window.clearInterval(id);
      window.removeEventListener("pagehide", save);
      window.removeEventListener("orientationchange", save);
      window.removeEventListener("resize", save);
      document.removeEventListener("visibilitychange", save);
    };
  }, [current]);

  function readAudioTracks(video: HTMLVideoElement) {
    const list = (video as unknown as { audioTracks?: unknown }).audioTracks as
      | (ArrayLike<{ id: string; label: string; language: string; enabled: boolean }> & {
          length: number;
        })
      | undefined;
    if (!list || list.length === 0) {
      setAudioTracks([]);
      log.debug("audio", "This browser exposes no separate audio tracks for this file");
      return;
    }
    const tracks: AudioTrackInfo[] = [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i]!;
      tracks.push({
        id: t.id || String(i),
        label: t.label || `Track ${i + 1}`,
        language: t.language,
        enabled: t.enabled,
      });
    }
    setAudioTracks(tracks);
    log.ok("audio", `Found ${tracks.length} audio track(s)`, tracks.map((t) => t.label).join(", "));
  }

  /* --------------------------------------------------- silent-audio diagnosis */

  // Chrome/Edge desktop ship no AC-3, E-AC-3, DTS or TrueHD decoder, and Firefox
  // drops most of them too. Such a file still demuxes and shows perfect video —
  // the audio track is simply never decoded, so playback is silent. Detect that
  // by watching the decoded-audio byte counter while the picture is running.
  useEffect(() => {
    if (!src) return;
    setAudioIssue(null);
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled || video.paused) return;
      // A remuxed stream already carries a browser-decodable AAC track.
      if (remuxRef.current) return;
      const decoded = (video as unknown as { webkitAudioDecodedByteCount?: number })
        .webkitAudioDecodedByteCount;
      const hasAudio = (video as unknown as { mozHasAudio?: boolean }).mozHasAudio;
      const silent = decoded === 0 || hasAudio === false;
      if (!silent) {
        log.ok(
          "audio",
          "Audio is decoding",
          decoded === undefined ? "decoder byte counter not exposed" : `${decoded} bytes decoded`,
        );
        return;
      }
      const message =
        "Video is decoding but no audio bytes are. This container almost certainly carries AC-3 / E-AC-3 / DTS / TrueHD audio, which this browser has no decoder for.";
      setAudioIssue(message);
      log.error("audio", "No audio is being decoded for this file", message);
      // Recover automatically: the user asked for sound, not for a button.
      if (autoRecoveredRef.current !== src) {
        autoRecoveredRef.current = src;
        log.info(
          "audio",
          "Starting the audio recovery pass automatically",
          "Extracting the audio stream and re-encoding it to AAC locally; video keeps its original bytes.",
        );
        void recoverAudio();
      }
    }, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // recoverAudio is declared below and stable per source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  /* -------------------------------------------------------------- subtitles */

  /* ------------------------------------------------------- audio recovery */

  // Drop any recovered track when the source changes.
  useEffect(() => {
    setRecovery(null);
    setAudioSource("original");
    setRecoveredAudio((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [src]);

  const recoverAudio = useCallback(async () => {
    if (!current) return;
    const startedAt = performance.now();
    setRecovery({ busy: true, ratio: 0, message: "Starting the audio pass", startedAt, eta: null });
    try {
      const { extractPlayableAudio } = await import("@/lib/player/audio-transcode");
      const url = await extractPlayableAudio(
        { name: current.name, file: current.file, url: current.url },
        {},
        (p) => {
          // Linear extrapolation from work done so far — good enough for an ETA
          // and it settles quickly once the encode leg starts.
          const elapsed = (performance.now() - startedAt) / 1000;
          const eta = p.ratio > 0.02 ? (elapsed / p.ratio) * (1 - p.ratio) : null;
          setRecovery({ busy: true, ratio: p.ratio, message: p.message, startedAt, eta });
        },
      );
      setRecoveredAudio(url);
      setAudioSource("recovered");
      setRecovery({
        busy: false,
        ratio: 1,
        message: "Audio recovered and synced to the picture",
        startedAt,
        eta: 0,
      });
      setAudioIssue(null);
    } catch (err) {
      log.error("transcode", "Audio recovery failed", err);
      setRecovery({
        busy: false,
        ratio: 0,
        message: `Audio recovery failed: ${err instanceof Error ? err.message : String(err)}`,
        startedAt,
        eta: null,
      });
    }
  }, [current]);

  // Keep the recovered AAC/Opus element locked to the video clock. The whole
  // controller lives in audio-sync.ts: it measures how fast the picture clock
  // actually advances instead of trusting buffering events, parks the follower
  // while the picture is frozen, and pulls residual error out with a
  // pitch-preserved rate trim. See that file for the reasoning.
  useEffect(() => {
    const video = videoRef.current;
    const audio = recoveredAudioRef.current;
    if (!video || !audio || !recoveredAudio || audioSource !== "recovered") return;

    let detach: (() => void) | null = null;
    let cancelled = false;
    // The <audio> node is mounted in the same commit that produced the blob
    // URL, so wait for it to have metadata before the first alignment.
    const start = () => {
      if (cancelled || detach) return;
      detach = attachAudioSync(video, audio, {
        restoreVolume: volume,
        fallbackVolume: volume,
      });
    };
    if (audio.readyState >= 1) start();
    else audio.addEventListener("loadedmetadata", start, { once: true });

    return () => {
      cancelled = true;
      audio.removeEventListener("loadedmetadata", start);
      detach?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recoveredAudio, audioSource]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = video.textTracks;
    const handlers: { track: TextTrack; handler: () => void }[] = [];

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]!;
      if (i === activeSubtitle) {
        track.mode = "hidden";
        const handler = () => {
          const cues = Array.from(track.activeCues ?? []);
          const text = cues
            .map((c) => (c as VTTCue).text)
            .join("\n")
            .replace(/<[^>]+>/g, "");
          setCueText(text);
        };
        track.addEventListener("cuechange", handler);
        handlers.push({ track, handler });
      } else {
        track.mode = "disabled";
      }
    }
    if (activeSubtitle === -1) setCueText("");

    return () => {
      for (const { track, handler } of handlers) {
        track.removeEventListener("cuechange", handler);
      }
    };
  }, [activeSubtitle, subtitles, src]);

  /* ------------------------------------------------------------ stats timer */

  useEffect(() => {
    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      const quality = video.getVideoPlaybackQuality?.();
      const bufferedEnd =
        video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0;
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
        ?.usedJSHeapSize;
      const bitrate = current?.size && video.duration > 0 ? (current.size * 8) / video.duration : 0;
      setStats({
        resolution:
          video.videoWidth > 0 ? `${video.videoWidth}x${video.videoHeight}` : "audio only",
        fps: quality ? quality.totalVideoFrames / Math.max(video.currentTime, 0.001) : 0,
        droppedFrames: quality?.droppedVideoFrames ?? 0,
        totalFrames: quality?.totalVideoFrames ?? 0,
        bufferedAhead: Math.max(0, bufferedEnd - video.currentTime),
        bufferedRanges: video.buffered.length,
        bitrate,
        memory,
        container,
        cores: navigator.hardwareConcurrency || 1,
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [container, current]);

  /* --------------------------------------------------------- rotation fit */

  useEffect(() => {
    function recompute() {
      const video = videoRef.current;
      const stage = stageRef.current;
      if (!video || !stage || video.videoWidth === 0) {
        setRotationScale(1);
        return;
      }
      if (rotation % 180 === 0) {
        setRotationScale(1);
        return;
      }
      const cw = stage.clientWidth;
      const ch = stage.clientHeight;
      const aspect = video.videoWidth / video.videoHeight;
      const boxW = cw / ch > aspect ? ch * aspect : cw;
      const boxH = cw / ch > aspect ? ch : cw / aspect;
      setRotationScale(Math.min(cw / boxH, ch / boxW));
    }
    recompute();
    window.addEventListener("resize", recompute);
    const video = videoRef.current;
    video?.addEventListener("loadedmetadata", recompute);
    return () => {
      window.removeEventListener("resize", recompute);
      video?.removeEventListener("loadedmetadata", recompute);
    };
  }, [rotation, src, fit]);

  /* ----------------------------------------------------------- transport */

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused)
      void video.play().catch((err) => log.error("playback", "play() rejected", err));
    else video.pause();
  }, []);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(time)) return;
    const handle = remuxRef.current;
    if (handle) {
      // The remuxer owns the byte cursor, so it decides whether this is a
      // buffered jump or a restart at a new offset.
      handle.seek(Math.max(0, Math.min(time, handle.duration || time)));
      return;
    }
    video.currentTime = Math.min(Math.max(0, time), video.duration || time);
  }, []);

  const skip = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      seek(video.currentTime + delta);
      log.debug("playback", `Skip ${delta > 0 ? "+" : ""}${delta}s`);
    },
    [seek],
  );

  const setVideoVolume = useCallback((value: number) => {
    const video = videoRef.current;
    if (!video) return;
    const level = Math.min(1, Math.max(0, value));
    const sink = recoveredAudioRef.current;
    if (sink) {
      sink.muted = level === 0;
      sink.volume = level;
    }
    video.muted = level === 0;
    // With the recovered sink live the picture element stays silent.
    video.volume = usingRecoveredRef.current ? 0 : level;
    setVolume(level);
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const next = !video.muted;
    video.muted = next;
    const sink = recoveredAudioRef.current;
    if (sink) sink.muted = next;
  }, []);

  const applyRate = useCallback((value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = value;
    log.info("playback", `Speed set to ${value}x`);
  }, []);

  const rotate = useCallback(() => {
    setRotation((prev) => {
      const next = (prev + 90) % 360;
      log.info("view", `Rotated to ${next}°`);
      return next;
    });
  }, []);

  const toggleFullscreen = useCallback(() => {
    // Fullscreen the whole shell so the transport can overlay the picture.
    const shell = shellRef.current;
    if (!shell) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void shell.requestFullscreen().then(() => {
      const orientation = (
        screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } }
      ).orientation;
      orientation?.lock?.("landscape").catch(() => {
        log.debug("view", "Orientation lock is not available on this device");
      });
    });
  }, []);

  /* ------------------------------------------- fullscreen + idle controls */

  useEffect(() => {
    function onChange() {
      const active = document.fullscreenElement === shellRef.current;
      setIsFullscreen(active);
      setControlsVisible(true);
      log.info("view", active ? "Entered fullscreen" : "Left fullscreen");
    }
    function onViewportChange() {
      // Android can recreate the fullscreen surface during rotation without a
      // reliable layout event. Re-read the browser state and reveal the
      // transport so its progress bar and status overlays stay usable.
      setIsFullscreen(document.fullscreenElement === shellRef.current);
      setControlsVisible(true);
    }
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("orientationchange", onViewportChange);
    window.addEventListener("resize", onViewportChange);
    document.addEventListener("visibilitychange", onViewportChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("orientationchange", onViewportChange);
      window.removeEventListener("resize", onViewportChange);
      document.removeEventListener("visibilitychange", onViewportChange);
    };
  }, []);

  // In fullscreen the transport floats over the picture and fades out while
  // playback is running and the pointer sits still, like a desktop player.
  // Once shown it always stays up for at least MIN_VISIBLE_MS so a tap can
  // never make it flash past the eye.
  const hideTimer = useRef(0);
  const shownAt = useRef(0);
  const playingRef = useRef(playing);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const revealControls = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    shownAt.current = performance.now();
    setControlsVisible(true);
    if (playingRef.current) {
      hideTimer.current = window.setTimeout(() => setControlsVisible(false), CONTROLS_HOLD_MS);
    }
  }, []);

  /** Tap-to-hide, but only once the bar has had its minimum time on screen. */
  const dismissControls = useCallback(() => {
    if (performance.now() - shownAt.current < MIN_VISIBLE_MS) {
      revealControls();
      return;
    }
    window.clearTimeout(hideTimer.current);
    setControlsVisible(false);
  }, [revealControls]);

  useEffect(() => {
    if (!isFullscreen) {
      window.clearTimeout(hideTimer.current);
      setControlsVisible(true);
      return;
    }
    revealControls();
    const shell = shellRef.current;
    shell?.addEventListener("pointermove", revealControls);
    window.addEventListener("keydown", revealControls);
    return () => {
      window.clearTimeout(hideTimer.current);
      shell?.removeEventListener("pointermove", revealControls);
      window.removeEventListener("keydown", revealControls);
    };
  }, [isFullscreen, playing, revealControls]);

  const togglePip = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture();
    } else {
      void video
        .requestPictureInPicture()
        .catch((err) => log.warn("view", "Picture-in-picture unavailable", err));
    }
  }, []);

  const playNext = useCallback(() => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === currentId);
      const next = prev[idx + 1];
      if (next) {
        setCurrentId(next.id);
        log.info("queue", `Advancing to ${next.name}`);
      }
      return prev;
    });
  }, [currentId]);

  const playPrev = useCallback(() => {
    const prevItem = items[currentIndex - 1];
    if (prevItem) setCurrentId(prevItem.id);
  }, [items, currentIndex]);

  const cycleSubtitle = useCallback(() => {
    setActiveSubtitle((prev) =>
      subtitles.length === 0 ? -1 : prev + 1 >= subtitles.length ? -1 : prev + 1,
    );
  }, [subtitles.length]);

  const cycleAudioTrack = useCallback(() => {
    if (audioOptions.length < 2) {
      log.warn("audio", "No alternate audio track available to switch to");
      return;
    }
    const activeIdx = audioOptions.findIndex((t) => t.enabled);
    const next = audioOptions[(activeIdx + 1) % audioOptions.length];
    if (next) selectAudioTrack(next.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioOptions]);

  const selectAudioTrack = useCallback(
    (id: string) => {
      const video = videoRef.current;
      if (!video) return;
      setPreferredAudio(id);

      if (id === RECOVERED_TRACK_ID) {
        if (!recoveredAudio) return;
        setAudioSource("recovered");
        log.ok("audio", "Switched to the recovered AAC track");
        return;
      }

      if (audioSource === "recovered") {
        setAudioSource("original");
        video.volume = muted ? video.volume : volume;
        log.info("audio", "Switched back to the file's own audio track");
      }

      const list = (
        video as unknown as { audioTracks?: ArrayLike<{ id: string; enabled: boolean }> }
      ).audioTracks;
      if (list) {
        for (let i = 0; i < list.length; i++) {
          const track = list[i]!;
          track.enabled = (track.id || String(i)) === id;
        }
      }
      setAudioTracks((prev) => prev.map((t) => ({ ...t, enabled: t.id === id })));
      log.ok("audio", `Switched audio track to ${id}`);
    },
    [audioSource, muted, recoveredAudio, volume, setPreferredAudio],
  );

  // Re-apply the remembered track once the same options exist again (after a
  // rotation-triggered remount, a reload, or when recovery finishes).
  const appliedPreferenceRef = useRef<string | null>(null);
  useEffect(() => {
    if (!preferredAudio || !src) return;
    const signature = `${src}:${preferredAudio}:${audioOptions.length}`;
    if (appliedPreferenceRef.current === signature) return;
    const match = audioOptions.find((t) => t.id === preferredAudio);
    if (!match || match.enabled) return;
    appliedPreferenceRef.current = signature;
    selectAudioTrack(preferredAudio);
  }, [preferredAudio, audioOptions, src, selectAudioTrack]);

  const addSubtitleFile = useCallback(async (file: File) => {
    try {
      const track = await subtitleFileToTrack(file);
      setSubtitles((prev) => {
        setActiveSubtitle(prev.length);
        return [...prev, track];
      });
      log.ok("subtitles", `Loaded ${file.name}`, `${track.cues} cues`);
    } catch (err) {
      log.error("subtitles", `Could not parse ${file.name}`, err);
    }
  }, []);

  /* ------------------------------------------------------------- shortcuts */

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const video = videoRef.current;
      const key = event.key;

      if (key === "?") {
        setShortcutsOpen(true);
        event.preventDefault();
        return;
      }
      if (/^[0-9]$/.test(key) && video && video.duration) {
        seek((Number(key) / 10) * video.duration);
        event.preventDefault();
        return;
      }

      switch (key.toLowerCase()) {
        case " ":
        case "k":
          togglePlay();
          break;
        case "j":
          skip(-SKIP_SECONDS);
          break;
        case "l":
          skip(SKIP_SECONDS);
          break;
        case "arrowleft":
          skip(event.shiftKey ? -1 / 24 : -5);
          break;
        case "arrowright":
          skip(event.shiftKey ? 1 / 24 : 5);
          break;
        case "arrowup":
          setVideoVolume(Math.min(1, (video?.volume ?? 1) + 0.05));
          break;
        case "arrowdown":
          setVideoVolume(Math.max(0, (video?.volume ?? 1) - 0.05));
          break;
        case "f":
          toggleFullscreen();
          break;
        case "m":
          toggleMute();
          break;
        case "c":
          cycleSubtitle();
          break;
        case "a":
          cycleAudioTrack();
          break;
        case "r":
          rotate();
          break;
        case "p":
          togglePip();
          break;
        case "s":
          setStatsVisible((v) => !v);
          break;
        case "n":
          playNext();
          break;
        case "b":
          playPrev();
          break;
        case ",":
        case "<":
          applyRate(Math.max(0.25, (video?.playbackRate ?? 1) - 0.25));
          break;
        case ".":
        case ">":
          applyRate(Math.min(4, (video?.playbackRate ?? 1) + 0.25));
          break;
        default:
          return;
      }
      event.preventDefault();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    applyRate,
    cycleAudioTrack,
    cycleSubtitle,
    playNext,
    playPrev,
    rotate,
    seek,
    setVideoVolume,
    skip,
    togglePip,
    toggleFullscreen,
    toggleMute,
    togglePlay,
  ]);

  useEffect(() => {
    log.ok(
      "system",
      `Player ready · ${navigator.hardwareConcurrency || 1} logical cores available`,
      navigator.userAgent,
    );
    return () => clearLog();
  }, []);

  /* ------------------------------------------------------------------ view */

  const gestures = useTouchGestures({
    duration,
    currentTime,
    volume,
    subtitleOffset,
    hasSubtitle: activeSubtitle >= 0,
    onSeek: seek,
    onVolume: setVideoVolume,
    onSubtitleOffset: setSubtitleOffset,
    onTogglePlay: togglePlay,
    onSkip: skip,
    onTap: () => {
      if (isFullscreen) {
        if (controlsVisible) dismissControls();
        else revealControls();
      } else togglePlay();
    },
  });

  // Remembers whether the last press came from a finger, so the synthetic
  // dblclick a double-tap produces never also toggles fullscreen.
  const lastPointerType = useRef<string>("mouse");

  const objectFit =
    fit === "fill" ? "fill" : fit === "cover" || fit === "zoom" ? "cover" : "contain";
  const scale = rotationScale * (fit === "zoom" ? 1.25 : 1);
  // Status cards ride with the transport: when the bar fades, they fade too.
  const overlayFade = cn(
    "transition-opacity duration-300",
    isFullscreen && !controlsVisible && "pointer-events-none opacity-0",
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 sm:gap-6">
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-10">
        {/* Left: stage + transport */}
        <div
          ref={shellRef}
          className={cn(
            "relative flex min-w-0 flex-col gap-3 sm:gap-4 lg:col-span-6",
            isFullscreen && "gap-0 bg-black",
            isFullscreen && !controlsVisible && "cursor-none",
          )}
        >
          <div
            ref={stageRef}
            className={cn(
              "relative w-full touch-none select-none overflow-hidden bg-black",
              isFullscreen ? "h-full flex-1" : "aspect-video rounded-sm border border-hairline",
            )}
            onDoubleClick={() => {
              if (lastPointerType.current === "mouse") toggleFullscreen();
            }}
            onClick={(event) => {
              // Mouse only — touch taps are handled by the gesture layer.
              if (lastPointerType.current !== "mouse") return;
              if ((event.target as HTMLElement).closest("button")) return;
              if (src) togglePlay();
            }}
            {...gestures.handlers}
            onPointerDown={(event) => {
              lastPointerType.current = event.pointerType || "mouse";
              if (isFullscreen) revealControls();
              gestures.handlers.onPointerDown(event);
            }}
          >
            {src || remux ? (
              <>
                {/* Captions are sideloaded at runtime as <track> children below. */}
                <video
                  ref={videoRef}
                  src={src ?? undefined}
                  className="absolute inset-0 size-full transition-transform duration-200"
                  style={{
                    objectFit,
                    transform: `rotate(${rotation}deg) scale(${scale})`,
                  }}
                  playsInline
                  autoPlay
                >
                  {subtitles.map((t) => (
                    <track
                      key={t.id}
                      kind="subtitles"
                      src={t.src}
                      srcLang={t.language}
                      label={t.label}
                    />
                  ))}
                </video>

                {recoveredAudio && (
                  <audio
                    ref={recoveredAudioRef}
                    src={recoveredAudio}
                    preload="auto"
                    className="hidden"
                  />
                )}

                {remux && remux.phase !== "done" && (
                  <OverlayCard
                    key={`remux-${src ?? "stream"}`}
                    persistKey="remux"
                    title={`Remux stream${remux.phase === "error" ? " · failed" : ""}`}
                    badge={`${Math.round(remux.ratio * 100)}%`}
                    tone={remux.phase === "error" ? "destructive" : "default"}
                    className={cn(
                      "offset-safe-top offset-safe-left left-2 top-2 w-[min(20rem,calc(100%-1rem))] sm:left-4 sm:top-4",
                    )}
                  >
                    <p className="readout text-[10px] leading-relaxed text-muted-foreground">
                      {remux.message}
                    </p>
                    <div className="mt-2 h-1 w-full overflow-hidden rounded-sm bg-hairline">
                      <div
                        className={cn(
                          "h-full transition-all",
                          remux.phase === "error" ? "bg-destructive" : "bg-primary",
                        )}
                        style={{ width: `${Math.max(2, Math.round(remux.ratio * 100))}%` }}
                      />
                    </div>
                    <p className="readout mt-1.5 text-[10px] text-muted-foreground/80">
                      Video bytes are copied untouched; only unsupported audio is re-encoded.
                    </p>
                  </OverlayCard>
                )}
                {audioIssue && (
                  <OverlayCard
                    key={`audio-issue-${src ?? "stream"}`}
                    persistKey="audio-issue"
                    title="Audio not decodable"
                    tone="destructive"
                    className={cn(
                      "offset-safe-top offset-safe-right right-2 top-14 w-[min(18rem,calc(100%-1rem))] sm:right-4 sm:top-4 md:top-2",
                      overlayFade,
                    )}
                  >
                    <p className="readout text-[10px] leading-relaxed text-muted-foreground">
                      {audioIssue}
                    </p>
                    <button
                      type="button"
                      onClick={() => void recoverAudio()}
                      disabled={recovery?.busy}
                      className="readout mt-2 min-h-9 w-full rounded-sm border border-primary px-2 py-1 text-[10px] uppercase tracking-widest text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                    >
                      {recovery?.busy ? "Recovering…" : "Recover audio"}
                    </button>
                  </OverlayCard>
                )}

                {recovery && (
                  <OverlayCard
                    key={`recovery-${src ?? "stream"}`}
                    persistKey="recovery"
                    title="Audio pass"
                    badge={`${Math.round(recovery.ratio * 100)}%`}
                    className={cn(
                      "offset-safe-left bottom-16 left-2 w-[min(18rem,calc(100%-1rem))] sm:bottom-20 sm:left-4",
                      overlayFade,
                    )}
                  >
                    <p className="readout text-[10px] leading-relaxed text-muted-foreground">
                      {recovery.message}
                    </p>
                    {recovery.busy && (
                      <>
                        <div className="mt-2 h-1 w-full overflow-hidden rounded-sm bg-hairline">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${Math.round(recovery.ratio * 100)}%` }}
                          />
                        </div>
                        <p className="readout mt-1.5 flex justify-between text-[10px] text-muted-foreground">
                          <span>elapsed {formatTime(recoveryElapsed)}</span>
                          <span>{etaLabel ? `${etaLabel} left` : "estimating…"}</span>
                        </p>
                      </>
                    )}
                  </OverlayCard>
                )}

                {/* Touch-first fullscreen toggle, clear of any notch. */}
                <button
                  type="button"
                  aria-label={isFullscreen ? "Leave fullscreen" : "Enter fullscreen"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFullscreen();
                  }}
                  className={cn(
                    "offset-safe-top offset-safe-right absolute right-2 top-2 z-30 grid size-11 place-items-center rounded-sm border border-hairline bg-background/70 text-foreground backdrop-blur-sm transition-opacity md:hidden",
                    isFullscreen && !controlsVisible && "pointer-events-none opacity-0",
                  )}
                >
                  {isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
                </button>

                {/* Live gesture readout: scrub target, volume, caption offset. */}
                {gestures.hint && (
                  <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center">
                    <div className="readout flex min-w-24 flex-col items-center gap-1.5 rounded-sm border border-hairline bg-background/85 px-3 py-2 text-xs text-foreground backdrop-blur-sm">
                      <span className="label-machined text-[9px] text-primary">
                        {gestures.hint.kind === "skip"
                          ? "skip"
                          : gestures.hint.kind === "seek"
                            ? "seek"
                            : gestures.hint.kind === "volume"
                              ? "volume"
                              : "captions"}
                      </span>
                      <span>{gestures.hint.label}</span>
                      {gestures.hint.ratio !== undefined && (
                        <span className="h-1 w-24 overflow-hidden rounded-sm bg-hairline">
                          <span
                            className="block h-full bg-primary"
                            style={{
                              width: `${Math.round(Math.max(0, Math.min(1, gestures.hint.ratio)) * 100)}%`,
                            }}
                          />
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {cueText && activeSubtitle >= 0 && (
                  <p
                    className="pointer-events-none absolute left-1/2 z-10 max-w-[85%] -translate-x-1/2 whitespace-pre-line rounded px-3 py-1 text-center font-medium"
                    style={{
                      bottom: `${subtitleOffset}%`,
                      fontSize: `${subtitleSize}px`,
                      lineHeight: 1.25,
                      color: "var(--subtitle-foreground)",
                      backgroundColor: "var(--subtitle-backdrop)",
                    }}
                  >
                    {cueText}
                  </p>
                )}

                {statsVisible && <StatsOverlay stats={stats} />}
              </>
            ) : (
              <div className="absolute inset-4 flex flex-col items-center justify-center gap-3 border border-dashed border-hairline/70 px-6 text-center">
                <span className="flex size-12 items-center justify-center border border-hairline">
                  <span className="size-4 bg-primary" aria-hidden />
                </span>
                <p className="label-machined text-muted-foreground">No media loaded</p>
                <p className="readout text-[10px] italic text-muted-foreground/70">
                  Awaiting binary stream input — original bytes, no re-encode
                </p>
              </div>
            )}
          </div>

          <div
            className={cn(
              isFullscreen &&
                "pad-safe absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/80 to-transparent pt-10 transition-opacity duration-300",
              isFullscreen && !controlsVisible && "pointer-events-none opacity-0",
            )}
          >
            <ControlBar
              playing={playing}
              currentTime={currentTime}
              duration={duration}
              buffered={buffered}
              volume={volume}
              muted={muted}
              rate={rate}
              fit={fit}
              rotation={rotation}
              subtitles={subtitles}
              activeSubtitle={activeSubtitle}
              audioTracks={audioOptions}
              recovery={recovery ? { busy: recovery.busy, ratio: recovery.ratio, etaLabel } : null}
              canRecoverAudio={Boolean(current) && !recoveredAudio}
              onRecoverAudio={() => void recoverAudio()}
              statsVisible={statsVisible}
              onTogglePlay={togglePlay}
              onSeek={seek}
              onSkip={skip}
              onVolume={setVideoVolume}
              onToggleMute={toggleMute}
              onRate={applyRate}
              onFit={setFit}
              onRotate={rotate}
              onFullscreen={toggleFullscreen}
              onPictureInPicture={togglePip}
              onSubtitle={setActiveSubtitle}
              onAudioTrack={selectAudioTrack}
              onAddSubtitleFile={(file) => void addSubtitleFile(file)}
              onToggleStats={() => setStatsVisible((v) => !v)}
              onShortcuts={() => setShortcutsOpen(true)}
            />
          </div>

          {src && activeSubtitle >= 0 && !isFullscreen && (
            <div className="panel-machined flex flex-wrap items-center gap-3 px-3 py-2.5 text-xs sm:gap-5 sm:px-4">
              <label className="flex min-w-0 items-center gap-2">
                <span className="readout text-[10px] uppercase tracking-widest text-muted-foreground">
                  Caption size
                </span>
                <input
                  type="range"
                  min={14}
                  max={64}
                  value={subtitleSize}
                  onChange={(e) => setSubtitleSize(Number(e.target.value))}
                  className="min-w-0 flex-1 accent-primary sm:flex-none"
                />
                <span className="readout text-[10px] text-foreground">{subtitleSize}px</span>
              </label>
              <label className="flex min-w-0 items-center gap-2">
                <span className="readout text-[10px] uppercase tracking-widest text-muted-foreground">
                  Vertical offset
                </span>
                <input
                  type="range"
                  min={0}
                  max={40}
                  value={subtitleOffset}
                  onChange={(e) => setSubtitleOffset(Number(e.target.value))}
                  className="min-w-0 flex-1 accent-primary sm:flex-none"
                />
                <span className="readout text-[10px] text-foreground">{subtitleOffset}%</span>
              </label>
            </div>
          )}
        </div>

        {/* Right: intake + queue console rail */}
        <div className="flex min-w-0 flex-col gap-4 sm:gap-6 lg:col-span-4">
          <SourceIntake
            onFiles={(files) => void addFiles(files)}
            onUrl={(url) => void addUrl(url)}
            busy={intakeBusy}
            error={intakeError}
          />

          <SessionReadout
            container={container}
            stats={stats}
            statsVisible={statsVisible}
            onToggleStats={() => setStatsVisible((v) => !v)}
            name={current?.name ?? null}
            rotation={rotation}
          />

          <Playlist
            items={items}
            currentId={currentId}
            onSelect={setCurrentId}
            onRemove={removeItem}
          />
        </div>
      </div>

      <LogPanel />

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {folderListing && (
        <FolderPicker
          listing={folderListing}
          onClose={() => setFolderListing(null)}
          onAdd={addFolderChildren}
        />
      )}
    </div>
  );
}

/** Right-rail instrument readout: what is loaded and how it is decoding. */
function SessionReadout({
  container,
  stats,
  statsVisible,
  onToggleStats,
  name,
  rotation,
}: {
  container: string;
  stats: PlaybackStats;
  statsVisible: boolean;
  onToggleStats: () => void;
  name: string | null;
  rotation: number;
}) {
  const rows: [string, string][] = [
    ["Container", container],
    ["Resolution", stats.resolution],
    ["Dropped", `${stats.droppedFrames} frames`],
    ["Buffer", `${stats.bufferedAhead.toFixed(1)}s ahead`],
    ["Rotation", `${rotation}°`],
    ["Cores", String(stats.cores)],
  ];

  return (
    <section className="panel-machined p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="label-machined text-foreground">Playback stats</h2>
        <button
          type="button"
          onClick={onToggleStats}
          className={cn(
            "readout rounded-sm border px-1.5 py-0.5 text-[9px] uppercase tracking-widest transition-colors",
            statsVisible
              ? "border-primary text-primary"
              : "border-hairline text-muted-foreground hover:text-foreground",
          )}
        >
          {statsVisible ? "live" : "overlay off"}
        </button>
      </div>

      <p className="readout mb-4 truncate text-[11px] text-foreground">
        {name ?? <span className="text-muted-foreground">no source selected</span>}
      </p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="readout text-[10px] uppercase tracking-widest text-muted-foreground">
              {label}
            </dt>
            <dd className="readout truncate text-xs text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
