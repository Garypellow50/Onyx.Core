import { useState } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Keyboard, ShieldCheck } from "lucide-react";

import { MediaPlayer } from "@/components/player/MediaPlayer";
import { ShortcutsDialog } from "@/components/player/ShortcutsDialog";

const TITLE = "Onyx.Core | Your personal cinema";
const DESCRIPTION =
  "A quiet, local-first player for your video and audio. Open files, folders, or public links with captions, audio recovery, and original-quality video where supported.";

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

  return (
    <div className="app-shell">
      <a href="#player" className="skip-link">
        Skip to player
      </a>
      <header className="app-header">
        <a href="/" className="brand" aria-label="Onyx.Core home">
          <span className="brand-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M8 3h8l5 9-5 9H8l-5-9 5-9Z"
                stroke="currentColor"
                strokeWidth="1.25"
              />
              <path d="m10 8 6 4-6 4V8Z" fill="currentColor" />
            </svg>
          </span>
          <span className="brand-wordmark">
            ONYX<span className="text-chart-2">.</span>CORE
          </span>
        </a>
        <div className="header-actions">
          <span className="quiet-badge">Local-first by design</span>
          <button
            type="button"
            className="icon-action"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts"
            onClick={() => setShortcutsOpen(true)}
          >
            <Keyboard className="size-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <main id="player" tabIndex={-1}>
        <div className="page-intro">
          <p className="eyebrow">The personal cinema</p>
          <h1>Press play. Settle in.</h1>
          <p>Your files. Your screen. A little less in the way.</p>
        </div>
        <ClientOnly
          fallback={
            <div className="player-loading" role="status">
              Preparing your player…
            </div>
          }
        >
          <MediaPlayer />
        </ClientOnly>
      </main>

      <footer className="app-footer">
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="size-3.5 text-chart-2" aria-hidden="true" />
          Local files stay on this device. Remote links use their source provider.
        </span>
        <span>Made for the picture. And the pause.</span>
      </footer>
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
