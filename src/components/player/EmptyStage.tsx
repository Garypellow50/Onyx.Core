import { ArrowUpRight } from "lucide-react";

export function EmptyStage() {
  return (
    <div className="onyx-empty absolute inset-0 flex items-center justify-center overflow-hidden px-5 py-6 sm:px-8 sm:py-10">
      <div className="onyx-orbit" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className="onyx-empty-copy relative z-10 max-w-lg text-center">
        <p className="onyx-eyebrow">Your private screening room</p>
        <h2>Make room for a great watch.</h2>
        <p>Open a video, an album, or a link. Settle into your own space.</p>
        <a
          href="#media-intake"
          className="onyx-button onyx-button-primary"
        >
          Choose your media
          <ArrowUpRight aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
