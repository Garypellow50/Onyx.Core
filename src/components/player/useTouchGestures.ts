import { useCallback, useRef, useState } from "react";

export type GestureHint = {
  kind: "seek" | "volume" | "subtitle" | "skip";
  label: string;
  ratio?: number;
  side?: "left" | "right";
} | null;

type Options = {
  duration: number;
  currentTime: number;
  volume: number;
  subtitleOffset: number;
  hasSubtitle: boolean;
  onSeek: (time: number) => void;
  onVolume: (level: number) => void;
  onSubtitleOffset: (percent: number) => void;
  onTogglePlay: () => void;
  onSkip: (delta: number) => void;
  onTap: () => void;
};

/** px of travel before a drag is classified — keeps stray taps from scrubbing. */
const SLOP = 14;
/** window in which a second tap counts as a double tap */
const DOUBLE_TAP_MS = 280;
/** longest press still treated as a tap rather than a hold */
const TAP_MAX_MS = 350;
const SEEK_WINDOW = 90;

function fmt(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Touch transport for the video stage.
 *
 * - horizontal drag  → scrub (commits on release, live readout while dragging)
 * - vertical drag, right half → volume
 * - vertical drag, left half  → caption vertical offset (when captions are on)
 * - single tap  → show/hide controls
 * - double tap  → ±10 s on the outer thirds, play/pause in the middle
 *
 * Everything is pointer-event based and ignores mouse input so the desktop
 * click behaviour is untouched.
 */
export function useTouchGestures(opts: Options) {
  const [hint, setHint] = useState<GestureHint>(null);
  const state = useRef({
    active: false,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    startedAt: 0,
    mode: null as null | "seek" | "volume" | "subtitle",
    baseTime: 0,
    baseVolume: 1,
    baseOffset: 16,
    target: 0,
    pointerId: -1,
  });
  const lastTap = useRef({ at: 0, x: 0 });
  const singleTapTimer = useRef(0);
  const hintTimer = useRef(0);

  const flashHint = useCallback((next: GestureHint, ms = 700) => {
    setHint(next);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(null), ms);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse") return;
      if ((event.target as HTMLElement).closest("button, input, select, textarea, a")) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const rect = event.currentTarget.getBoundingClientRect();
      state.current = {
        active: true,
        x: event.clientX,
        y: event.clientY,
        width: rect.width || 1,
        height: rect.height || 1,
        startedAt: performance.now(),
        mode: null,
        baseTime: opts.currentTime,
        baseVolume: opts.volume,
        baseOffset: opts.subtitleOffset,
        target: opts.currentTime,
        pointerId: event.pointerId,
      };
    },
    [opts.currentTime, opts.volume, opts.subtitleOffset],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const s = state.current;
      if (!s.active || event.pointerType === "mouse" || event.pointerId !== s.pointerId) return;
      const dx = event.clientX - s.x;
      const dy = event.clientY - s.y;

      if (!s.mode) {
        if (Math.hypot(dx, dy) < SLOP) return;
        if (Math.abs(dx) > Math.abs(dy)) s.mode = "seek";
        else if (event.clientX - (event.currentTarget as HTMLElement).getBoundingClientRect().left > s.width / 2)
          s.mode = "volume";
        else s.mode = opts.hasSubtitle ? "subtitle" : "volume";
      }

      if (s.mode === "seek") {
        const span = Math.min(SEEK_WINDOW, opts.duration || SEEK_WINDOW);
        const delta = (dx / s.width) * span;
        const target = Math.max(0, Math.min(s.baseTime + delta, opts.duration || s.baseTime + delta));
        s.target = target;
        setHint({
          kind: "seek",
          label: `${delta >= 0 ? "+" : "−"}${fmt(Math.abs(delta))} · ${fmt(target)}`,
          ratio: opts.duration ? target / opts.duration : 0,
        });
      } else if (s.mode === "volume") {
        const level = Math.max(0, Math.min(1, s.baseVolume - dy / (s.height * 0.7)));
        opts.onVolume(level);
        setHint({ kind: "volume", label: `${Math.round(level * 100)}%`, ratio: level });
      } else {
        const offset = Math.max(0, Math.min(40, s.baseOffset - (dy / s.height) * 60));
        opts.onSubtitleOffset(Math.round(offset));
        setHint({ kind: "subtitle", label: `caption ${Math.round(offset)}%`, ratio: offset / 40 });
      }
    },
    [opts],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const s = state.current;
      if (!s.active || event.pointerType === "mouse" || event.pointerId !== s.pointerId) return;
      s.active = false;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const held = performance.now() - s.startedAt;

      if (s.mode === "seek") {
        opts.onSeek(s.target);
        flashHint({ kind: "seek", label: fmt(s.target) }, 500);
        return;
      }
      if (s.mode) {
        flashHint(hint, 500);
        return;
      }
      if (held > TAP_MAX_MS) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const now = performance.now();
      const zone = x < rect.width / 3 ? "left" : x > (rect.width * 2) / 3 ? "right" : "middle";
      const previousZone =
        lastTap.current.x < rect.width / 3
          ? "left"
          : lastTap.current.x > (rect.width * 2) / 3
            ? "right"
            : "middle";
      // A fast swipe between sides is two taps, not a skip. Keeping the zone
      // stable also prevents Android's delayed synthetic click from upgrading
      // a new single tap into a second action.
      const isDouble = now - lastTap.current.at < DOUBLE_TAP_MS && zone === previousZone;
      lastTap.current = { at: now, x };

      if (isDouble) {
        event.preventDefault();
        event.stopPropagation();
        window.clearTimeout(singleTapTimer.current);
        lastTap.current.at = 0;
        if (zone === "left") {
          opts.onSkip(-10);
          flashHint({ kind: "skip", label: "−10s", side: "left" });
        } else if (zone === "right") {
          opts.onSkip(10);
          flashHint({ kind: "skip", label: "+10s", side: "right" });
        } else {
          opts.onTogglePlay();
        }
        return;
      }

      // Defer the single tap so a follow-up tap can upgrade it to a double.
      window.clearTimeout(singleTapTimer.current);
      singleTapTimer.current = window.setTimeout(() => opts.onTap(), DOUBLE_TAP_MS);
    },
    [flashHint, hint, opts],
  );

  const onPointerCancel = useCallback(() => {
    state.current.active = false;
    setHint(null);
  }, []);

  return {
    hint,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}
