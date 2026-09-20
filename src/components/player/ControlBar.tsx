import { useRef, useState, type ReactNode } from "react";
import {
  AudioLines,
  Captions,
  Ellipsis,
  Gauge,
  Keyboard,
  Maximize,
  Pause,
  PictureInPicture2,
  Play,
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
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const timelineRef = useRef<HTMLDivElement>(null);
  const subInput = useRef<HTMLInputElement>(null);

  const duration = Number.isFinite(props.duration) && props.duration > 0 ? props.duration : 0;
  const currentTime = duration
    ? Math.min(duration, Math.max(0, Number.isFinite(props.currentTime) ? props.currentTime : 0))
    : 0;
  const volume = Math.min(1, Math.max(0, Number.isFinite(props.volume) ? props.volume : 0));
  const progress = duration ? (currentTime / duration) * 100 : 0;
  const volumePercent = props.muted ? 0 : Math.round(volume * 100);
  const activeAudio = props.audioTracks.find((track) => track.enabled);
  const recovery = props.recovery;
  const recoveryRatio = Math.min(1, Math.max(0, recovery?.ratio ?? 0));

  function updateHover(clientX: number) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || duration === 0) {
      setHoverTime(null);
      return;
    }
    const x = Math.min(rect.width, Math.max(0, clientX - rect.left));
    setHoverX(x);
    setHoverTime((x / rect.width) * duration);
  }

  return (
    <div className="transport flex min-w-0 flex-col gap-2.5 rounded-[20px] border border-border bg-card/95 p-3 text-card-foreground shadow-xl shadow-background/20 backdrop-blur-md sm:p-4">
      <style>{`
        .transport .seek-range,
        .transport .volume-range {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          cursor: pointer;
          margin: 0;
        }
        .transport .seek-range::-webkit-slider-runnable-track,
        .transport .volume-range::-webkit-slider-runnable-track {
          height: 100%;
          background: transparent;
        }
        .transport .seek-range::-moz-range-track,
        .transport .volume-range::-moz-range-track {
          height: 100%;
          background: transparent;
        }
        .transport .seek-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          margin-top: 14px;
          border: 3px solid hsl(var(--card));
          border-radius: 9999px;
          background: hsl(var(--primary));
          box-shadow: 0 1px 5px rgb(0 0 0 / 0.28);
        }
        .transport .seek-range::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border: 3px solid hsl(var(--card));
          border-radius: 9999px;
          background: hsl(var(--primary));
          box-shadow: 0 1px 5px rgb(0 0 0 / 0.28);
        }
        .transport .volume-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          margin-top: 15px;
          border: 2px solid hsl(var(--card));
          border-radius: 9999px;
          background: hsl(var(--primary));
        }
        .transport .volume-range::-moz-range-thumb {
          width: 10px;
          height: 10px;
          border: 2px solid hsl(var(--card));
          border-radius: 9999px;
          background: hsl(var(--primary));
        }
        .transport .seek-range:focus-visible,
        .transport .volume-range:focus-visible {
          outline: 2px solid hsl(var(--ring));
          outline-offset: 2px;
          border-radius: 9999px;
        }
        .transport .seek-range:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }
      `}</style>

      <div
        ref={timelineRef}
        className="group relative h-11 min-w-0"
        onPointerMove={(event) => updateHover(event.clientX)}
        onPointerLeave={() => setHoverTime(null)}
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
          {props.buffered.map(([rawStart, rawEnd], index) => {
            const start = duration ? Math.min(duration, Math.max(0, rawStart)) : 0;
            const end = duration ? Math.min(duration, Math.max(start, rawEnd)) : 0;
            return (
              <span
                key={`${rawStart}-${rawEnd}-${index}`}
                className="absolute inset-y-0 rounded-full bg-muted-foreground/30"
                style={{
                  left: `${duration ? (start / duration) * 100 : 0}%`,
                  width: `${duration ? ((end - start) / duration) * 100 : 0}%`,
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
          className="seek-range absolute inset-0 h-11 w-full touch-none"
          min={0}
          max={duration || 1}
          step="any"
          value={currentTime}
          disabled={duration === 0}
          aria-label="Seek through video"
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          onChange={(event) => {
            const nextTime = Math.min(duration, Math.max(0, event.currentTarget.valueAsNumber));
            props.onSeek(Number.isFinite(nextTime) ? nextTime : 0);
          }}
          onKeyDown={(event) => event.stopPropagation()}
          onKeyUp={(event) => event.stopPropagation()}
        />
        {hoverTime !== null && (
          <span
            className="pointer-events-none absolute -top-2 -translate-x-1/2 rounded-lg border border-border bg-background px-2 py-1 text-xs font-medium tabular-nums text-foreground shadow-md"
            style={{ left: hoverX }}
          >
            {formatTime(hoverTime)}
          </span>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-1 sm:gap-1.5">
        <IconButton label={props.playing ? "Pause" : "Play"} onClick={props.onTogglePlay} primary>
          {props.playing ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
        </IconButton>
        <IconButton label="Back 10 seconds" onClick={() => props.onSkip(-10)}>
          <SkipBack className="size-[18px]" />
        </IconButton>
        <IconButton label="Forward 10 seconds" onClick={() => props.onSkip(10)}>
          <SkipForward className="size-[18px]" />
        </IconButton>

        <div className="ml-1 min-w-0 whitespace-nowrap text-xs font-medium tabular-nums sm:text-sm">
          <span className="text-foreground">{formatTime(currentTime, duration >= 3600)}</span>
          <span className="mx-1.5 text-muted-foreground">/</span>
          <span className="text-muted-foreground">{formatTime(duration, duration >= 3600)}</span>
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-0.5 sm:gap-1">
          <IconButton label={props.muted ? "Unmute" : "Mute"} onClick={props.onToggleMute}>
            {props.muted || volume === 0 ? <VolumeX className="size-[18px]" /> : <Volume2 className="size-[18px]" />}
          </IconButton>
          <div className="relative hidden h-11 w-16 items-center sm:flex md:w-24">
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${volumePercent}%` }} />
            </div>
            <input
              type="range"
              className="volume-range absolute inset-0 h-11 w-full"
              min={0}
              max={100}
              step={1}
              value={volumePercent}
              aria-label="Volume"
              aria-valuetext={`${volumePercent} percent`}
              onChange={(event) => props.onVolume(event.currentTarget.valueAsNumber / 100)}
              onKeyDown={(event) => event.stopPropagation()}
              onKeyUp={(event) => event.stopPropagation()}
            />
          </div>
          <IconButton label="Fullscreen" onClick={props.onFullscreen}>
            <Maximize className="size-[18px]" />
          </IconButton>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1 border-t border-border pt-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <MenuButton label="Captions" active={props.activeSubtitle >= 0}>
              <Captions className="size-4" />
              <span>Captions</span>
            </MenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 rounded-xl border-border">
            <DropdownMenuLabel>Subtitles</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={props.activeSubtitle === -1} onCheckedChange={() => props.onSubtitle(-1)}>
              Off
            </DropdownMenuCheckboxItem>
            {props.subtitles.map((track, index) => (
              <DropdownMenuCheckboxItem
                key={track.id}
                checked={props.activeSubtitle === index}
                onCheckedChange={() => props.onSubtitle(index)}
                className="min-w-0"
              >
                <span className="truncate" title={`${track.label} · ${track.cues} cues`}>
                  {track.label} · {track.cues} cues
                </span>
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => subInput.current?.click()}>
              Load subtitle file…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <MenuButton label="Audio tracks" active={Boolean(recovery?.busy)} className="max-w-[min(15rem,55vw)]">
              <AudioLines className="size-4 shrink-0" />
              <span className="truncate">
                {recovery?.busy
                  ? `Audio ${Math.round(recoveryRatio * 100)}%${recovery.etaLabel ? ` · ${recovery.etaLabel}` : ""}`
                  : activeAudio?.label ?? "Audio"}
              </span>
            </MenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72 max-w-[calc(100vw-2rem)] rounded-xl border-border">
            <DropdownMenuLabel>Audio tracks</DropdownMenuLabel>
            {props.audioTracks.length === 0 ? (
              <p className="px-2 py-2 text-sm leading-relaxed text-muted-foreground">
                This browser does not expose separate audio tracks for this file.
              </p>
            ) : (
              props.audioTracks.map((track) => (
                <DropdownMenuCheckboxItem
                  key={track.id}
                  checked={track.enabled}
                  onCheckedChange={() => props.onAudioTrack(track.id)}
                  className="min-w-0"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate" title={`${track.label}${track.language ? ` (${track.language})` : ""}`}>
                      {track.label}{track.language ? ` (${track.language})` : ""}
                    </span>
                    {track.detail && <span className="truncate text-xs text-muted-foreground" title={track.detail}>{track.detail}</span>}
                  </span>
                </DropdownMenuCheckboxItem>
              ))
            )}
            {props.canRecoverAudio && props.onRecoverAudio && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={recovery?.busy} onSelect={props.onRecoverAudio}>
                  <span className="truncate">
                    {recovery?.busy ? `Recovering audio · ${Math.round(recoveryRatio * 100)}%` : "Recover audio track"}
                  </span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <MenuButton label="Playback speed">
              <Gauge className="size-4" />
              <span>{props.rate}×</span>
            </MenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="rounded-xl border-border">
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
            <MenuButton
              label="More playback options"
              active={props.rotation !== 0 || props.statsVisible || props.fit !== "contain"}
              className="ml-auto"
            >
              <Ellipsis className="size-4" />
              <span className="hidden sm:inline">More</span>
            </MenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 rounded-xl border-border">
            <DropdownMenuLabel>Frame fit</DropdownMenuLabel>
            {FIT_MODES.map((mode) => (
              <DropdownMenuCheckboxItem key={mode.key} checked={props.fit === mode.key} onCheckedChange={() => props.onFit(mode.key)}>
                {mode.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={props.onRotate}>
              <RotateCw className="size-4" />
              Rotate video (now {props.rotation}°)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onPictureInPicture}>
              <PictureInPicture2 className="size-4" />
              Picture in picture
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onShortcuts}>
              <Keyboard className="size-4" />
              Keyboard shortcuts
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem checked={props.statsVisible} onCheckedChange={props.onToggleStats}>
              Stats overlay
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        primary && "size-11 rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground",
      )}
    >
      {children}
    </button>
  );
}

function MenuButton({
  label,
  active = false,
  className,
  children,
}: {
  label: string;
  active?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "inline-flex h-9 min-w-0 items-center gap-1.5 rounded-xl border border-transparent px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "border-border bg-muted text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
