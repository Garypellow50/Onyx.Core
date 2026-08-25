import { log } from "./log";

/**
 * Locks the ffmpeg-recovered <audio> sink to the <video> element's clock.
 *
 * The recovery pass (see audio-transcode.ts) hands back a separate audio blob
 * because the browser cannot decode the container's own AC-3/E-AC-3/DTS/TrueHD
 * track. That leaves two independent media elements, each with its own clock,
 * and nothing in the platform keeps them together: any hitch on the picture
 * side — a starved buffer, a slow disk read, a decoder backpressure spike —
 * freezes the video clock while the audio clock keeps running at wall speed.
 *
 * The controller here treats the video as the master and the audio as a pure
 * follower, and it deliberately does NOT trust media events to tell it when the
 * master stalled: it measures how fast the master clock actually advances
 * against wall time. That covers the cases browsers never announce (frame-drop
 * hitches, throttled decode, MSE starvation that never drops readyState below
 * HAVE_FUTURE_DATA and therefore emits no `waiting`/`canplay` pair).
 *
 * Three correction zones, cheapest first:
 *   |error| < TRIM_ENTER   → hold playbackRate, do nothing
 *   |error| < HARD_LIMIT   → proportional rate trim, pitch-preserved
 *   otherwise              → hard seek the audio onto the master
 */

export interface AudioSyncOptions {
  /** Level to hand back to the video element once the sink detaches. */
  restoreVolume: number;
  /** Level the user last chose, used when the video element reports zero. */
  fallbackVolume?: number;
}

/**
 * Sampling period. The freeze threshold below is what decides how much error a
 * stall can leak, and this only adds detection latency on top of it, so it is
 * kept well under the threshold. The tick itself is a handful of property
 * reads — cheaper per second than one animation frame.
 */
const TICK_MS = 20;
/** A seek needs this long to settle before its error reading means anything. */
const SETTLE_MS = 260;
/**
 * Hysteresis band. Trimming starts only once the error is clearly audible-bound
 * and stops when it is comfortably small, so the resampler is not re-primed on
 * every sample by the quantisation noise in the master clock.
 */
const TRIM_ENTER = 0.03;
const TRIM_EXIT = 0.012;
/** Lip-sync error becomes noticeable around 0.2s, so snap before that. */
const HARD_LIMIT = 0.18;
/** Proportional gain, and the trim ceiling as a fraction of the base rate. */
const TRIM_GAIN = 1;
const MAX_TRIM = 0.1;
/** Widened ceiling used when seeking proves unreliable on this blob. */
const WIDE_TRIM = 0.25;
/**
 * Freeze threshold. The master clock only moves when a frame is presented, so
 * "no movement" is measured against the frame cadence this stream actually
 * shows rather than a fixed number: a 24 fps file freezes after ~125ms of
 * silence, a 5 fps timelapse only after ~600ms.
 *
 * The wall-time floor is divided by the playback rate because what the ear
 * hears is *media* time over-run: at 2× the follower runs away twice as fast,
 * so it has to be parked in half the wall time to leak the same error.
 */
const FREEZE_MIN_MS = 120;
const FREEZE_FRAMES = 3;
/** Frame-cadence estimate: rises instantly, decays slowly, so it tracks the worst case. */
const FRAME_DECAY = 0.97;
const FRAME_SEED_MS = 80;
/** More hard seeks than this inside the window means seeking is not landing. */
const THRASH_LIMIT = 3;
const THRASH_WINDOW_MS = 6000;
const THRASH_COOLDOWN_MS = 5000;
/** How often the "follower must be running" invariant may retry a restart. */
const RESTART_RETRY_MS = 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Median of the last three readings — rejects single-frame quantisation spikes. */
function median3(values: number[]): number {
  const [a, b, c] = values as [number, number, number];
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
}

export function attachAudioSync(
  video: HTMLVideoElement,
  audio: HTMLAudioElement,
  options: AudioSyncOptions,
): () => void {
  /* ------------------------------------------------------------- sink setup */

  const level = video.volume > 0 ? video.volume : (options.fallbackVolume ?? 1);
  audio.playbackRate = video.playbackRate;
  audio.volume = level;
  audio.muted = video.muted;
  audio.preservesPitch = true;
  // Only one sink may be audible; the container's own track is held silent.
  video.volume = 0;

  /* ----------------------------------------------------------------- state */

  let detached = false;
  /** Master position at the previous sample, and when it last actually moved. */
  let lastMaster = video.currentTime;
  let lastAdvanceAt = performance.now();
  /** Rolling estimate of this stream's frame interval, in milliseconds. */
  let framePeriod = FRAME_SEED_MS;
  /** True while the picture is frozen and the audio is parked. */
  let frozen = false;
  /** True while a rate trim is active, for the hysteresis band. */
  let trimming = false;
  /** Timestamp of the last hard seek, for the settling window. */
  let syncedAt = 0;
  let samples: number[] = [];
  let hardSyncs: number[] = [];
  let rateOnlyUntil = 0;
  /** Last time the follower was forcibly restarted, for the retry cadence. */
  let restartedAt = 0;
  /** Last value written to playbackRate, to avoid re-priming the resampler. */
  let writtenRate = audio.playbackRate;
  /** Master rate the cadence estimate was measured at, to rescale it on change. */
  let cadenceRate = baseRate();

  function baseRate(): number {
    const rate = video.playbackRate;
    return Number.isFinite(rate) && rate > 0 ? rate : 1;
  }

  function applyRate(rate: number) {
    if (Math.abs(rate - writtenRate) < 0.0005) return;
    writtenRate = rate;
    audio.playbackRate = rate;
  }

  function forget() {
    samples = [];
  }

  /** Snaps the follower onto the master. Used after any discontinuity. */
  function hardSync(reason: string) {
    const target = video.currentTime;
    if (!Number.isFinite(target)) return;
    const before = audio.currentTime;
    audio.currentTime = target;
    trimming = false;
    applyRate(baseRate());
    syncedAt = performance.now();
    forget();
    log.debug(
      "audio",
      `Realigned the recovered track (${reason})`,
      `${(before - target).toFixed(3)}s → 0s at ${target.toFixed(2)}s`,
    );
  }

  /**
   * Drift-triggered snap. Only these count toward the thrash guard: repeated
   * snaps that fail to remove the error mean this blob's seek granularity is
   * too coarse (a WebM written without cues, say), and pulling the error out
   * with the rate trim alone is then both smoother and more effective.
   */
  function snapForDrift(error: number) {
    log.warn(
      "audio",
      "Recovered track drifted past the audible threshold; snapping back",
      `${error.toFixed(3)}s`,
    );
    hardSync("drift over threshold");
    hardSyncs = hardSyncs.filter((t) => syncedAt - t < THRASH_WINDOW_MS);
    hardSyncs.push(syncedAt);
    if (hardSyncs.length > THRASH_LIMIT && rateOnlyUntil < syncedAt) {
      rateOnlyUntil = syncedAt + THRASH_COOLDOWN_MS;
      hardSyncs = [];
      log.warn(
        "audio",
        "Seeking the recovered track is not landing accurately; correcting by rate only",
        "This blob's keyframe index is coarse, so sync is now pulled in continuously instead of snapped.",
      );
    }
  }

  function resume(reason: string) {
    if (video.paused || !audio.paused) return;
    void audio
      .play()
      .catch((err) => log.warn("audio", `Recovered track could not start (${reason})`, err));
  }

  function park() {
    if (!audio.paused) audio.pause();
  }

  /* ------------------------------------------------------------- controller */

  function enterFreeze(reason: string) {
    if (frozen) return;
    frozen = true;
    park();
    forget();
    log.debug("audio", "Picture clock stalled — holding the recovered track", reason);
  }

  function leaveFreeze(reason: string) {
    if (!frozen) return;
    frozen = false;
    // Re-arm the cadence measurement so the tick does not immediately re-freeze
    // on the long gap the stall itself left behind.
    lastAdvanceAt = performance.now();
    lastMaster = video.currentTime;
    hardSync(reason);
    resume(reason);
  }

  function tick() {
    if (detached) return;
    const now = performance.now();
    const master = video.currentTime;

    if (video.paused || video.ended) {
      park();
      frozen = false;
      forget();
      lastMaster = master;
      lastAdvanceAt = now;
      return;
    }

    // A seek in flight on either element makes both clocks meaningless.
    if (video.seeking || audio.seeking) {
      forget();
      lastMaster = master;
      lastAdvanceAt = now;
      return;
    }

    const stallAfter = Math.max(FREEZE_MIN_MS / baseRate(), framePeriod * FREEZE_FRAMES);
    if (master !== lastMaster) {
      const gap = now - lastAdvanceAt;
      // Only healthy gaps describe the frame cadence; a stall's gap would
      // otherwise inflate the estimate and blind the detector next time.
      if (gap > 0 && gap <= stallAfter) framePeriod = Math.max(gap, framePeriod * FRAME_DECAY);
      lastMaster = master;
      lastAdvanceAt = now;
    }

    if (now - lastAdvanceAt > stallAfter) {
      enterFreeze(`picture clock still for ${Math.round(now - lastAdvanceAt)}ms`);
      return;
    }
    if (frozen) {
      leaveFreeze("picture resumed");
      return;
    }

    if (now - syncedAt < SETTLE_MS) return;
    if (video.readyState < 2 || audio.readyState < 2) {
      forget();
      return;
    }

    // The invariant that makes a silent-forever follower impossible: whenever
    // the master is running and unfrozen, the follower must be running too.
    // Retried on a slow cadence so a sink that cannot start (autoplay policy,
    // a decode error) neither spams the log nor trips the thrash guard.
    if (audio.paused) {
      const endOfTrack =
        audio.ended && Number.isFinite(audio.duration) && master >= audio.duration - 0.5;
      if (endOfTrack || now - restartedAt < RESTART_RETRY_MS) return;
      restartedAt = now;
      hardSync("follower was not running");
      resume("master is playing");
      return;
    }

    samples.push(audio.currentTime - master);
    if (samples.length > 3) samples.shift();
    if (samples.length < 3) return;

    const error = median3(samples);
    const magnitude = Math.abs(error);
    const base = baseRate();

    if (magnitude >= HARD_LIMIT && now >= rateOnlyUntil) {
      snapForDrift(error);
      return;
    }
    if (magnitude < (trimming ? TRIM_EXIT : TRIM_ENTER)) {
      trimming = false;
      applyRate(base);
      return;
    }
    trimming = true;
    // Audio ahead of picture slows down, audio behind speeds up. Pitch is
    // preserved by the element, so a short trim is inaudible on speech.
    const ceiling = now < rateOnlyUntil ? WIDE_TRIM : MAX_TRIM;
    applyRate(base * (1 - clamp(error * TRIM_GAIN, -ceiling, ceiling)));
  }

  /* ---------------------------------------------------------------- events */

  const onPlay = () => {
    frozen = false;
    lastMaster = video.currentTime;
    lastAdvanceAt = performance.now();
    hardSync("play");
    resume("play");
  };
  const onPlaying = () => {
    // Fires after every rebuffer, including the ones that emit no `canplay`.
    if (frozen) leaveFreeze("playing");
    else resume("playing");
  };
  const onPause = () => {
    park();
    frozen = false;
  };
  const onSeeking = () => {
    park();
    forget();
  };
  const onSeeked = () => {
    frozen = false;
    lastMaster = video.currentTime;
    lastAdvanceAt = performance.now();
    hardSync("seeked");
    resume("seeked");
  };
  const onRateChange = () => {
    // Frames arrive proportionally faster at a higher rate, so carry the
    // cadence estimate across instead of re-learning it from a stale value —
    // an over-large estimate would blind the freeze detector in the meantime.
    const rate = baseRate();
    framePeriod *= cadenceRate / rate;
    cadenceRate = rate;
    trimming = false;
    applyRate(rate);
    forget();
  };
  const onWaiting = () => enterFreeze("buffer starved");
  const onCanPlay = () => {
    if (!video.paused) leaveFreeze("buffer refilled");
  };
  const onEnded = () => park();
  const onEmptied = () => {
    park();
    forget();
  };
  const onVideoVolume = () => {
    // The picture element is held at zero while this sink is live, so only the
    // mute flag is worth mirroring from it.
    audio.muted = video.muted;
    if (video.volume > 0) {
      audio.volume = video.volume;
      video.volume = 0;
    }
  };
  const onAudioError = () =>
    log.error("audio", "The recovered audio sink reported an error", audio.error?.message);
  const onVisibility = () => {
    // Background tabs throttle timers and may suspend video rendering while
    // audio keeps running, so re-measure from scratch on the way back.
    if (document.visibilityState !== "visible") return;
    lastMaster = video.currentTime;
    lastAdvanceAt = performance.now();
    frozen = false;
    forget();
    if (!video.paused) {
      hardSync("returned to foreground");
      resume("returned to foreground");
    }
  };

  video.addEventListener("play", onPlay);
  video.addEventListener("playing", onPlaying);
  video.addEventListener("pause", onPause);
  video.addEventListener("seeking", onSeeking);
  video.addEventListener("seeked", onSeeked);
  video.addEventListener("ratechange", onRateChange);
  video.addEventListener("waiting", onWaiting);
  video.addEventListener("stalled", onWaiting);
  video.addEventListener("canplay", onCanPlay);
  video.addEventListener("canplaythrough", onCanPlay);
  video.addEventListener("ended", onEnded);
  video.addEventListener("emptied", onEmptied);
  video.addEventListener("volumechange", onVideoVolume);
  audio.addEventListener("error", onAudioError);
  document.addEventListener("visibilitychange", onVisibility);

  const timer = window.setInterval(tick, TICK_MS);

  // Frame-presentation callbacks are the earliest possible signal that the
  // picture is moving again — a whole tick sooner than the sampler can tell,
  // which is the difference between a snap the ear notices and one it does not.
  // Chromium and Safari expose it; elsewhere the sampler alone carries this.
  let frameHandle = 0;
  const onFrame = () => {
    if (detached) return;
    if (frozen && !video.paused) leaveFreeze("frame presented");
    frameHandle = video.requestVideoFrameCallback(onFrame);
  };
  const framesAvailable = typeof video.requestVideoFrameCallback === "function";
  if (framesAvailable) frameHandle = video.requestVideoFrameCallback(onFrame);

  if (!video.paused) onPlay();

  log.ok(
    "audio",
    "Recovered track locked to the picture clock",
    `snap over ${(HARD_LIMIT * 1000).toFixed(0)}ms · trim from ${(TRIM_ENTER * 1000).toFixed(0)}ms up to ${MAX_TRIM * 100}% · frame callbacks ${framesAvailable ? "available" : "unavailable"}`,
  );

  return () => {
    detached = true;
    window.clearInterval(timer);
    if (frameHandle) video.cancelVideoFrameCallback?.(frameHandle);
    video.removeEventListener("play", onPlay);
    video.removeEventListener("playing", onPlaying);
    video.removeEventListener("pause", onPause);
    video.removeEventListener("seeking", onSeeking);
    video.removeEventListener("seeked", onSeeked);
    video.removeEventListener("ratechange", onRateChange);
    video.removeEventListener("waiting", onWaiting);
    video.removeEventListener("stalled", onWaiting);
    video.removeEventListener("canplay", onCanPlay);
    video.removeEventListener("canplaythrough", onCanPlay);
    video.removeEventListener("ended", onEnded);
    video.removeEventListener("emptied", onEmptied);
    video.removeEventListener("volumechange", onVideoVolume);
    audio.removeEventListener("error", onAudioError);
    document.removeEventListener("visibilitychange", onVisibility);
    audio.pause();
    audio.playbackRate = 1;
    video.volume = options.restoreVolume;
  };
}
