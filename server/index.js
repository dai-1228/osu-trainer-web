import express from "express";
import multer from "multer";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import crypto from "crypto";
import rateLimit from "express-rate-limit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const PORT = process.env.PORT || 3001;
const MAX_UPLOAD_MB = 200;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
});

app.set("trust proxy", 1);

const crossOriginHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Content-Disposition",
};

app.use((req, res, next) => {
  for (const [k, v] of Object.entries(crossOriginHeaders)) {
    res.setHeader(k, v);
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

app.use(express.json({ limit: "1mb" }));

const GLOBAL_LIMIT = parseInt(process.env.RATE_LIMIT_GLOBAL_PER_MIN, 10) || 200;
const HEALTH_LIMIT = parseInt(process.env.RATE_LIMIT_HEALTH_PER_MIN, 10) || 30;
const AUDIO_LIMIT = parseInt(process.env.RATE_LIMIT_AUDIO_PER_5MIN, 10) || 10;
const AUDIO_WINDOW = 5 * 60 * 1000;
const GLOBAL_WINDOW = 60 * 1000;
const HEALTH_WINDOW = 60 * 1000;

const globalLimiter = rateLimit({
  windowMs: GLOBAL_WINDOW,
  limit: GLOBAL_LIMIT,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Slow down." },
});

const healthLimiter = rateLimit({
  windowMs: HEALTH_WINDOW,
  limit: HEALTH_LIMIT,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many health checks. Try again in a minute." },
});

const audioLimiter = rateLimit({
  windowMs: AUDIO_WINDOW,
  limit: AUDIO_LIMIT,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Audio processing rate limit exceeded. Try again in a few minutes.",
  },
});

app.use(globalLimiter);

app.get("/api/health", healthLimiter, (req, res) => {
  res.json({
    ok: true,
    ffmpeg: true,
    version: "1.0.0",
    serverMode: true,
  });
});

function buildAtempoChain(multiplier) {
  const stages = [];
  let m = multiplier;
  while (m > 2.0) {
    stages.push("atempo=2.0");
    m /= 2.0;
  }
  while (m < 0.5) {
    stages.push("atempo=0.5");
    m /= 0.5;
  }
  stages.push(`atempo=${m.toFixed(6)}`);
  return stages.join(",");
}

function buildFilterChain(multiplier, changePitch, inputSampleRate) {
  const sr = inputSampleRate || 44100;
  if (changePitch) {
    const newRate = Math.round(sr * multiplier);
    return `asetrate=${newRate},aresample=${sr}`;
  }
  return buildAtempoChain(multiplier);
}

function probeSampleRate(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err || !data || !data.streams) {
        resolve(44100);
        return;
      }
      const audio = data.streams.find((s) => s.codec_type === "audio");
      resolve(audio && audio.sample_rate ? audio.sample_rate : 44100);
    });
  });
}

app.post(
  "/api/process-audio",
  audioLimiter,
  upload.single("audio"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file uploaded" });
    }
    const multiplier = parseFloat(req.body.multiplier);
    const changePitch = req.body.changePitch === "true";
    const highQuality = req.body.highQuality === "true";

    if (!isFinite(multiplier) || multiplier <= 0) {
      return res.status(400).json({ error: "Invalid multiplier" });
    }

    if (Math.abs(multiplier - 1.0) < 0.0001 && !changePitch) {
      res.setHeader("Content-Type", req.file.mimetype || "audio/mpeg");
      res.setHeader("Content-Disposition", 'attachment; filename="output.mp3"');
      return res.send(req.file.buffer);
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "osutrainer-"));
    const inExt = (
      req.file.originalname.split(".").pop() || "mp3"
    ).toLowerCase();
    const inPath = path.join(tmpDir, `input.${inExt}`);
    const outPath = path.join(tmpDir, "output.mp3");

    try {
      await fs.writeFile(inPath, req.file.buffer);

      const inputSampleRate = await probeSampleRate(inPath);
      const filters = buildFilterChain(
        multiplier,
        changePitch,
        inputSampleRate,
      );

      const bitrate = highQuality ? "192k" : "128k";

      await new Promise((resolve, reject) => {
        ffmpeg(inPath)
          .audioFilters(filters)
          .audioBitrate(bitrate)
          .format("mp3")
          .on("error", (err) => reject(err))
          .on("end", () => resolve())
          .save(outPath);
      });

      const outBuf = await fs.readFile(outPath);

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Disposition", 'attachment; filename="output.mp3"');
      res.send(outBuf);
    } catch (err) {
      console.error("[audio] processing failed:", err);
      res
        .status(500)
        .json({ error: "Audio processing failed: " + err.message });
    } finally {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  },
);

const distPath = path.resolve(__dirname, "..", "dist");
app.use(express.static(distPath, { index: "index.html" }));

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found" });
  }
  res.sendFile(path.join(distPath, "index.html"), (err) => {
    if (err) {
      res
        .status(404)
        .send('Not found. Run "npm run build" in the project root first.');
    }
  });
});

app.listen(PORT, () => {
  console.log(`\n  osu! trainer server listening on http://localhost:${PORT}`);
  console.log(`  Serving static files from: ${distPath}`);
  console.log(`  Audio processing: enabled (ffmpeg-static)`);
  console.log(`  COOP/COEP headers: enabled (multi-threaded wasm supported)`);
  console.log(`  Rate limits (per IP):`);
  console.log(
    `    global:        ${GLOBAL_LIMIT} req/${GLOBAL_WINDOW / 1000}s`,
  );
  console.log(
    `    /api/health:   ${HEALTH_LIMIT} req/${HEALTH_WINDOW / 1000}s`,
  );
  console.log(`    /api/process:  ${AUDIO_LIMIT} req/${AUDIO_WINDOW / 1000}s`);
  console.log(
    `    (tune via RATE_LIMIT_GLOBAL_PER_MIN, RATE_LIMIT_HEALTH_PER_MIN, RATE_LIMIT_AUDIO_PER_5MIN env vars)\n`,
  );
});
