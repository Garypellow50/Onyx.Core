import { useRef, type ReactNode } from "react";
import {
  AudioLines,
  Captions,
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

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatTime } from "@/lib/player/format";
import type { SubtitleTrack } from "@/lib/player/subtitles";
import { cn } from "@/lib/utils";

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
const MENU_TRIGGER = "transport-menu inline-flex min-h-10 min-w-0 max-w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const MENU_CONTENT = "max-h-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border-border";

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
}

function clampFinite(value: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0;
}

export function ControlBar(props: ControlBarProps) {
  const subInput = useRef<HTMLInputElement>(null);
  const duration = Number.isFinite(props.duration) && props.duration > 0 ? props.duration : 0;
  const currentTime = clampFinite(props.currentTime, duration);
  const volume = clampFinite(props.volume, 1);
  const volumePercent = props.muted ? 0 : Math.round(volume * 100);
  const progress = duration ? (currentTime / duration) * 100 : 0;
  const activeAudio = props.audioTracks.find((track) => track.enabled);
  const recovery = props.recovery;
  const recoveryPercent = Math.round(clampFinite(recovery?.ratio ?? 0, 1) * 100);
  const audioLabel = recovery?.busy
    ? `Audio ${recoveryPercent}%${recovery.etaLabel ? ` · ${recovery.etaLabel}` : ""}`
    : activeAudio?.label ?? "Audio";

  return (
    <div
      className="transport flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-3 text-card-foreground sm:p-4"
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
    >
      <div className="seek-control relative h-10 min-w-0">
        <span
          aria-hidden="true"
          className="seek-track pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-muted"
        >
          {props.buffered.map(([rawStart, rawEnd], index) => {
            if (!duration || !Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) return null;
            const start = clampFinite(rawStart, duration);
            const end = Math.max(start, clampFinite(rawEnd, duration));
            return (
              <span
                key={`${rawStart}-${rawEnd}-${index}`}
                className="seek-buffer absolute inset-y-0 rounded-full bg-muted-foreground/30"
                style={{ left: `${(start / duration) * 100}%`, width: `${((end - start) / duration) * 100}%` }}
              />
            );
          })}
          <span className="seek-progress absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </span>
        <input
          type="range"
          className="seek-input absolute inset-0 m-0 h-10 w-full cursor-pointer rounded-full bg-transparent accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          disabled={duration === 0}
          aria-label="Seek"
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          onChange={(event) => {
            if (duration > 0) props.onSeek(clampFinite(event.currentTarget.valueAsNumber, duration));
          }}
          onKeyDown={(event) => event.stopPropagation()}
          onKeyUp={(event) => event.stopPropagation()}
        />
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <IconButton label={props.playing ? "Pause" : "Play"} onClick={props.onTogglePlay} primary>
            {props.playing ? <Pause className="size-5 fill-current" aria-hidden /> : <Play className="ml-0.5 size-5 fill-current" aria-hidden />}
          </IconButton>
          <IconButton label="Back 10 seconds" onClick={() => props.onSkip(-10)}>
            <SkipBack className="size-4" aria-hidden />
          </IconButton>
          <IconButton label="Forward 10 seconds" onClick={() => props.onSkip(10)}>
            <SkipForward className="size-4" aria-hidden />
          </IconButton>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium tabular-nums sm:text-sm">
          <span className="text-foreground">{formatTime(currentTime, duration >= 3600)}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">{formatTime(duration, duration >= 3600)}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <IconButton label={props.muted ? "Unmute" : "Mute"} onClick={props.onToggleMute}>
            {props.muted || volume === 0 ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
          </IconButton>
          <input
            type="range"
            className="h-10 w-20 cursor-pointer rounded-lg accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-24"
            min={0}
            max={100}
            step={1}
            value={volumePercent}
            aria-label="Volume"
            aria-valuetext={`${volumePercent} percent`}
            onChange={(event) => props.onVolume(clampFinite(event.currentTarget.valueAsNumber, 100) / 100)}
            onKeyDown={(event) => event.stopPropagation()}
            onKeyUp={(event) => event.stopPropagation()}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1 border-t border-border pt-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Captions and subtitles" className={cn(MENU_TRIGGER, props.activeSubtitle >= 0 && "text-chart-2")}>
              <Captions className="size-4 shrink-0" aria-hidden />
              <span>Captions {props.activeSubtitle >= 0 ? "on" : "off"}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className={cn(MENU_CONTENT, "w-64")}>
            <DropdownMenuLabel>Subtitles</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={props.activeSubtitle === -1} onCheckedChange={() => props.onSubtitle(-1)}>
              Off
            </DropdownMenuCheckboxItem>
            {props.subtitles.map((track, index) => (
              <DropdownMenuCheckboxItem key={track.id} checked={props.activeSubtitle === index} onCheckedChange={() => props.onSubtitle(index)}>
                <span className="min-w-0 [overflow-wrap:anywhere]">{track.label} · {track.cues} cues</span>
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => subInput.current?.click()}>
              Load .srt / .vtt / .ass / .ssa…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Audio tracks: ${audioLabel}`}
              className={cn(MENU_TRIGGER, "max-w-full sm:max-w-64", recovery?.busy && "text-chart-2")}
            >
              <AudioLines className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 text-left [overflow-wrap:anywhere]">{audioLabel}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className={cn(MENU_CONTENT, "w-72")}>
            <DropdownMenuLabel>Audio tracks</DropdownMenuLabel>
            {props.audioTracks.length === 0 ? (
              <p className="px-2 py-2 text-sm leading-relaxed text-muted-foreground">
                This browser does not expose separate audio tracks for this file.
              </p>
            ) : (
              props.audioTracks.map((track) => (
                <DropdownMenuCheckboxItem key={track.id} checked={track.enabled} onCheckedChange={() => props.onAudioTrack(track.id)}>
                  <span className="flex min-w-0 flex-1 flex-col [overflow-wrap:anywhere]">
                    <span>{track.label}{track.language ? ` (${track.language})` : ""}</span>
                    {track.detail && <span className="text-xs text-muted-foreground">{track.detail}</span>}
                  </span>
                </DropdownMenuCheckboxItem>
              ))
            )}
            {props.canRecoverAudio && props.onRecoverAudio && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={recovery?.busy} onSelect={props.onRecoverAudio}>
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {recovery?.busy ? `Recovering audio · ${recoveryPercent}%` : "Recover audio track"}
                  </span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Playback speed" className={MENU_TRIGGER}>
              <Gauge className="size-4 shrink-0" aria-hidden />
              <span>{props.rate}×</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className={MENU_CONTENT}>
            <DropdownMenuLabel>Playback speed</DropdownMenuLabel>
            {RATES.map((rate) => (
              <DropdownMenuCheckboxItem key={rate} checked={props.rate === rate} onCheckedChange={() => props.onRate(rate)}>
                {rate}×
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Frame fit and playback stats" className={cn(MENU_TRIGGER, (props.fit !== "contain" || props.statsVisible) && "text-chart-2")}>
              <Proportions className="size-4 shrink-0" aria-hidden />
              <span>Frame</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={cn(MENU_CONTENT, "w-64")}>
            <DropdownMenuLabel>Frame fit</DropdownMenuLabel>
            {FIT_MODES.map((mode) => (
              <DropdownMenuCheckboxItem key={mode.key} checked={props.fit === mode.key} onCheckedChange={() => props.onFit(mode.key)}>
                {mode.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={props.statsVisible} onCheckedChange={props.onToggleStats}>
              Stats overlay
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <IconButton label={`Rotate (now ${props.rotation}°)`} onClick={props.onRotate}>
            <RotateCw className={cn("size-4", props.rotation !== 0 && "text-chart-2")} aria-hidden />
          </IconButton>
          <IconButton label="Picture in picture" onClick={props.onPictureInPicture}>
            <PictureInPicture2 className="size-4" aria-hidden />
          </IconButton>
          <IconButton label="Keyboard shortcuts" onClick={props.onShortcuts}>
            <Keyboard className="size-4" aria-hidden />
          </IconButton>
          <IconButton label="Fullscreen" onClick={props.onFullscreen}>
            <Maximize className="size-4" aria-hidden />
          </IconButton>
        </div>
      </div>

      <input
        ref={subInput}
        type="file"
        hidden
        accept=".srt,.vtt,.ass,.ssa"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) props.onAddSubtitleFile(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  primary = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      className={cn(
        "transport-button inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        primary && "transport-play bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
      )}
    >
      {children}
    </button>
  );
}
