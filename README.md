# ONYX.CORE

### A local media node for the files browsers usually give up on.

<p align="center">
	<img src="src/assets/onyxcore-logo.png" alt="OnyxCore" width="96" />
</p>

<p align="center">
	<strong>Drop a file. Paste a source. Press play.</strong><br />
	OnyxCore keeps the original picture, repairs the browser's missing pieces, and leaves the library where it started.
</p>

<p align="center">
	<code>LOCAL-FIRST</code> &nbsp; <code>RANGE-AWARE</code> &nbsp; <code>FFMPEG.WASM</code> &nbsp; <code>NO UPLOAD REQUIRED</code>
</p>

---

## The premise

The browser is an excellent screen and an opinionated demuxer. OnyxCore is the layer between those two facts.

It is a single-screen player for large video and audio sources: local files, whole folders, direct URLs, and public shared folders. Native formats go straight to the media element. Formats the browser refuses are remuxed in a worker with `ffmpeg.wasm`; when only the audio codec is a problem, the video stays untouched and a browser-friendly audio track is recovered alongside it.

The result is deliberately quiet: media is selected in the browser, playback state is readable, and the source does not become someone else's upload.

## A source becomes a screen

```text
	LOCAL FILES / FOLDERS       DIRECT URL       PUBLIC SHARED FOLDER
					|                       |                    |
					|                  range probe        server-side listing
					|                       |                    |
					+-----------------------+--------------------+
																	v
													 SOURCE INTAKE
																	|
								 +----------------+----------------+
								 |                                 |
					browser-native                     needs conversion
								 |                                 |
					HTML media element              ffmpeg.wasm worker
								 |                                 |
								 +----------------+----------------+
																	v
												 MEDIA PLAYER + QUEUE
```

For a closer look at the implementation, start at [MediaPlayer](src/components/player/MediaPlayer.tsx), then follow the source decision in [media.ts](src/lib/player/media.ts).

## What it can do

| Area | Capability |
| --- | --- |
| Intake | Drag and drop, multi-file selection, browser directory selection, direct HTTP(S) URLs |
| Cloud sources | Public Google Drive, OneDrive, Dropbox, and SharePoint links; shared-folder browsing where the provider exposes it |
| Playback | Queue navigation, seek, volume, mute, playback rate from `0.25x` to `4x`, fullscreen, picture-in-picture |
| Picture | Original-quality video stream copy where possible, rotation, contain/fill/zoom modes, thumbnails |
| Sound | Selectable audio tracks and local recovery for browser-missing AC-3, E-AC-3, DTS, TrueHD, and similar tracks |
| Captions | `.srt`, `.vtt`, `.ass`, and `.ssa` files converted into selectable browser captions |
| Inspection | Resolution, frame rate, dropped frames, buffer ranges, estimated bitrate, detected container, heap, and worker-core readouts |
| Memory | Windowed Matroska/WebM remuxing through `MediaSource`, keeping working memory roughly flat as source size grows |
| Operations | Keyboard shortcuts, touch gestures, persisted display preferences, resume position, and filterable engineering logs |

## Start here

### Requirements

- Node.js with npm
- A modern browser with Web Workers, WebAssembly, `MediaSource`, Blob URLs, Canvas, and `localStorage`
- Enough memory for the source when using whole-file remuxing or audio recovery

### Run locally

```sh
git clone https://github.com/Garypellow50/Onyx.Core.git
cd Onyx.Core
npm install
npm run dev
```

Open the local URL printed by Vite. The first unsupported-format playback downloads the bundled ffmpeg engine from `public/ffmpeg` and starts it in a browser worker.

### Use the player

1. Add media with **Files**, **Folder**, or drag and drop.
2. Paste a direct media URL, or paste a public shared folder link and choose its entries.
3. Add subtitle files in the same intake area when captions are needed.
4. Select a queue item. OnyxCore probes the source and chooses native playback or the smallest conversion path it needs.
5. Open the stats and log surfaces when you need to see what the browser, network, or remux worker is doing.

For remote files, sharing must allow anonymous access, and byte ranges are strongly recommended for responsive seeking. A host that blocks browser CORS is retried through the app's range-aware relay.

## Format desk

### Accepted by extension

**Video:** `mp4` `m4v` `webm` `mkv` `mov` `avi` `ts` `m2ts` `mts` `flv` `wmv` `mpg` `mpeg` `ogv` `3gp`

**Audio:** `mp3` `m4a` `aac` `flac` `wav` `ogg` `oga` `opus` `wma` `alac`

**Subtitles:** `vtt` `srt` `ass` `ssa`

### The conversion rule

| Source shape | OnyxCore's response |
| --- | --- |
| MP4, MOV, WebM, and common browser-native audio | Direct playback when the browser reports support |
| Matroska/WebM needing a demux bridge | Bounded range reads, cluster-aware remux, fragmented MP4 appended to `MediaSource` |
| AVI, ASF/WMV, FLV, and MPEG-PS | Whole-file ffmpeg remux because their indexes are not window-safe |
| Unsupported audio inside an otherwise usable file | Extract the selected track and encode it to AAC/MP4 or Opus/WebM; video is not re-encoded |

An extension is only the opening hint. OnyxCore also checks the browser's declared support and sniffs the first bytes for the actual container.

## Architecture, in the shape it runs

```text
React UI
	-> MediaPlayer
		 -> SourceIntake / Playlist / ControlBar
		 -> media probe + container sniff
				-> native HTMLMediaElement
				-> stream-remux -> MediaSource
				-> file-remux -> Blob URL
				-> audio-transcode -> recovered audio element

TanStack Start server routes
	-> /api/public/folder  : list public provider folders
	-> /api/public/stream  : relay public media with Range support

Static runtime assets
	-> public/ffmpeg       : ffmpeg worker, core, and WebAssembly binary
```

The application is built with:

- React 19 and TypeScript
- TanStack Start and TanStack Router
- Vite
- Tailwind CSS 4
- `ffmpeg.wasm` for browser-side remuxing and audio recovery

Useful entry points:

- [The player surface](src/components/player/MediaPlayer.tsx)
- [Source intake](src/components/player/SourceIntake.tsx)
- [Media classification and probing](src/lib/player/media.ts)
- [Windowed remux pipeline](src/lib/player/stream-remux.ts)
- [Whole-file remux pipeline](src/lib/player/file-remux.ts)
- [Audio recovery](src/lib/player/audio-transcode.ts)
- [Remote source probing](src/lib/player/remote.ts)
- [Range-aware relay](src/routes/api/public/stream.ts)
- [Folder listing route](src/routes/api/public/folder.ts)

## Boundaries worth knowing

- Local files are read by the browser and are not uploaded as part of the local playback path.
- Remote URLs still depend on the provider: expired links, private files, download quotas, HTML confirmation pages, and missing range support can affect playback.
- The relay blocks loopback and private-network hostnames, but it is still a server-side fetch path. Deploy it with the same care you would apply to any public proxy endpoint.
- Whole-file remuxing and audio recovery need the source in memory. Very large unsupported files can therefore be limited by browser memory even though windowed Matroska playback is designed to avoid that cost.
- Fullscreen, picture-in-picture, clipboard copy, and directory picking vary with browser support and permissions.
- There is currently no automated test script in `package.json`; lint and production build are the available repository checks.

## Repository commands

```sh
npm run dev       # Start the Vite development server
npm run build     # Create a production build
npm run build:dev # Create a development-mode build
npm run preview   # Serve the production build locally
npm run lint      # Run ESLint
npm run format    # Format the repository with Prettier
```

## Project shape

```text
src/
	components/player/  The instrument panel: intake, player, queue, controls, logs
	lib/player/         Media probing, links, remuxing, subtitles, state, diagnostics
	routes/              App shell plus public folder and stream server routes
	assets/              OnyxCore visual identity
public/ffmpeg/         Browser worker and WebAssembly runtime assets
```

## Status

OnyxCore is an actively evolving browser media tool. Its most important promise is also its design constraint: make difficult media playable without turning a personal file into a mandatory upload.

<p align="center">
	<sub>ONYX.CORE / LOCAL MEDIA NODE 01 / SYSTEM_READY</sub>
</p>
