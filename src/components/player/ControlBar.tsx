import { useRef, useState } from "react";
import {
  AudioLines,
  Captions,
  Check,
  Gauge,
  Keyboard,
  Maximize,
  Pause,
  PictureInPicture2,
  Play,
  Proportions,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";

import { Slider } from "@/components/ui/slider";
import { formatTime } from "@/lib/player/format";
import { cn } from "@/lib/utils";
import type { SubtitleTrack } from "@/lib/player/subtitles";

export type FitMode = "contain" | "cover" | "fill" | "zoom";

export interface AudioTrackInfo {
  id: string;
  label: string;
  language: string;
  enabled: boolean;
  /** Extra line shown under the label, e.g. "recovered · AAC 192 kbps". */
  detail?: string;
}

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4];
const FIT_MODES: { key: FitMode; label: string }[] = [
  { key: "contain", label: "Fit (letterbox)" },
  { key: "cover", label: "Fill (crop)" },
  { key: "fill", label: "Stretch" },
  { key: "zoom", label: "Zoom 125%" },
];

/** Keys the seek input already handles itself; stop them from also reaching
 * the parent's global shortcut guard so a seek isn't double-applied. */
const SEEK_NAV_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

export interface ControlBarProps {
  playing: boolean;
  currentTime: number;
  duration: number;
  buffered: [number, number][];
  volume: number;
  muted: boolean;
  rate: number;
  fit: FitMode;
  rotation: number;
  subtitles: SubtitleTrack[];
  activeSubtitle: number;
  audioTracks: AudioTrackInfo[];
  /** Live audio-recovery state, or null when no pass is running/finished. */
  recovery?: { busy: boolean; ratio: number; etaLabel: string | null } | null;
  canRecoverAudio?: boolean;
  statsVisible: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSkip: (delta: number) => void;
  onVolume: (value: number) => void;
  onToggleMute: () => void;
  onRate: (rate: number) => void;
  onFit: (fit: FitMode) => void;
  onRotate: () => void;
  onFullscreen: () => void;
  onPictureInPicture: () => void;
  onSubtitle: (index: number) => void;
  onAudioTrack: (id: string) => void;
  onRecoverAudio?: () => void;
  onAddSubtitleFile: (file: File) => void;
  onToggleStats: () => void;
  onShortcuts: () => void;
  /** Disables every transport control, e.g. while no source is loaded. Defaults to false. */
  disabled?: boolean;
}

export function ControlBar(props: ControlBarProps) {
  const disabled = props.disabled ?? false;
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const subInput = useRef<HTMLInputElement>(null);
  // Portal target for the dropdown menus: rendering into the control bar's own
  // subtree (instead of document.body, the shared ui/dropdown-menu default)
  // keeps the menus visible while the player element is in the Fullscreen API,
  // since only the fullscreen element's subtree paints.
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null);

  const progress = props.duration > 0 ? (props.currentTime / props.duration) * 100 : 0;
  const activeAudio = props.audioTracks.find((t) => t.enabled);
  const recovery = props.recovery;

  function timeFromRatio(ratio: number): number {
    return Math.min(1, Math.max(0, ratio)) * props.duration;
  }

  function positionFromClientX(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return timeFromRatio((clientX - rect.left) / rect.width);
  }

  const seekValueText = `${formatTime(props.currentTime, props.duration >= 3600)} of ${formatTime(
    props.duration,
    props.duration >= 3600,
  )}`;

  return (
    <div
      ref={setPortalRoot}
      className="transport-panel panel-machined flex min-w-0 flex-col gap-2.5 p-2 sm:gap-3 sm:p-3"
    >
      {/* Timeline: a native range input layered over the buffer track. It gets
          pointer drag, touch drag, and Left/Right/Up/Down/Home/End/PageUp/
          PageDown keyboard support for free, plus a formatted aria-valuetext
          readout. onChange fires continuously while dragging, matching the
          previous click-to-seek behavior. */}
      <div
        ref={trackRef}
        className="relative flex h-8 min-w-0 items-center"
        onPointerMove={(e) => {
          if (disabled) return;
          const rect = trackRef.current?.getBoundingClientRect();
          setHoverX(rect ? e.clientX - rect.left : 0);
          setHoverTime(positionFromClientX(e.clientX));
        }}
        onPointerLeave={() => setHoverTime(null)}
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-inset">
          {props.buffered.map(([start, end], i) => (
            <span
              key={`${start}-${end}-${i}`}
              className="absolute inset-y-0 bg-hairline"
              style={{
                left: `${props.duration ? (start / props.duration) * 100 : 0}%`,
                width: `${props.duration ? ((end - start) / props.duration) * 100 : 0}%`,
              }}
            />
          ))}
          <span
            className="absolute inset-y-0 left-0 bg-primary"
            style={{ width: `${progress}%` }}
          />
        </div>

        <input
          type="range"
          min={0}
          max={props.duration || 0}
          step={0.01}
          value={Math.min(props.currentTime, props.duration || 0)}
          disabled={disabled || props.duration <= 0}
          onChange={(e) => props.onSeek(Number(e.target.value))}
          onKeyDown={(e) => {
            if (SEEK_NAV_KEYS.has(e.key)) e.stopPropagation();
          }}
          aria-label="Seek"
          aria-valuetext={seekValueText}
          className={cn(
            "relative z-10 h-full w-full cursor-pointer appearance-none bg-transparent",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "focus-visible:outline-none",
            "[&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-runnable-track]:bg-transparent",
            "[&::-moz-range-track]:h-full [&::-moz-range-track]:bg-transparent",
            "[&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow-[0_0_10px_color-mix(in_oklab,var(--primary)_50%,transparent)]",
            "[&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-foreground",
            "focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-ring focus-visible:[&::-moz-range-thumb]:ring-2 focus-visible:[&::-moz-range-thumb]:ring-ring",
          )}
        />

        {hoverTime !== null && !disabled && (
          <span
            className="readout pointer-events-none absolute -top-6 -translate-x-1/2 rounded-sm border border-hairline bg-card px-1.5 py-0.5 text-[10px] text-foreground"
            style={{ left: hoverX }}
          >
            {formatTime(hoverTime)}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1 sm:gap-1.5">
        {/* Primary transport: play/pause is the one visually distinct (ivory) control. */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          <IconButton
            label={props.playing ? "Pause" : "Play"}
            onClick={props.onTogglePlay}
            disabled={disabled}
            primary
          >
            {props.playing ? (
              <Pause className="size-4 sm:size-5" />
            ) : (
              <Play className="size-4 sm:size-5" />
            )}
          </IconButton>
          <IconButton label="Back 10 seconds" onClick={() => props.onSkip(-10)} disabled={disabled}>
            <SkipBack className="size-4" />
          </IconButton>
          <IconButton label="Forward 10 seconds" onClick={() => props.onSkip(10)} disabled={disabled}>
            <SkipForward className="size-4" />
          </IconButton>
        </div>

        <span className="readout ml-0.5 flex items-center gap-1 text-[10px] sm:ml-1 sm:gap-1.5 sm:text-[11px]">
          <span className="text-primary">
            {formatTime(props.currentTime, props.duration >= 3600)}
          </span>
          <span className="text-hairline">/</span>
          <span className="text-muted-foreground">
            {formatTime(props.duration, props.duration >= 3600)}
          </span>
        </span>

        <span className="mx-1 hidden h-5 w-px bg-hairline sm:block" aria-hidden />

        {/* Secondary tools, kept visually lighter than the primary transport group. */}
        <div className="flex min-w-0 items-center gap-1.5">
          <IconButton
            label={props.muted ? "Unmute" : "Mute"}
            onClick={props.onToggleMute}
            disabled={disabled}
          >
            {props.muted || props.volume === 0 ? (
              <VolumeX className="size-4" />
            ) : (
              <Volume2 className="size-4" />
            )}
          </IconButton>
          <Slider
            className="w-12 sm:w-20"
            value={[props.muted ? 0 : Math.round(props.volume * 100)]}
            max={100}
            step={1}
            disabled={disabled}
            onValueChange={(v) => props.onVolume((v[0] ?? 0) / 100)}
            aria-label="Volume"
          />
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-0.5 sm:ml-auto sm:w-auto sm:flex-nowrap sm:gap-1">
          <TransportMenu
            container={portalRoot}
            trigger={
              <TriggerPill label="Captions and subtitles" disabled={disabled}>
                <Captions className={cn("size-4", props.activeSubtitle >= 0 && "text-primary")} />
                <span className="hidden sm:inline">
                  CC [{props.activeSubtitle >= 0 ? "ON" : "OFF"}]
                </span>
              </TriggerPill>
            }
          >
            <MenuLabel>Subtitles</MenuLabel>
            <MenuCheckboxItem
              checked={props.activeSubtitle === -1}
              onCheckedChange={() => props.onSubtitle(-1)}
            >
              Off
            </MenuCheckboxItem>
            {props.subtitles.map((t, i) => (
              <MenuCheckboxItem
                key={t.id}
                checked={props.activeSubtitle === i}
                onCheckedChange={() => props.onSubtitle(i)}
              >
                <span className="block max-w-[14rem] truncate">
                  {t.label} · {t.cues} cues
                </span>
              </MenuCheckboxItem>
            ))}
            <MenuSeparator />
            <button
              type="button"
              onClick={() => subInput.current?.click()}
              className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              Load .srt / .vtt / .ass…
            </button>
          </TransportMenu>

          <TransportMenu
            container={portalRoot}
            trigger={
              <TriggerPill label="Audio track" disabled={disabled}>
                <AudioLines className="size-4" />
                <span className="hidden max-w-[7rem] truncate sm:inline">
                  {recovery?.busy
                    ? `AUDIO ${Math.round(recovery.ratio * 100)}%${recovery.etaLabel ? ` · ${recovery.etaLabel}` : ""}`
                    : (activeAudio?.label ?? "Audio")}
                </span>
              </TriggerPill>
            }
          >
            <MenuLabel>Audio tracks</MenuLabel>
            {props.audioTracks.length === 0 ? (
              <p className="max-w-56 px-2 py-1.5 text-xs text-muted-foreground">
                This browser is not exposing separate audio tracks for this file. Chromium exposes
                them most often; Safari and Firefox usually do not.
              </p>
            ) : (
              props.audioTracks.map((t) => (
                <MenuCheckboxItem
                  key={t.id}
                  checked={t.enabled}
                  onCheckedChange={() => props.onAudioTrack(t.id)}
                >
                  <span className="flex max-w-[14rem] flex-col">
                    <span className="truncate">
                      {t.label} {t.language && `(${t.language})`}
                    </span>
                    {t.detail && (
                      <span className="readout truncate text-[10px] text-muted-foreground">
                        {t.detail}
                      </span>
                    )}
                  </span>
                </MenuCheckboxItem>
              ))
            )}
            {props.canRecoverAudio && props.onRecoverAudio && (
              <>
                <MenuSeparator />
                <button
                  type="button"
                  disabled={recovery?.busy}
                  onClick={props.onRecoverAudio}
                  className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                >
                  {recovery?.busy
                    ? `Recovering audio — ${Math.round(recovery.ratio * 100)}%`
                    : "Recover audio track (transcode pass)"}
                </button>
              </>
            )}
          </TransportMenu>

          <TransportMenu
            container={portalRoot}
            trigger={
              <TriggerPill label="Playback speed" disabled={disabled}>
                <Gauge className="size-4" />
                <span className="hidden sm:inline">{props.rate}x</span>
              </TriggerPill>
            }
          >
            <MenuLabel>Speed</MenuLabel>
            {RATES.map((r) => (
              <MenuCheckboxItem key={r} checked={props.rate === r} onCheckedChange={() => props.onRate(r)}>
                {r}x
              </MenuCheckboxItem>
            ))}
          </TransportMenu>

          <TransportMenu
            container={portalRoot}
            trigger={
              <TriggerPill label="Frame fit" disabled={disabled}>
                <Proportions className="size-4" />
              </TriggerPill>
            }
          >
            <MenuLabel>Frame</MenuLabel>
            {FIT_MODES.map((m) => (
              <MenuCheckboxItem
                key={m.key}
                checked={props.fit === m.key}
                onCheckedChange={() => props.onFit(m.key)}
              >
                {m.label}
              </MenuCheckboxItem>
            ))}
            <MenuSeparator />
            <MenuCheckboxItem checked={props.statsVisible} onCheckedChange={props.onToggleStats}>
              Stats overlay
            </MenuCheckboxItem>
          </TransportMenu>

          <IconButton
            label={`Rotate (now ${props.rotation}°)`}
            onClick={props.onRotate}
            disabled={disabled}
          >
            <RotateCw className={cn("size-4", props.rotation !== 0 && "text-primary")} />
          </IconButton>
          <IconButton label="Picture in picture" onClick={props.onPictureInPicture} disabled={disabled}>
            <PictureInPicture2 className="size-4" />
          </IconButton>
          <IconButton label="Keyboard shortcuts" onClick={props.onShortcuts} disabled={disabled}>
            <Keyboard className="size-4" />
          </IconButton>
          <IconButton label="Fullscreen" onClick={props.onFullscreen} disabled={disabled}>
            <Maximize className="size-4" />
          </IconButton>
        </div>
      </div>

      <input
        ref={subInput}
        type="file"
        hidden
        accept=".srt,.vtt,.ass,.ssa"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) props.onAddSubtitleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  disabled = false,
  primary = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  /** Ivory, visually distinct treatment reserved for the play/pause control. */
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors sm:size-11",
        "hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-40",
        primary &&
          "bg-primary text-primary-foreground shadow-sm hover:text-primary-foreground hover:brightness-110",
      )}
    >
      {children}
    </button>
  );
}

function TriggerPill({
  label,
  disabled,
  children,
}: {
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      className={cn(
        "readout flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full px-2.5 text-[10px] uppercase tracking-widest text-muted-foreground transition-colors sm:h-11 sm:px-3",
        "hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Dropdown built on the Radix primitives directly, rather than the shared
 * `@/components/ui/dropdown-menu` wrapper, so its Portal can target a
 * container inside the control bar's own subtree. Content portaled to
 * `document.body` (the shared wrapper's default) does not paint while an
 * ancestor is the Fullscreen API's element, since only that element's
 * subtree is rendered on top — so the container must live inside it.
 */
function TransportMenu({
  trigger,
  children,
  container,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  container: HTMLElement | null;
}) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>{trigger}</DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal container={container ?? undefined}>
        <DropdownMenuPrimitive.Content
          align="end"
          sideOffset={8}
          className={cn(
            "z-50 max-h-[min(60vh,var(--radix-dropdown-menu-content-available-height))] w-[min(88vw,16rem)] overflow-y-auto overflow-x-hidden rounded-md border border-hairline bg-card p-1 text-foreground shadow-md",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-dropdown-menu-content-transform-origin)",
          )}
        >
          {children}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2 py-1.5 text-sm font-semibold">{children}</div>;
}

function MenuSeparator() {
  return <DropdownMenuPrimitive.Separator className="-mx-1 my-1 h-px bg-muted" />;
}

function MenuCheckboxItem({
  checked,
  onCheckedChange,
  children,
}: {
  checked: boolean;
  onCheckedChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}
