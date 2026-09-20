import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

import { MediaPlayer } from "@/components/player/MediaPlayer";

const TITLE = "Onyx.Core | Your personal screening room";
const DESCRIPTION =
  "A quiet, local-first media player. Open your videos, audio, folders, and public links with captions and browser-side audio recovery.";

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
    <div className="studio-shell">
      <a
        href="#workspace"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-primary focus:px-5 focus:py-3 focus:text-primary-foreground"
      >
        Skip to player
      </a>

      <div className="mx-auto flex min-h-screen w-full max-w-[1560px] flex-col">
        <header className="flex min-h-24 items-center justify-between gap-4 border-b border-hairline/70 py-5 sm:min-h-28 sm:py-6">
          <a
            href="/"
            aria-label="Onyx.Core home"
            className="flex min-w-0 items-center gap-3 rounded-xl sm:gap-4"
          >
            <span className="studio-mark" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2.5 21 7.75v8.5L12 21.5 3 16.25v-8.5L12 2.5Z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path d="m10 8 6 4-6 4V8Z" fill="currentColor" />
              </svg>
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-display text-lg font-medium tracking-[-0.04em] text-foreground sm:text-xl">
                Onyx<span className="text-primary">.</span>Core
              </span>
              <span className="hidden text-xs text-muted-foreground min-[390px]:inline">
                A personal screening room
              </span>
            </span>
          </a>

          <div className="flex shrink-0 items-center gap-2 rounded-full border border-hairline bg-panel/60 px-3 py-2 text-xs text-muted-foreground sm:px-4">
            <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
            <span>
              Local-first<span className="hidden sm:inline"> by design</span>
            </span>
          </div>
        </header>

        <main id="workspace" tabIndex={-1} className="min-w-0 flex-1 py-7 outline-none sm:py-10">
          <ClientOnly fallback={<PlayerSkeleton />}>
            <MediaPlayer />
          </ClientOnly>
        </main>

        <footer className="flex flex-col gap-3 border-t border-hairline/70 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:py-6">
          <p>Your files stay yours. Local playback needs no upload.</p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span>
              <kbd className="rounded border border-hairline bg-panel px-1.5 py-0.5 font-mono text-[11px]">
                Space
              </kbd>{" "}
              to pause
            </span>
            <span>
              <kbd className="rounded border border-hairline bg-panel px-1.5 py-0.5 font-mono text-[11px]">
                ?
              </kbd>{" "}
              for shortcuts
            </span>
          </p>
        </footer>
      </div>
    </div>
  );
}

function PlayerSkeleton() {
  return (
    <div role="status" aria-label="Loading your player" className="flex flex-col gap-6">
      <span className="sr-only">Loading your player…</span>
      <div className="h-14 w-64 rounded-xl bg-panel" aria-hidden="true" />
      <div
        className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]"
        aria-hidden="true"
      >
        <div className="aspect-video min-h-[340px] rounded-2xl border border-hairline bg-panel" />
        <div className="h-96 rounded-2xl border border-hairline bg-panel" />
      </div>
    </div>
  );
}
