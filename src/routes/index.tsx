import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";

import logo from "@/assets/onyxcore-logo.png";
import { MediaPlayer } from "@/components/player/MediaPlayer";

const TITLE = "OnyxCore — local-first large media player";
const DESCRIPTION =
  "Play huge video and audio files in the browser at original quality: captions, audio tracks, 10-second skips, rotation, keyboard shortcuts and a verbose step-by-step log.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-4 p-3 sm:gap-6 sm:p-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-hairline pb-3 sm:gap-4 sm:pb-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-4">
          <img
            src={logo}
            alt="OnyxCore logo"
            width={1024}
            height={1024}
            className="size-7 shrink-0 sm:size-8"
          />
          <h1 className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            ONYX<span className="text-primary">.</span>CORE
          </h1>
          <span className="hidden h-4 w-px bg-hairline sm:block" aria-hidden />
          <p className="readout hidden truncate text-xs uppercase tracking-[0.2em] text-muted-foreground sm:block">
            Local media node 01
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />
          <span className="readout text-[9px] uppercase tracking-widest text-foreground sm:text-[10px]">
            system_ready
          </span>
        </div>
      </header>

      <ClientOnly
        fallback={
          <div className="aspect-video w-full animate-pulse rounded-sm border border-hairline bg-panel" />
        }
      >
        <MediaPlayer />
      </ClientOnly>
    </main>
  );
}
