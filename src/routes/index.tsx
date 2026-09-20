import { useState } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, Keyboard, ShieldCheck } from "lucide-react";

import { MediaPlayer } from "@/components/player/MediaPlayer";
import { ShortcutsDialog } from "@/components/player/ShortcutsDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const TITLE = "Onyx.Core | Your personal media player";
const DESCRIPTION =
  "A quieter space for picture and sound. Play local video and audio, add captions, or open a shared source in your browser.";

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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  return (
    <div className="cinema-app">
      <a className="cinema-skip" href="#player-workspace">
        Skip to player
      </a>
      <div className="cinema-shell">
        <header className="cinema-header" onKeyDown={(event) => event.stopPropagation()}>
          <div className="cinema-brand" aria-label="Onyx.Core">
            <svg className="cinema-brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <rect x="3" y="3" width="34" height="34" rx="11" stroke="currentColor" strokeOpacity="0.45" />
              <path d="M13 12.5 27 20l-14 7.5v-15Z" fill="currentColor" />
              <path d="M30.5 12v16" stroke="currentColor" strokeOpacity="0.45" strokeLinecap="round" />
            </svg>
            <div>
              <p className="cinema-wordmark">ONYX<span>.</span>CORE</p>
              <p className="cinema-brand-caption">Personal media player</p>
            </div>
          </div>
          <div className="cinema-header-actions">
            <span className="cinema-local-badge">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Local-first
            </span>
            <button
              type="button"
              className="cinema-quiet-button"
              aria-label="Open keyboard shortcuts"
              onClick={() => setShortcutsOpen(true)}
            >
              <Keyboard className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Shortcuts</span>
            </button>
          </div>
        </header>

        <main>
          <section className="cinema-intro" aria-labelledby="welcome-title">
            <div>
              <p className="cinema-eyebrow">Less noise. More presence.</p>
              <h1 id="welcome-title">Your media.<br /><em>A quieter place.</em></h1>
            </div>
            <p className="cinema-intro-copy">
              A personal space for picture and sound.<br />
              Open a file, choose a folder, or bring a link.
            </p>
          </section>

          <div id="player-workspace" className="cinema-player" tabIndex={-1} aria-label="Media player workspace">
            <ClientOnly fallback={<div className="cinema-loading" role="status">Preparing your player…</div>}>
              <MediaPlayer />
            </ClientOnly>
          </div>
        </main>

        <footer className="cinema-footer" onKeyDown={(event) => event.stopPropagation()}>
          <p>Made for your files. Local playback, without an upload.</p>
          <button type="button" onClick={() => setPrivacyOpen(true)}>
            About your files <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </button>
        </footer>
      </div>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
        <DialogContent
          className="max-h-[85svh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border-hairline bg-popover p-6 sm:p-8"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-medium">Your files, in focus.</DialogTitle>
            <DialogDescription className="pt-2 leading-relaxed">
              Onyx.Core plays media in your browser. Here is what happens to your sources.
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-5 text-sm leading-relaxed">
            <div>
              <dt className="font-medium text-foreground">Local stays local</dt>
              <dd className="mt-1 text-muted-foreground">Files you choose from this device are read locally. Format conversion and audio recovery run in a browser worker.</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Links use the network</dt>
              <dd className="mt-1 text-muted-foreground">Remote media is fetched from its host. Shared folder listings and sources blocked by browser access rules may pass through the app server.</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Captions welcome</dt>
              <dd className="mt-1 text-muted-foreground">Add SRT, VTT, ASS, or SSA files alongside your media, or use the captions menu during playback.</dd>
            </div>
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
}
