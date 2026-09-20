import { useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
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
  const currentTime = Math.min(duration, Math.max(0, props.currentTime || 0));
  const progress = hasDuration ? (currentTime / duration) * 100 : 0;
  const activeAudio = props.audioTracks.find((track) => track.enabled);
  const recovery = props.recovery;

  function positionFromEvent(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || !hasDuration) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }

  return (
    <div
      className="cinema-controls flex min-w-0 flex-col gap-3 rounded-2xl border border-border/60 bg-card/95 p-3 text-card-foreground shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-md sm:gap-4 sm:p-4"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div
        ref={trackRef}
        className={cn("group relative h-7", hasDuration ? "cursor-pointer" : "cursor-not-allowed opacity-50")}
        onPointerMove={(event) => {
          if (event.pointerType !== "mouse" || !hasDuration) return;
          setHoverTime(positionFromEvent(event.clientX));
          const rect = trackRef.current?.getBoundingClientRect();
          setHoverX(rect ? Math.min(rect.width, Math.max(0, event.clientX - rect.left)) : 0);
        }}
        onPointerLeave={() => setHoverTime(null)}
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
          {props.buffered.map(([start, end], index) => {
            const safeStart = Math.min(duration, Math.max(0, start));
            const safeEnd = Math.min(duration, Math.max(safeStart, end));
            return (
              <span
                key={`${start}-${end}-${index}`}
                className="absolute inset-y-0 rounded-full bg-muted-foreground/35"
                style={{
                  left: `${hasDuration ? (safeStart / duration) * 100 : 0}%`,
                  width: `${hasDuration ? ((safeEnd - safeStart) / duration) * 100 : 0}%`,
                }}
              />
            );
          })}
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span
          className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary-foreground shadow-sm transition-transform group-focus-within:scale-110 group-hover:scale-110"
          style={{ left: `${progress}%` }}
        />
        <input
          type="range"
          min={0}
          max={duration}
          step="any"
          value={currentTime}
          disabled={!hasDuration}
          aria-label="Seek through video"
          aria-valuetext={`${formatTime(currentTime, duration >= 3600)} of ${formatTime(duration, duration >= 3600)}`}
          onChange={(event) => props.onSeek(Number(event.currentTarget.value))}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0 disabled:cursor-not-allowed [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-7 [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7"
        />
        {hoverTime !== null && (
          <span
            className="pointer-events-none absolute -top-8 z-20 -translate-x-1/2 rounded-lg border border-border/70 bg-popover px-2 py-1 text-xs tabular-nums text-popover-foreground shadow-md"
            style={{ left: hoverX }}
          >
            {formatTime(hoverTime, duration >= 3600)}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-2.5 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-1">
          <IconButton
            label={props.playing ? "Pause" : "Play"}
            onClick={props.onTogglePlay}
            emphasis
          >
            {props.playing ? <Pause className="size-5" /> : <Play className="size-5 fill-current" />}
          </IconButton>
          <IconButton label="Back 10 seconds" onClick={() => props.onSkip(-10)}>
            <SkipBack className="size-[18px]" />
          </IconButton>
          <IconButton label="Forward 10 seconds" onClick={() => props.onSkip(10)}>
            <SkipForward className="size-[18px]" />
          </IconButton>

          <span className="ml-1 whitespace-nowrap text-sm tabular-nums text-muted-foreground sm:ml-2">
            <span className="font-medium text-foreground">
              {formatTime(currentTime, duration >= 3600)}
            </span>
            <span className="mx-1.5 text-border">/</span>
            {formatTime(duration, duration >= 3600)}
          </span>

          <span className="mx-2 hidden h-6 w-px bg-border/70 sm:block" aria-hidden />

          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <IconButton label={props.muted ? "Unmute" : "Mute"} onClick={props.onToggleMute}>
              {props.muted || props.volume === 0 ? (
                <VolumeX className="size-[18px]" />
              ) : (
                <Volume2 className="size-[18px]" />
              )}
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

        <div className="flex min-w-0 flex-wrap items-center gap-1 lg:ml-auto lg:flex-nowrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <MenuButton
                label="Captions and subtitles"
                active={props.activeSubtitle >= 0}
                icon={<Captions className="size-[18px]" />}
              >
                <span className="hidden xl:inline">
                  {props.activeSubtitle >= 0 ? "Captions on" : "Captions off"}
                </span>
              </MenuButton>
            </DropdownMenuTrigger>
            <CinemaMenuContent align="end">
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
              <MenuAction onClick={() => subInput.current?.click()}>
                Load .srt, .vtt, or .ass…
              </MenuAction>
            </CinemaMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <MenuButton label="Audio track" icon={<AudioLines className="size-[18px]" />}>
                <span className="hidden max-w-40 truncate xl:inline">
                  {recovery?.busy
                    ? `Recovering ${Math.round(recovery.ratio * 100)}%${recovery.etaLabel ? ` · ${recovery.etaLabel}` : ""}`
                    : (activeAudio?.label ?? "Audio")}
                </span>
              </MenuButton>
            </DropdownMenuTrigger>
            <CinemaMenuContent align="end">
              <DropdownMenuLabel>Audio tracks</DropdownMenuLabel>
              {props.audioTracks.length === 0 ? (
                <p className="max-w-64 px-2 py-2 text-sm leading-relaxed text-muted-foreground">
                  This browser does not expose separate audio tracks for this file. Chromium exposes
                  them most often. Safari and Firefox usually do not.
                </p>
              ) : (
                props.audioTracks.map((track) => (
                  <DropdownMenuCheckboxItem
                    key={track.id}
                    checked={track.enabled}
                    onCheckedChange={() => props.onAudioTrack(track.id)}
                  >
                    <span className="flex flex-col gap-0.5">
                      <span>
                        {track.label} {track.language && `(${track.language})`}
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
                  <MenuAction disabled={recovery?.busy} onClick={props.onRecoverAudio}>
                    {recovery?.busy
                      ? `Recovering audio · ${Math.round(recovery.ratio * 100)}%`
                      : "Recover audio track"}
                  </MenuAction>
                </>
              )}
            </CinemaMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <MenuButton label="Playback speed" icon={<Gauge className="size-[18px]" />}>
                {props.rate}×
              </MenuButton>
            </DropdownMenuTrigger>
            <CinemaMenuContent align="end">
              <DropdownMenuLabel>Playback speed</DropdownMenuLabel>
              {RATES.map((rate) => (
                <DropdownMenuCheckboxItem
                  key={rate}
                  checked={props.rate === rate}
                  onCheckedChange={() => props.onRate(rate)}
                >
                  {rate}×
                </DropdownMenuCheckboxItem>
              ))}
            </CinemaMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <MenuButton label="Frame fit" icon={<Proportions className="size-[18px]" />} />
            </DropdownMenuTrigger>
            <CinemaMenuContent align="end">
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
            </CinemaMenuContent>
          </DropdownMenu>

          <IconButton label={`Rotate (now ${props.rotation}°)`} onClick={props.onRotate}>
            <RotateCw className={cn("size-[18px]", props.rotation !== 0 && "text-primary")} />
          </IconButton>
          <IconButton label="Picture in picture" onClick={props.onPictureInPicture}>
            <PictureInPicture2 className="size-[18px]" />
          </IconButton>
          <IconButton label="Keyboard shortcuts" onClick={props.onShortcuts}>
            <Keyboard className="size-[18px]" />
          </IconButton>
          <IconButton label="Fullscreen" onClick={props.onFullscreen}>
            <Maximize className="size-[18px]" />
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

function CinemaMenuContent({
  className,
  sideOffset = 8,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>) {
  const fullscreenContainer =
    typeof document === "undefined" ? undefined : (document.fullscreenElement ?? undefined);

  return (
    <DropdownMenuPrimitive.Portal container={fullscreenContainer}>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-44 overflow-y-auto overflow-x-hidden rounded-xl border border-border/70 bg-popover/95 p-1.5 text-popover-foreground shadow-xl backdrop-blur-md",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        onKeyDown={(event) => event.stopPropagation()}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function MenuButton({
  label,
  icon,
  active = false,
  children,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-primary/10 text-primary",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function MenuAction({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "flex min-h-10 w-full items-center rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function IconButton({
  label,
  onClick,
  children,
  emphasis = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        emphasis && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
      )}
    >
      {children}
    </button>
  );
}
