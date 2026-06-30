# osu! trainer web — server

Optional Node.js server that offloads the heavy FFmpeg audio processing from the
browser. Useful when:

- You're on a weak device (phone, old laptop) where ffmpeg.wasm is slow.
- You want to process many files in batch without freezing your browser.
- You want to use the trainer in a multi-user setting (e.g. shared workstation).

The server is **optional**. The web app works 100% locally without it. The
processing mode can be toggled at any time from the UI.

## Quick start

```bash
cd server
npm install
npm start
```

The server listens on `http://localhost:3001` and:

1. Serves the built static site from `../dist/` (run `npm run build` in the
   project root first).
2. Exposes `POST /api/process-audio` for server-side FFmpeg processing.
3. Sends COOP/COEP headers so the browser's multi-threaded wasm mode still
   works if you switch back to "Local Browser" mode.

Then open `http://localhost:3001` in your browser, drop an .osz file, and
switch to "Server" mode in the **Processing Mode** panel.

## Endpoints

### `GET /api/health`

Returns server status:

```json
{ "ok": true, "ffmpeg": true, "version": "1.0.0", "serverMode": true }
```

### `POST /api/process-audio`

Multipart form data:

| field         | type   | description                          |
|---------------|--------|--------------------------------------|
| `audio`       | File   | The input audio file (mp3, ogg, etc) |
| `multiplier`  | string | Speed multiplier (e.g. `"1.2"`)      |
| `changePitch` | string | `"true"` or `"false"`                |
| `highQuality` | string | `"true"` (192k) or `"false"` (128k)  |

Returns: the processed audio as `audio/mpeg` (MP3).

## Configuring the client

In the web UI, open the **Processing Mode** panel:

- Click **Server** to switch to server-side processing.
- Enter the server URL in the input (leave empty to use the same origin that
  served the page — useful when the server also serves the static files).
- Click **Test** to verify connectivity.

The setting is saved to `localStorage` and persists across sessions.

## Dev mode (Vite proxy)

When developing with `npm run dev` (Vite dev server on port 5173), the
`vite.config.js` proxies `/api/*` to `http://localhost:3001`. So you can run
both simultaneously:

```bash
# Terminal 1: server
cd server && npm start

# Terminal 2: client (with hot reload)
npm run dev
```

Then open `http://localhost:5173`, switch to Server mode, and leave the server
URL empty (the proxy handles it).

## Production deployment

### Option A: Single server (recommended)

```bash
npm run build          # build the client into ../dist
cd server && npm start # serves both the site and the API on one port
```

Open `http://your-server:3001`.

### Option B: Separate static host + API server

Host the `dist/` folder on any static host (Vercel, Netlify, GitHub Pages,
etc.). Run the server separately and enter its URL in the UI's server URL
field.

If the static host and the API server are on different origins, make sure the
API server allows CORS. The included server sets permissive CORS headers by
default.

## Environment variables

| variable | default | description                |
|----------|---------|----------------------------|
| `PORT`   | `3001`  | Port to listen on          |

## Dependencies

- **express** — HTTP server
- **multer** — multipart form parsing
- **fluent-ffmpeg** — FFmpeg Node.js wrapper
- **ffmpeg-static** — statically-linked FFmpeg binary (no system install needed)
