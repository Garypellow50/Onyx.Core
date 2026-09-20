import { useRef, useState } from "react";
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
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const subInput = useRef<HTMLInputElement>(null);
  const hasDuration = Number.isFinite(props.duration) && props.duration > 0;
  const duration = hasDuration ? props.duration : 0;
  const currentTime = hasDuration && Number.isFinite(props.currentTime)
    ? Math.min(duration, Math.max(0, props.currentTime))
    : 0;
  const progress = hasDuration ? (currentTime / duration) * 100 : 0;
  const activeAudio = props.audioTracks.find((t) => t.enabled);
  const recovery = props.recovery;

  function clampTime(value: number) {
    return hasDuration ? Math.min(duration, Math.max(0, value)) : 0;
  }

  function positionFromEvent(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || !hasDuration) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }

  function seekFromKeyboard(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!hasDuration) return;
    const delta = event.key === "ArrowLeft" ? -5 : event.key === "ArrowRight" ? 5 : event.key === "PageDown" ? -10 : event.key === "PageUp" ? 10 : null;
    if (delta !== null) {
      event.preventDefault();
      props.onSeek(clampTime(currentTime + delta));
    } else if (event.key === "Home") {
      event.preventDefault();
      props.onSeek(0);
    } else if (event.key === "End") {
      event.preventDefault();
      props.onSeek(duration);
    }
  }

  return (
    <div className="onyx-controls panel-machined flex min-w-0 flex-col gap-3 p-2 sm:p-3">
      <div
        ref={trackRef}
        className="group relative h-10 cursor-pointer"
        onMouseMove={(event) => {
          setHoverTime(positionFromEvent(event.clientX));
          const rect = trackRef.current?.getBoundingClientRect();
          setHoverX(rect ? event.clientX - rect.left : 0);
        }}
        onMouseLeave={() => setHoverTime(null)}
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden bg-inset">
          {props.buffered.map(([start, end], index) => (
            <span
              key={`${start}-${end}-${index}`}
              className="absolute inset-y-0 bg-hairline"
              style={{
                left: `${hasDuration ? (clampTime(start) / duration) * 100 : 0}%`,
                width: `${hasDuration ? (Math.max(0, clampTime(end) - clampTime(start)) / duration) * 100 : 0}%`,
              }}
            />
          ))}
          <span className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${progress}%` }} />
        </div>
        <span
          className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 border-2 border-primary bg-foreground shadow-[0_0_10px_color-mix(in_oklab,var(--primary)_50%,transparent)] transition-opacity"
          style={{ left: `${progress}%` }}
        />
        <input
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={currentTime}
          disabled={!hasDuration}
          aria-label="Seek"
          aria-valuetext={hasDuration ? `${formatTime(currentTime, duration >= 3600)} of ${formatTime(duration, duration >= 3600)}` : "Seek unavailable"}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0 disabled:cursor-not-allowed"
          onChange={(event) => props.onSeek(clampTime(Number(event.target.value)))}
          onKeyDown={seekFromKeyboard}
        />
        {hoverTime !== null && hasDuration && (
          <span
            className="readout pointer-events-none absolute -top-7 z-20 -translate-x-1/2 rounded-sm border border-hairline bg-background px-1.5 py-0.5 text-[10px] text-foreground"
            style={{ left: hoverX }}
          >
            {formatTime(hoverTime)}
          </span>
        )}
      </div>

      <div className="onyx-transport flex min-w-0 flex-wrap items-center gap-0.5 sm:gap-1">
        <IconButton label={props.playing ? "Pause" : "Play"} onClick={props.onTogglePlay} pressed={props.playing} className="onyx-play-button">
          {props.playing ? <Pause className="size-5" /> : <Play className="size-5" />}
        </IconButton>
        <IconButton label="Back 10 seconds" onClick={() => props.onSkip(-10)}>
          <SkipBack className="size-4" />
        </IconButton>
        <IconButton label="Forward 10 seconds" onClick={() => props.onSkip(10)}>
          <SkipForward className="size-4" />
        </IconButton>

        <span className="readout ml-1 flex items-center gap-1 text-[10px] sm:gap-1.5 sm:text-[11px]">
          <span className="text-primary">{formatTime(currentTime, duration >= 3600)}</span>
          <span className="text-hairline">/</span>
          <span className="text-muted-foreground">{hasDuration ? formatTime(duration, duration >= 3600) : "--:--"}</span>
        </span>

        <span className="mx-2 hidden h-3 w-px bg-hairline sm:block" aria-hidden />

        <div className="flex min-w-0 items-center gap-1.5">
          <IconButton label={props.muted ? "Unmute" : "Mute"} onClick={props.onToggleMute} pressed={props.muted}>
            {props.muted || props.volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </IconButton>
          <Slider
            className="w-14 sm:w-20"
            value={[props.muted ? 0 : Math.round(props.volume * 100)]}
            max={100}
            step={1}
            onValueChange={(value) => props.onVolume((value[0] ?? 0) / 100)}
            aria-label="Volume level"
          />
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-0.5 sm:ml-auto sm:w-auto sm:flex-nowrap sm:gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="onyx-menu-trigger readout flex min-h-10 items-center gap-1.5 rounded-sm px-2 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground" aria-label="Captions and subtitles">
                <Captions className={cn("size-4", props.activeSubtitle >= 0 && "text-primary")} />
                CC [{props.activeSubtitle >= 0 ? "ON" : "OFF"}]
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Subtitles</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={props.activeSubtitle === -1} onCheckedChange={() => props.onSubtitle(-1)}>Off</DropdownMenuCheckboxItem>
              {props.subtitles.map((track, index) => <DropdownMenuCheckboxItem key={track.id} checked={props.activeSubtitle === index} onCheckedChange={() => props.onSubtitle(index)}>{track.label} · {track.cues} cues</DropdownMenuCheckboxItem>)}
              <DropdownMenuSeparator />
              <button type="button" onClick={() => subInput.current?.click()} className="w-full px-2 py-2 text-left text-sm hover:bg-muted">Load .srt / .vtt / .ass…</button>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="onyx-menu-trigger readout flex min-h-10 items-center gap-1.5 rounded-sm px-2 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground" aria-label="Audio track">
                <AudioLines className="size-4" />
                {recovery?.busy ? `AUDIO ${Math.round(recovery.ratio * 100)}%${recovery.etaLabel ? ` · ${recovery.etaLabel}` : ""}` : (activeAudio?.label ?? "Audio")}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Audio tracks</DropdownMenuLabel>
              {props.audioTracks.length === 0 ? <p className="max-w-56 px-2 py-1.5 text-xs text-muted-foreground">This browser is not exposing separate audio tracks for this file. Chromium exposes them most often; Safari and Firefox usually do not.</p> : props.audioTracks.map((track) => <DropdownMenuCheckboxItem key={track.id} checked={track.enabled} onCheckedChange={() => props.onAudioTrack(track.id)}><span className="flex flex-col"><span>{track.label} {track.language && `(${track.language})`}</span>{track.detail && <span className="readout text-[10px] text-muted-foreground">{track.detail}</span>}</span></DropdownMenuCheckboxItem>)}
              {props.canRecoverAudio && props.onRecoverAudio && <><DropdownMenuSeparator /><button type="button" disabled={recovery?.busy} onClick={props.onRecoverAudio} className="w-full px-2 py-2 text-left text-sm hover:bg-muted disabled:opacity-50">{recovery?.busy ? `Recovering audio — ${Math.round(recovery.ratio * 100)}%` : "Recover audio track (transcode pass)"}</button></>}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="onyx-menu-trigger readout flex min-h-10 items-center gap-1.5 rounded-sm px-2 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground" aria-label="Playback speed"><Gauge className="size-4" />{props.rate}x</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuLabel>Speed</DropdownMenuLabel>{RATES.map((rate) => <DropdownMenuCheckboxItem key={rate} checked={props.rate === rate} onCheckedChange={() => props.onRate(rate)}>{rate}x</DropdownMenuCheckboxItem>)}</DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="onyx-menu-trigger readout flex min-h-10 items-center gap-1.5 rounded-sm px-2 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground" aria-label="Frame fit"><Proportions className="size-4" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuLabel>Frame</DropdownMenuLabel>{FIT_MODES.map((mode) => <DropdownMenuCheckboxItem key={mode.key} checked={props.fit === mode.key} onCheckedChange={() => props.onFit(mode.key)}>{mode.label}</DropdownMenuCheckboxItem>)}<DropdownMenuSeparator /><DropdownMenuCheckboxItem checked={props.statsVisible} onCheckedChange={props.onToggleStats}>Stats overlay</DropdownMenuCheckboxItem></DropdownMenuContent>
          </DropdownMenu>

          <IconButton label={`Rotate (now ${props.rotation}°)`} onClick={props.onRotate} pressed={props.rotation !== 0}><RotateCw className={cn("size-4", props.rotation !== 0 && "text-primary")} /></IconButton>
          <IconButton label="Picture in picture" onClick={props.onPictureInPicture}><PictureInPicture2 className="size-4" /></IconButton>
          <IconButton label="Keyboard shortcuts" onClick={props.onShortcuts}><Keyboard className="size-4" /></IconButton>
          <IconButton label="Fullscreen" onClick={props.onFullscreen}><Maximize className="size-4" /></IconButton>
        </div>
      </div>

      <input ref={subInput} type="file" hidden accept=".srt,.vtt,.ass,.ssa" onChange={(event) => { const file = event.target.files?.[0]; if (file) props.onAddSubtitleFile(file); event.target.value = ""; }} />
    </div>
  );
}

function IconButton({ label, onClick, children, pressed, className }: { label: string; onClick: () => void; children: React.ReactNode; pressed?: boolean; className?: string }) {
  return <button type="button" onClick={onClick} title={label} aria-label={label} aria-pressed={pressed} className={cn("onyx-control-button flex size-10 items-center justify-center rounded-sm text-foreground transition-colors hover:text-primary", className)}>{children}</button>;
}
