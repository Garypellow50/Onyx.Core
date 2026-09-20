import { useRef } from "react";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export function ControlBar(props: ControlBarProps) {
  const subInput = useRef<HTMLInputElement>(null);
  const duration = Number.isFinite(props.duration) && props.duration > 0 ? props.duration : 0;
  const currentTime = duration
    ? Math.min(duration, Math.max(0, Number.isFinite(props.currentTime) ? props.currentTime : 0))
    : 0;
  const progress = duration ? (currentTime / duration) * 100 : 0;
  const activeAudio = props.audioTracks.find((track) => track.enabled);
  const recovery = props.recovery;

  return (
    <div className="transport panel-machined flex min-w-0 flex-col gap-3 rounded-2xl border border-hairline bg-panel/95 p-3 shadow-lg shadow-background/30 sm:p-4">
      <div className="space-y-2">
        <div className="relative h-5">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-inset">
            {props.buffered.map(([start, end], index) => {
              const safeStart = duration ? Math.min(duration, Math.max(0, start)) : 0;
              const safeEnd = duration ? Math.min(duration, Math.max(safeStart, end)) : 0;
              return (
                <span
                  key={`${start}-${end}-${index}`}
                  className="absolute inset-y-0 bg-muted-foreground/25"
                  style={{
                    left: `${duration ? (safeStart / duration) * 100 : 0}%`,
                    width: `${duration ? ((safeEnd - safeStart) / duration) * 100 : 0}%`,
                  }}
                />
              );
            })}
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
              style={{ width: `${progress}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step="any"
            value={currentTime}
            disabled={!duration}
            onChange={(event) => props.onSeek(Number(event.currentTarget.value))}
            onKeyDown={(event) => event.stopPropagation()}
            aria-label="Seek through media"
            aria-valuetext={`${formatTime(currentTime, duration >= 3600)} of ${formatTime(duration, duration >= 3600)}`}
            className="absolute inset-0 h-5 w-full cursor-pointer appearance-none bg-transparent accent-primary disabled:cursor-not-allowed disabled:opacity-50 [&::-moz-range-progress]:bg-transparent [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-foreground [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-0.5 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-foreground"
          />
        </div>
        <div className="readout flex items-center justify-between text-xs tabular-nums text-muted-foreground">
          <span className="text-foreground">{formatTime(currentTime, duration >= 3600)}</span>
          <span>{formatTime(duration, duration >= 3600)}</span>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
        <div className="flex items-center gap-1">
          <IconButton label="Back 10 seconds" onClick={() => props.onSkip(-10)}>
            <SkipBack className="size-4" />
          </IconButton>
          <button
            type="button"
            onClick={props.onTogglePlay}
            aria-label={props.playing ? "Pause" : "Play"}
            aria-pressed={props.playing}
            title={props.playing ? "Pause" : "Play"}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/20 transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {props.playing ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5" />}
          </button>
          <IconButton label="Forward 10 seconds" onClick={() => props.onSkip(10)}>
            <SkipForward className="size-4" />
          </IconButton>
          <div className="ml-1 flex min-w-0 items-center gap-1">
            <IconButton
              label={props.muted ? "Unmute" : "Mute"}
              onClick={props.onToggleMute}
              pressed={props.muted}
            >
              {props.muted || props.volume === 0 ? (
                <VolumeX className="size-4" />
              ) : (
                <Volume2 className="size-4" />
              )}
            </IconButton>
            <Slider
              className="w-20 sm:w-24"
              value={[props.muted ? 0 : Math.round(props.volume * 100)]}
              max={100}
              step={1}
              onValueChange={(value) => props.onVolume((value[0] ?? 0) / 100)}
              aria-label="Volume"
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1 lg:ml-auto lg:justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <MenuButton
                label="Captions and subtitles"
                active={props.activeSubtitle >= 0}
                icon={<Captions className="size-4" />}
              >
                Captions {props.activeSubtitle >= 0 ? "on" : "off"}
              </MenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56 text-sm">
              <DropdownMenuLabel className="text-xs">Subtitles</DropdownMenuLabel>
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
              <button
                type="button"
                onClick={() => subInput.current?.click()}
                className="min-h-10 w-full px-2 py-2 text-left text-sm hover:bg-muted"
              >
                Load subtitle file (.srt, .vtt, .ass)
              </button>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <MenuButton
                label="Audio track"
                active={Boolean(recovery?.busy)}
                icon={<AudioLines className="size-4" />}
              >
                {recovery?.busy
                  ? `Audio ${Math.round(recovery.ratio * 100)}%${recovery.etaLabel ? ` · ${recovery.etaLabel}` : ""}`
                  : (activeAudio?.label ?? "Audio")}
              </MenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-64 text-sm">
              <DropdownMenuLabel className="text-xs">Audio tracks</DropdownMenuLabel>
              {props.audioTracks.length === 0 ? (
                <p className="max-w-72 px-2 py-2 text-xs leading-relaxed text-muted-foreground">
                  This browser is not exposing separate audio tracks for this file. Chromium exposes
                  them most often. Safari and Firefox usually do not.
                </p>
              ) : (
                props.audioTracks.map((track) => (
                  <DropdownMenuCheckboxItem
                    key={track.id}
                    checked={track.enabled}
                    onCheckedChange={() => props.onAudioTrack(track.id)}
                  >
                    <span className="flex min-w-0 flex-col whitespace-normal">
                      <span>{track.label} {track.language && `(${track.language})`}</span>
                      {track.detail && (
                        <span className="text-xs leading-relaxed text-muted-foreground">{track.detail}</span>
                      )}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))
              )}
              {props.canRecoverAudio && props.onRecoverAudio && (
                <>
                  <DropdownMenuSeparator />
                  <button
                    type="button"
                    disabled={recovery?.busy}
                    onClick={props.onRecoverAudio}
                    className="min-h-10 w-full px-2 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                  >
                    {recovery?.busy
                      ? `Recovering audio · ${Math.round(recovery.ratio * 100)}%`
                      : "Recover audio track"}
                  </button>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <MenuButton label="Playback speed" icon={<Gauge className="size-4" />}>
                {props.rate}×
              </MenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-sm">
              <DropdownMenuLabel className="text-xs">Playback speed</DropdownMenuLabel>
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
              <MenuButton label="Frame fit and display options" icon={<Proportions className="size-4" />}>
                Frame
              </MenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48 text-sm">
              <DropdownMenuLabel className="text-xs">Frame fit</DropdownMenuLabel>
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

          <IconButton label={`Rotate (now ${props.rotation}°)`} onClick={props.onRotate} pressed={props.rotation !== 0}>
            <RotateCw className="size-4" />
          </IconButton>
          <IconButton label="Picture in picture" onClick={props.onPictureInPicture}>
            <PictureInPicture2 className="size-4" />
          </IconButton>
          <IconButton label="Keyboard shortcuts" onClick={props.onShortcuts}>
            <Keyboard className="size-4" />
          </IconButton>
          <IconButton label="Fullscreen" onClick={props.onFullscreen}>
            <Maximize className="size-4" />
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

function MenuButton({
  label,
  active = false,
  icon,
  children,
}: {
  label: string;
  active?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active || undefined}
      className={cn(
        "flex min-h-11 min-w-11 items-center gap-2 rounded-xl px-3 text-xs text-muted-foreground transition hover:bg-inset hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-primary/10 text-primary",
      )}
    >
      {icon}
      <span className="whitespace-normal text-left leading-snug">{children}</span>
    </button>
  );
}

function IconButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-inset hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pressed && "bg-primary/10 text-primary",
      )}
    >
      {children}
    </button>
  );
}
