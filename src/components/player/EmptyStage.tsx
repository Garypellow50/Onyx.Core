import { useRef } from "react";

interface EmptyStageProps {
  onFiles: (files: File[]) => void;
}

export function EmptyStage({ onFiles }: EmptyStageProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="absolute inset-0 isolate flex items-center justify-center overflow-hidden bg-[#171916] px-6 py-10 text-center text-[#f3efe4] sm:px-10">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, rgba(145, 159, 132, 0.18), transparent 24%), radial-gradient(circle at 50% 50%, rgba(243, 239, 228, 0.06), transparent 48%)",
        }}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 320 220"
        className="absolute left-1/2 top-1/2 w-[min(74%,28rem)] -translate-x-1/2 -translate-y-1/2 text-[#91a084] opacity-25"
        fill="none"
      >
        <ellipse cx="160" cy="110" rx="112" ry="76" stroke="currentColor" />
        <ellipse cx="160" cy="110" rx="78" ry="52" stroke="currentColor" />
        <circle cx="160" cy="110" r="23" fill="currentColor" fillOpacity="0.3" />
        <path d="M48 110h224M160 34v152" stroke="currentColor" strokeDasharray="2 10" />
      </svg>

      <div className="relative z-10 flex max-w-lg flex-col items-center">
        <p className="mb-5 font-sans text-[10px] font-semibold uppercase tracking-[0.28em] text-[#a8b39d]">
          Your private screening room
        </p>
        <h2 className="font-display text-balance text-2xl font-medium leading-tight text-[#f3efe4] sm:text-4xl">
          A little space for your next escape.
        </h2>
        <p className="mt-4 max-w-md font-sans text-sm leading-6 text-[#c8c3b8]">
          Choose a film or audio file from this device. Your local media stays in your browser.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length > 0) onFiles(files);
            event.currentTarget.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-7 min-h-11 rounded-full border border-[#a8b39d]/60 bg-[#a8b39d] px-6 py-2.5 font-sans text-sm font-semibold text-[#171916] shadow-[0_12px_40px_rgba(0,0,0,0.24)] transition hover:bg-[#bac4b0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f3efe4] focus-visible:ring-offset-4 focus-visible:ring-offset-[#171916]"
        >
          Choose local media
        </button>
        <p className="mt-3 font-sans text-xs text-[#9f9b92]">Multiple files and subtitle tracks are welcome.</p>
      </div>
    </div>
  );
}
