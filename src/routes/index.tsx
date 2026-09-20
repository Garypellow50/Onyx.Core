import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, Focus, Keyboard, MonitorPlay, ShieldCheck } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { MediaPlayer } from "@/components/player/MediaPlayer";
import { ShortcutsDialog } from "@/components/player/ShortcutsDialog";

const TITLE = "Onyx.Core | A little space for your media";
const DESCRIPTION =
  "A considered space for video and audio. Open local files or shared links, with captions, audio controls, and a distraction-free viewing experience.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { name: "theme-color", content: "#121416" },
    ],
  }),
  component: Index,
});

function Index() {
  const [focusMode, setFocusMode] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Let focused controls and portaled menus handle their own keys. The player
  // owns page-level shortcuts on window; those must not also activate here.
  function protectControlKeys(event: KeyboardEvent<HTMLElement>) {
    const target = event.target;
    if (
      event.defaultPrevented ||
      (target instanceof HTMLElement &&
        target.closest(
          'button, a, input, textarea, select, summary, [role="slider"], [role^="menuitem"], [role="dialog"], [contenteditable="true"]',
        ))
    ) {
      event.stopPropagation();
    }
  }

  return (
    <main className="onyx-app" data-focus={focusMode} onKeyDown={protectControlKeys}>
      <a className="onyx-skip-link" href="#workspace">Skip to player</a>
      <header className="onyx-header">
        <a className="onyx-brand" href="#workspace" aria-label="Onyx.Core player">
          <span className="onyx-brand-mark" aria-hidden="true"><span /></span>
          <span>onyx<span className="onyx-brand-dot">.</span>core</span>
        </a>
        <span className="onyx-header-label">A space of your own</span>
        <div className="onyx-header-actions">
          <button
            type="button"
            className="onyx-icon-button"
            onClick={() => setShortcutsOpen(true)}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            <Keyboard size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="onyx-button onyx-focus-toggle"
            aria-pressed={focusMode}
            onClick={() => setFocusMode((value) => !value)}
          >
            <Focus size={16} aria-hidden="true" />
            <span>{focusMode ? "Exit focus" : "Focus mode"}</span>
          </button>
        </div>
      </header>

      <section className="onyx-intro" aria-labelledby="page-title">
        <div>
          <p className="onyx-eyebrow"><span aria-hidden="true" /> THE PERSONAL MEDIA SPACE</p>
          <h1 id="page-title">Just you.<br className="onyx-mobile-break" /> <span>And the moment.</span></h1>
          <p className="onyx-intro-description">Your films, your sound, your pace. A little less noise. A lot more room.</p>
        </div>
        <a className="onyx-intro-link" href="#media-intake" onClick={() => setFocusMode(false)}>
          Open something good <ArrowUpRight size={17} aria-hidden="true" />
        </a>
      </section>

      <section id="workspace" className="onyx-player-host" aria-label="Media workspace" tabIndex={-1}>
        <div className="onyx-workspace-heading">
          <span><MonitorPlay size={16} aria-hidden="true" /> The screening room</span>
          <span className="onyx-workspace-note">Made for your media</span>
        </div>
        <ClientOnly fallback={<div className="onyx-loading" role="status"><span className="onyx-brand-mark" aria-hidden="true"><span /></span><p>Preparing your space...</p></div>}>
          <MediaPlayer />
        </ClientOnly>
      </section>

      <footer className="onyx-footer">
        <p><ShieldCheck size={15} aria-hidden="true" /> Local files play on your device.</p>
        <p>Considered controls. Uninterrupted moments.</p>
        <span className="onyx-footer-signature">ONYX.CORE</span>
      </footer>
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </main>
  );
}
