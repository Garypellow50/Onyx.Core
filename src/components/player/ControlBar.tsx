import { useRef, useState, type ReactNode } from "react";
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
import { Slider } from "@/components/ui/slider";
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
  const progress = duration ? (currentTime / duration) * 100 : 0;
  const activeAudio = props.audioTracks.find((track) => track.enabled);
  const recovery = props.recovery;

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
    <div className="flex min-w-0 flex-col gap-3 rounded-[20px] border border-border bg-card/95 p-3 text-card-foreground shadow-2xl shadow-background/30 backdrop-blur-md sm:p-4">
      <div
        ref={timelineRef}
        className="group relative h-11 min-w-0"
        onPointerMove={(event) => updateHover(event.clientX)}
        onPointerLeave={() => setHoverTime(null)}
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-inset">
          {props.buffered.map(([rawStart, rawEnd], index) => {
            const start = duration ? Math.min(duration, Math.max(0, rawStart)) : 0;
            const end = duration ? Math.min(duration, Math.max(start, rawEnd)) : 0;
            return (
              <span
                key={`${rawStart}-${rawEnd}-${index}`}
                className="absolute inset-y-0 rounded-full bg-muted-foreground/35"
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
          className="cinema-range absolute inset-0 h-11 w-full cursor-pointer"
          min={0}
          max={duration}
          step="any"
          value={currentTime}
          disabled={duration === 0}
          aria-label="Seek through video"
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          onChange={(event) => props.onSeek(Math.min(duration, Math.max(0, event.currentTarget.valueAsNumber)))}
          onKeyDown={(event) => event.stopPropagation()}
          onKeyUp={(event) => event.stopPropagation()}
        />

        {hoverTime !== null && (
          <span
            className="pointer-events-none absolute -top-5 -translate-x-1/2 rounded-lg border border-border bg-background px-2 py-1 text-xs font-medium tabular-nums text-foreground shadow-lg"
            style={{ left: hoverX }}
          >
            {formatTime(hoverTime)}
          </span>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <IconButton
          label={props.playing ? "Pause" : "Play"}
          onClick={props.onTogglePlay}
          primary
        >
          {props.playing ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
        </IconButton>

        <div className="flex items-center">
          <IconButton label="Back 10 seconds" onClick={() => props.onSkip(-10)}>
            <SkipBack className="size-4" />
          </IconButton>
          <IconButton label="Forward 10 seconds" onClick={() => props.onSkip(10)}>
            <SkipForward className="size-4" />
          </IconButton>
        </div>

        <div className="min-w-0 text-sm font-medium tabular-nums">
          <span className="text-foreground">{formatTime(currentTime, duration >= 3600)}</span>
          <span className="mx-1.5 text-muted-foreground">/</span>
          <span className="text-muted-foreground">{formatTime(duration, duration >= 3600)}</span>
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
          <IconButton label={props.muted ? "Unmute" : "Mute"} onClick={props.onToggleMute}>
            {props.muted || props.volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </IconButton>
          <Slider
            className="w-16 sm:w-24"
            value={[props.muted ? 0 : Math.round(props.volume * 100)]}
            max={100}
            step={1}
            onValueChange={(value) => props.onVolume((value[0] ?? 0) / 100)}
            aria-label="Volume"
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1 border-t border-border pt-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <MenuButton label="Captions" active={props.activeSubtitle >= 0}>
              <Captions className="size-4" />
              <span>Captions</span>
            </MenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56 rounded-xl border-border">
            <DropdownMenuLabel>Subtitles</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={props.activeSubtitle === -1} onCheckedChange={() => props.onSubtitle(-1)}>
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
              Load subtitle file…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <MenuButton label="Audio tracks" active={Boolean(recovery?.busy)}>
              <AudioLines className="size-4" />
              <span className="max-w-36 truncate">
                {recovery?.busy
                  ? `Audio ${Math.round(Math.max(0, Math.min(1, recovery.ratio)) * 100)}%${recovery.etaLabel ? ` · ${recovery.etaLabel}` : ""}`
                  : (activeAudio?.label ?? "Audio")}
              </span>
            </MenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-64 rounded-xl border-border">
            <DropdownMenuLabel>Audio tracks</DropdownMenuLabel>
            {props.audioTracks.length === 0 ? (
              <p className="max-w-64 px-2 py-2 text-sm leading-relaxed text-muted-foreground">
                This browser does not expose separate audio tracks for this file.
              </p>
            ) : (
              props.audioTracks.map((track) => (
                <DropdownMenuCheckboxItem
                  key={track.id}
                  checked={track.enabled}
                  onCheckedChange={() => props.onAudioTrack(track.id)}
                >
                  <span className="flex flex-col">
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
                  {recovery?.busy
                    ? `Recovering audio · ${Math.round(Math.max(0, Math.min(1, recovery.ratio)) * 100)}%`
                    : "Recover audio track"}
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
            <MenuButton label="Display options" active={props.rotation !== 0 || props.statsVisible}>
              <Proportions className="size-4" />
              <span>Display</span>
            </MenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56 rounded-xl border-border">
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
            <DropdownMenuItem onSelect={props.onRotate}>
              <RotateCw className="size-4" />
              Rotate video (now {props.rotation}°)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onPictureInPicture}>
              <PictureInPicture2 className="size-4" />
              Picture in picture
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onFullscreen}>
              <Maximize className="size-4" />
              Fullscreen
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={props.onShortcuts}>
              <Keyboard className="size-4" />
              Keyboard shortcuts
            </DropdownMenuItem>
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
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        primary
          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/15 hover:bg-primary/90"
          : "text-muted-foreground hover:bg-background hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function MenuButton({
  label,
  active = false,
  children,
}: {
  label: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-background hover:text-foreground data-[state=open]:bg-background data-[state=open]:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
