import { useEffect, useState } from "react";
import { Music, Video } from "lucide-react";

import { canThumbnail, getThumbnail, type ThumbSource } from "@/lib/player/thumbnail";
import { cn } from "@/lib/utils";

/** Small poster tile for a queued item; falls back to a kind icon. */
export function Thumb({
  source,
  kind = "video",
  className,
  fill = false,
}: {
  source: ThumbSource;
  kind?: "video" | "audio";
  className?: string;
  /** Stretch to the container width (tile layouts) instead of a fixed row size. */
  fill?: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!canThumbnail(source)) {
      setSrc(null);
      return;
    }
    void getThumbnail(source).then((result) => {
      if (alive) setSrc(result);
    });
    return () => {
      alive = false;
    };
  }, [source.key, source.name, source.url, source.file]);

  const Icon = kind === "audio" ? Music : Video;

  return (
    <span
      className={cn(
        "flex aspect-video items-center justify-center overflow-hidden rounded-sm border border-hairline bg-inset",
        fill ? "w-full" : "w-14 shrink-0 sm:w-16",
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <Icon className={cn("text-muted-foreground/60", fill ? "size-6" : "size-3.5")} aria-hidden />
      )}
    </span>
  );
}