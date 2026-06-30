# osu! trainer (web)

# THIS WAS ALL CREATED WITH GLM 5.2 NOT BY ME

A modern, browser-based reimagining of the classic [osu-trainer](https://github.com/FunOrange/osu-trainer) by FunOrange. Drop an `.osz` file, tweak difficulty / BPM, optionally pitch-shift the audio, and download a new `.osz` ready to drag into osu!.

**100% local by default** — your files never leave your browser. All beatmap parsing, audio processing, and `.osz` packaging happen client-side via WebAssembly. Optionally, you can switch to **Server mode** to offload the heavy FFmpeg audio processing to a server (useful on weak devices).

## Features

- **Drag & drop `.osz` loading** — parses every `.osu` difficulty, background image, and audio file inside the zip
- **Live difficulty editing** — HP, CS, AR, OD sliders with lock toggles (AR/OD above 10 are now properly supported)
- **BPM rate control** — change song speed from 0.5× to 2.0× with optional pitch preservation
- **Auto AR/OD scaling** — Approach Rate and Overall Difficulty auto-adjust to the new BPM (just like the original)
- **HR circle size emulation** — apply Hard Rock circle size multiplier (×1.3)
- **Spinner removal** — strip spinners from the beatmap
- **4 saveable profiles** — store and recall presets (persisted in `localStorage`)
- **Audio processing via ffmpeg.wasm** — real `atempo` / `asetrate` filters, not a fake "playback rate" hack
- **Multi-threaded toggle** — switch between the faster MT ffmpeg core (needs COOP/COEP headers) and the universally-compatible ST core, right from the Options panel
- **🆕 Server mode** — optionally offload FFmpeg processing to a Node.js server (see below)
- **Batch generation** — pick multiple rates × multiple difficulties and generate them all into one `.osz` in a single click
- **Difficulty selector** — when an `.osz` has multiple diffs, switch between them with chips at the top
- **Simplified star rating** — for osu!standard maps, computes aim + speed stars (Taiko/Catch/Mania return 0, matching oppai)
- **Search tag** — generated maps get the `osutrainer` tag so you can find them in osu!'s song select

## Processing Mode: Local Browser vs Server

The app supports two processing modes, toggleable from the **Processing Mode** panel in the UI:

### Local Browser (default)

- All audio processing runs in-browser via `ffmpeg.wasm` (WebAssembly)
- Files never leave your device
- Works offline once loaded
- Can be slow on weak devices (phones, old laptops)

### Server

- Audio processing is offloaded to a Node.js server with native FFmpeg
- Significantly faster on weak devices
- The server URL is configurable (leave empty to use the same origin)
- A health-check "Test" button verifies connectivity

To run the server:

```bash
cd server
npm install
npm start
```

The server listens on `http://localhost:3001` and serves both the API and the
built static site. See [`server/README.md`](server/README.md) for full details.

## Tech stack

- **Vanilla JS / HTML / CSS** — no React, no Vue, no framework. Just ES modules.
- **Vite** as the dev server / bundler (the output is plain static files)
- **`@ffmpeg/ffmpeg` + `@ffmpeg/util`** for in-browser audio processing
- **`@ffmpeg/core-mt`** — the **multi-threaded** ffmpeg WASM core (uses pthreads via SharedArrayBuffer for 2–4× faster audio processing)
- **`@ffmpeg/core`** — the **single-threaded** ffmpeg WASM core (works on any host, no special headers needed)
- **JSZip** for `.osz` (zip) read/write
- **Comfortaa + Inter + JetBrains Mono** fonts from Google Fonts
- **Server**: Express + fluent-ffmpeg + ffmpeg-static (optional, for server mode)

## Getting started

### Prerequisites

- Node.js 18+ (for the dev server / build)
- A browser that supports SharedArrayBuffer (all modern browsers do, but the server must send COOP/COEP headers — see below)

### ⚠️ Multi-threading requirement (COOP/COEP headers) — and how to disable it

By default, the app uses the **multi-threaded** ffmpeg core (`@ffmpeg/core-mt`), which requires `SharedArrayBuffer`. Browsers only expose `SharedArrayBuffer` when the page is served in a **cross-origin isolated** context, meaning the server must send these two HTTP headers on every response:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**If you can't set those headers** (e.g. on GitHub Pages), the app still works — just toggle **Multi-threaded (faster)** OFF in the Options panel. This switches to the single-threaded ffmpeg core, which works on any host. The choice is persisted in `localStorage`.

- **`npm run dev` and `npm run preview`** — Vite automatically sends these headers (configured in `vite.config.js`).
- **Static hosting** (GitHub Pages, Netlify, Vercel, nginx, etc.) — you must configure the headers manually. See deployment notes below.
- **Local testing** — use the included `serve_with_coop.py` script instead of `python3 -m http.server`:
  ```bash
  python3 serve_with_coop.py 8084 dist
  ```

If the headers are missing but MT is ON, the app shows an orange "⚠ unsupported here" warning on the toggle and automatically falls back to ST for audio processing.

### Install & run

```bash
cd osu-trainer-web
npm install
npm run dev
```

Then open http://localhost:5173/ in your browser.

### Build for production

```bash
npm run build
```

The static bundle is emitted to `dist/`. Serve it with a server that sets COOP/COEP headers:

```bash
npm run preview                       # uses Vite's preview server (headers auto-set)
# OR
python3 serve_with_coop.py 8084 dist  # custom server with COOP/COEP headers
# ⚠️ `python3 -m http.server` will NOT work — it doesn't set COOP/COEP headers
```

### Deploy

Upload the contents of `dist/` to any static host that supports custom HTTP headers (Netlify, Vercel, Cloudflare Pages, nginx, etc.). You **must** configure COOP/COEP headers for multi-threaded ffmpeg to work.

**Netlify** (`netlify.toml`):

```toml
[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Embedder-Policy = "require-corp"
```

**Vercel** (`vercel.json`):

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

**nginx**:

```nginx
add_header Cross-Origin-Opener-Policy "same-origin";
add_header Cross-Origin-Embedder-Policy "require-corp";
```

**GitHub Pages**: does not support custom headers — but the app still works! Just toggle **Multi-threaded (faster)** OFF in the Options panel. The ST ffmpeg core works on any host. (MT mode will show the orange "⚠ unsupported here" warning and auto-fall back to ST anyway, so you can also just leave it on.)

## How it works

1. **Load `.osz`**: The `.osz` is just a zip. JSZip extracts every file; the first `.osu` is parsed by our custom beatmap parser (`src/osu-parser.js`).
2. **Edit settings**: Sliders call into `BeatmapEditor` (`src/beatmap-editor.js`) which mirrors the original C# class — same lock semantics, same AR/OD scaling math (`src/difficulty-calculator.js`).
3. **Generate**:
   - The working beatmap is cloned and metadata is updated (difficulty name, audio filename, tags).
   - If BPM ≠ 1.0 or `Change Pitch` is on, the audio is run through `ffmpeg.wasm` with an `atempo` filter (tempo-only) or `asetrate`+`aresample` filter (pitch+tempo).
   - The new `.osu` and (optional) new `.mp3` are added to a fresh `.osz` zip alongside the original files.
   - The `.osz` is offered as a browser download.

## Differences from the original

- **No osu! memory reader** — the original app watches the running osu! process and auto-loads the current beatmap. Browsers can't do this, so you drop the `.osz` manually.
- **No global hotkeys** — browser sandbox prevents capturing keystrokes outside the page.
- **No "Clean Up MP3s" button** — there's no Songs folder to manage in a browser context.
- **Simplified star rating** — oppai is a 4k-line C program; we ship a streamlined JS implementation that's typically within ±0.3 stars for osu!standard. For other modes it returns 0 (same as oppai).

## License

MIT — same as the original osu-trainer.

## Credits

- Original osu-trainer by [FunOrange](https://github.com/FunOrange)
- UI design inspiration from [Craftplacer](https://github.com/Craftplacer)'s original osu-trainer skin
- [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) by Jerome Wu
- [oppai-ng](https://github.com/Francesco149/oppai-ng) by Francesco149 (reference for star rating formula)
