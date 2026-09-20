import { useRef, useState, type ComponentPropsWithRef, type ReactNode } from "react";
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
import { cn } from "@/lib/utils";
import type { SubtitleTrack } from "@/lib/player/subtitles";

export type FitMode = "contain" | "cover" | "fill" | "zoom";

export interface AudioTrackInfo {
  id: string;
  label: string;
  language: string;
  enabled: boolean;
  detail?: string;
}

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4];
const FIT_MODES: { key: FitMode; label: string }[] = [
  { key: "contain", label: "Fit (letterbox)" },
  { key: "cover", label: "Fill (crop)" },
  { key: "fill", label: "Stretch" },
  { key: "zoom", label: "Zoom 125%" },
];

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

export function ControlBar(props: ControlBarProps) {
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const subInput = useRef<HTMLInputElement>(null);
  const duration = Number.isFinite(props.duration) && props.duration > 0 ? props.duration : 0;
  const currentTime = Math.min(
    duration,
    Math.max(0, Number.isFinite(props.currentTime) ? props.currentTime : 0),
  );
  const progress = duration ? (currentTime / duration) * 100 : 0;
  const activeAudio = props.audioTracks.find((track) => track.enabled);
  const recovery = props.recovery;
  const audioLabel = recovery?.busy
    ? `Audio ${Math.round(recovery.ratio * 100)}%${recovery.etaLabel ? ` · ${recovery.etaLabel}` : ""}`
    : (activeAudio?.label ?? "Audio");
  const volume = props.muted ? 0 : Math.round(props.volume * 100);

  function preview(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || !duration) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setHoverTime(ratio * duration);
    setHoverX(ratio * rect.width);
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-hairline bg-panel p-3 shadow-sm sm:p-4">
      <div
        ref={trackRef}
        className="group relative flex h-11 items-center"
        onPointerMove={(event) => preview(event.clientX)}
        onPointerLeave={() => setHoverTime(null)}
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-inset">
          {props.buffered.map(([rawStart, rawEnd], index) => {
            const start = duration ? Math.min(duration, Math.max(0, rawStart)) : 0;
            const end = duration ? Math.min(duration, Math.max(start, rawEnd)) : 0;
            return (
              <span
                key={`${rawStart}-${rawEnd}-${index}`}
                className="absolute inset-y-0 bg-hairline"
                style={{
                  left: `${duration ? (start / duration) * 100 : 0}%`,
                  width: `${duration ? ((end - start) / duration) * 100 : 0}%`,
                }}
              />
            );
          })}
          <span
            className="absolute inset-y-0 left-0 bg-primary"
            style={{ width: `${progress}%` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={currentTime}
          disabled={!duration}
          onChange={(event) => props.onSeek(Number(event.currentTarget.value))}
          aria-label="Seek through media"
          aria-valuetext={`${formatTime(currentTime, duration >= 3600)} of ${formatTime(duration, duration >= 3600)}`}
          className="cinema-seek-input relative z-10 h-11 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed"
        />
        {hoverTime !== null && (
          <span
            className="pointer-events-none absolute -top-5 -translate-x-1/2 rounded-lg border border-hairline bg-background px-2 py-1 font-mono text-xs text-foreground shadow-sm"
            style={{ left: hoverX }}
          >
            {formatTime(hoverTime, duration >= 3600)}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={props.onTogglePlay}
          aria-label={props.playing ? "Pause" : "Play"}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {props.playing ? (
            <Pause className="size-5" aria-hidden />
          ) : (
            <Play className="ml-0.5 size-5" aria-hidden />
          )}
        </button>
        <IconButton label="Back 10 seconds" onClick={() => props.onSkip(-10)}>
          <SkipBack className="size-4" aria-hidden />
        </IconButton>
        <IconButton label="Forward 10 seconds" onClick={() => props.onSkip(10)}>
          <SkipForward className="size-4" aria-hidden />
        </IconButton>
        <span
          className="whitespace-nowrap font-mono text-xs text-foreground"
          aria-label={`${formatTime(currentTime)} elapsed, ${formatTime(duration)} total`}
        >
          <span className="text-primary">{formatTime(currentTime, duration >= 3600)}</span>
          <span className="text-muted-foreground"> / {formatTime(duration, duration >= 3600)}</span>
        </span>
        <div className="ml-auto flex min-w-[9rem] flex-1 items-center justify-end gap-2 sm:max-w-52">
          <IconButton label={props.muted ? "Unmute" : "Mute"} onClick={props.onToggleMute}>
            {props.muted || props.volume === 0 ? (
              <VolumeX className="size-4" aria-hidden />
            ) : (
              <Volume2 className="size-4" aria-hidden />
            )}
          </IconButton>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={volume}
            onChange={(event) => props.onVolume(Number(event.currentTarget.value) / 100)}
            aria-label="Volume"
            aria-valuetext={`${volume}%`}
            className="cinema-volume-input min-h-11 w-24 shrink-0 cursor-pointer appearance-none rounded-xl bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-32"
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1 border-t border-hairline pt-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <StripButton label={`Captions ${props.activeSubtitle >= 0 ? "on" : "off"}`}>
              <Captions
                className={cn("size-4", props.activeSubtitle >= 0 && "text-primary")}
                aria-hidden
              />
            </StripButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Subtitles</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={props.activeSubtitle === -1}
              onCheckedChange={() => props.onSubtitle(-1)}
            >
              Off
            </DropdownMenuCheckboxItem>
            {props.subtitles.map((track, index) => (
              <DropdownMenuCheckboxItem
                key={track.id}
                checked={props.activeSubtitle === index}
                onCheckedChange={() => props.onSubtitle(index)}
              >
                {track.label} · {track.cues} cues
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => subInput.current?.click()}>
              Load .srt / .vtt / .ass…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <StripButton label={audioLabel}>
              <AudioLines className="size-4" aria-hidden />
            </StripButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Audio tracks</DropdownMenuLabel>
            {props.audioTracks.length === 0 ? (
              <p className="max-w-56 px-2 py-2 text-xs text-muted-foreground">
                This browser is not exposing separate audio tracks for this file.
              </p>
            ) : (
              props.audioTracks.map((track) => (
                <DropdownMenuCheckboxItem
                  key={track.id}
                  checked={track.enabled}
                  onCheckedChange={() => props.onAudioTrack(track.id)}
                >
                  <span className="flex flex-col">
                    <span>
                      {track.label}
                      {track.language && ` (${track.language})`}
                    </span>
                    {track.detail && (
                      <span className="text-xs text-muted-foreground">{track.detail}</span>
                    )}
                  </span>
                </DropdownMenuCheckboxItem>
              ))
            )}
            {props.canRecoverAudio && props.onRecoverAudio && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!!recovery?.busy}
                  onSelect={() => props.onRecoverAudio?.()}
                >
                  {recovery?.busy
                    ? `Recovering audio · ${Math.round(recovery.ratio * 100)}%`
                    : "Recover audio track (transcode pass)"}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <StripButton label={`Speed ${props.rate}×`}>
              <Gauge className="size-4" aria-hidden />
            </StripButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Speed</DropdownMenuLabel>
            {RATES.map((rate) => (
              <DropdownMenuCheckboxItem
                key={rate}
                checked={props.rate === rate}
                onCheckedChange={() => props.onRate(rate)}
              >
                {rate}×
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <StripButton label="View" compact>
              <Proportions className="size-4" aria-hidden />
            </StripButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Frame</DropdownMenuLabel>
            {FIT_MODES.map((mode) => (
              <DropdownMenuCheckboxItem
                key={mode.key}
                checked={props.fit === mode.key}
                onCheckedChange={() => props.onFit(mode.key)}
              >
                {mode.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={props.statsVisible}
              onCheckedChange={props.onToggleStats}
            >
              Stats overlay
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <StripButton label={`Rotate ${props.rotation}°`} onClick={props.onRotate} compact>
          <RotateCw className={cn("size-4", props.rotation !== 0 && "text-primary")} aria-hidden />
        </StripButton>
        <StripButton label="Picture in picture" onClick={props.onPictureInPicture} compact>
          <PictureInPicture2 className="size-4" aria-hidden />
        </StripButton>
        <StripButton label="Keyboard shortcuts" onClick={props.onShortcuts} compact>
          <Keyboard className="size-4" aria-hidden />
        </StripButton>
        <StripButton label="Fullscreen" onClick={props.onFullscreen} compact>
          <Maximize className="size-4" aria-hidden />
        </StripButton>
      </div>

      <input
        ref={subInput}
        type="file"
        hidden
        accept=".srt,.vtt,.ass,.ssa"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) props.onAddSubtitleFile(file);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-inset hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
    </button>
  );
}

function StripButton({
  label,
  compact = false,
  className,
  children,
  ...buttonProps
}: ComponentPropsWithRef<"button"> & { label: string; compact?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "flex min-h-11 min-w-0 items-center rounded-xl text-xs font-medium text-muted-foreground transition-colors hover:bg-inset hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>svg]:shrink-0",
        compact ? "size-11 shrink-0 justify-center" : "gap-2 px-3",
        className,
      )}
      {...buttonProps}
    >
      {children}
      {!compact && <span className="max-w-32 truncate">{label}</span>}
    </button>
  );
}
