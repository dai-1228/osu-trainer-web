export const GameMode = {
  osu: 0,
  Taiko: 1,
  CatchtheBeat: 2,
  Mania: 3,
};

const MODE_NAMES = ["osu!", "Taiko", "Catch the Beat", "osu!mania"];

export function modeName(m) {
  return MODE_NAMES[m] ?? "Unknown";
}

export function normalizeText(str) {
  if (str == null) return "";
  return String(str).replace(/["*\\/?<>|:]/g, "");
}

export function parseBeatmap(text, filename) {
  const bm = new Beatmap();
  bm.filename = filename || "";

  const lines = text.split(/\r?\n/);
  let section = "";
  let comboColors = [];
  let customColors = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === "") continue;
    if (raw.startsWith("//")) continue;

    if (raw.startsWith("osu file format v")) {
      bm.formatVersion = parseInt(raw.slice(17), 10);
      continue;
    }

    const secMatch = raw.match(/^\[(.+)\]$/);
    if (secMatch) {
      section = secMatch[1];
      continue;
    }

    if (section === "General") {
      const kv = parseKV(raw);
      if (!kv) continue;
      switch (kv.k) {
        case "AudioFilename":
          bm.audioFilename = kv.v;
          break;
        case "AudioLeadIn":
          bm.audioLeadIn = +kv.v;
          break;
        case "PreviewTime":
          bm.previewTime = +kv.v;
          break;
        case "Countdown":
          bm.countdown = +kv.v;
          break;
        case "SampleSet":
          bm.sampleSet = kv.v;
          break;
        case "StackLeniency":
          bm.stackLeniency = parseFloat(kv.v);
          break;
        case "Mode":
          bm.mode = parseInt(kv.v, 10);
          break;
        case "LetterboxInBreaks":
          bm.letterboxInBreaks = +kv.v === 1;
          break;
        case "SpecialStyle":
          bm.specialStyle = +kv.v === 1;
          break;
        case "WidescreenStoryboard":
          bm.widescreenStoryboard = +kv.v === 1;
          break;
      }
    } else if (section === "Editor") {
    } else if (section === "Metadata") {
      const kv = parseKV(raw);
      if (!kv) continue;
      switch (kv.k) {
        case "Title":
          bm.title = kv.v;
          break;
        case "TitleUnicode":
          bm.titleUnicode = kv.v;
          break;
        case "Artist":
          bm.artist = kv.v;
          break;
        case "ArtistUnicode":
          bm.artistUnicode = kv.v;
          break;
        case "Creator":
          bm.creator = kv.v;
          break;
        case "Version":
          bm.version = kv.v;
          break;
        case "Source":
          bm.source = kv.v;
          break;
        case "Tags":
          bm.tags = kv.v.split(/\s+/).filter(Boolean);
          break;
        case "BeatmapID":
          bm.beatmapID = parseInt(kv.v, 10);
          break;
        case "BeatmapSetID":
          bm.beatmapSetID = parseInt(kv.v, 10);
          break;
      }
    } else if (section === "Difficulty") {
      const kv = parseKV(raw);
      if (!kv) continue;
      switch (kv.k) {
        case "HPDrainRate":
          bm.hpDrainRate = parseFloat(kv.v);
          break;
        case "CircleSize":
          bm.circleSize = parseFloat(kv.v);
          break;
        case "OverallDifficulty":
          bm.overallDifficulty = parseFloat(kv.v);
          break;
        case "ApproachRate":
          bm.approachRate = parseFloat(kv.v);
          bm._explicitAR = true;
          break;
        case "SliderMultiplier":
          bm.sliderMultiplier = parseFloat(kv.v);
          break;
        case "SliderTickRate":
          bm.sliderTickRate = parseFloat(kv.v);
          break;
      }
    } else if (section === "Events") {
      const m = raw.match(/^0\s*,\s*0\s*,\s*"([^"]+)"/);
      if (m) bm.background = m[1];
    } else if (section === "TimingPoints") {
      const tp = parseTimingPoint(raw);
      if (tp) bm.timingPoints.push(tp);
    } else if (section === "HitObjects") {
      const ho = parseHitObject(raw);
      if (ho) bm.hitObjects.push(ho);
    } else if (section === "Colours") {
      const kv = parseKV(raw);
      if (!kv) continue;
      if (kv.k.startsWith("Combo")) {
        comboColors.push(parseColor(kv.v));
      } else {
        customColors.push({ k: kv.k, v: kv.v });
      }
    }
  }

  if (bm.approachRate == null || bm.approachRate < 0) {
    bm.approachRate = bm.overallDifficulty;
  }

  bm.computeBPM();

  bm.valid = !!bm.title;
  bm.comboColors = comboColors;
  bm.customColors = customColors;
  return bm;
}

function parseKV(line) {
  const idx = line.indexOf(":");
  if (idx < 0) return null;
  return { k: line.slice(0, idx).trim(), v: line.slice(idx + 1).trim() };
}

function parseColor(s) {
  return s.split(",").map((n) => parseInt(n.trim(), 10));
}

function parseTimingPoint(line) {
  const parts = line.split(",");
  if (parts.length < 2) return null;
  const time = parseFloat(parts[0]);
  const beatLength = parseFloat(parts[1]);
  const meter = parts.length > 2 ? parseInt(parts[2], 10) : 4;
  const sampleSet = parts.length > 3 ? parseInt(parts[3], 10) : 1;
  const sampleIndex = parts.length > 4 ? parseInt(parts[4], 10) : 0;
  const volume = parts.length > 5 ? parseInt(parts[5], 10) : 100;
  const uninherited =
    parts.length > 6 ? parseInt(parts[6], 10) === 1 : beatLength > 0;
  const effects = parts.length > 7 ? parseInt(parts[7], 10) : 0;
  return {
    time,
    beatLength,
    meter,
    sampleSet,
    sampleIndex,
    volume,
    uninherited,
    effects,
  };
}

function parseHitObject(line) {
  const parts = line.split(",");
  if (parts.length < 5) return null;
  const x = parseInt(parts[0], 10);
  const y = parseInt(parts[1], 10);
  const time = parseInt(parts[2], 10);
  const type = parseInt(parts[3], 10);
  const hitSound = parseInt(parts[4], 10);
  const obj = { x, y, time, type, hitSound, raw: line };

  obj.isCircle = (type & 1) !== 0;
  obj.isSlider = (type & 2) !== 0;
  obj.isSpinner = (type & 8) !== 0;
  obj.isHold = (type & 128) !== 0;
  if (obj.isSlider && parts.length > 5) {
    obj.sliderParams = parts[5];
    obj.slides = parts.length > 6 ? parseInt(parts[6], 10) : 1;
    obj.length = parts.length > 7 ? parseFloat(parts[7]) : 0;
  }
  if (obj.isSpinner && parts.length > 5) {
    obj.endTime = parseInt(parts[5], 10);
  }
  if (obj.isHold && parts.length > 5) {
    const pp = parts[5].split(":");
    obj.endTime = parseInt(pp[0], 10);
  }
  return obj;
}

export class Beatmap {
  constructor() {
    this.formatVersion = 14;

    this.audioFilename = "";
    this.audioLeadIn = 0;
    this.previewTime = -1;
    this.countdown = 0;
    this.sampleSet = "Normal";
    this.stackLeniency = 0.7;
    this.mode = 0;
    this.letterboxInBreaks = false;
    this.specialStyle = false;
    this.widescreenStoryboard = true;

    this.title = "";
    this.titleUnicode = "";
    this.artist = "";
    this.artistUnicode = "";
    this.creator = "";
    this.version = "";
    this.source = "";
    this.tags = [];
    this.beatmapID = 0;
    this.beatmapSetID = -1;

    this.hpDrainRate = 5;
    this.circleSize = 4;
    this.overallDifficulty = 5;
    this.approachRate = 5;
    this._explicitAR = false;
    this.sliderMultiplier = 1.4;
    this.sliderTickRate = 1;

    this.background = "";

    this.timingPoints = [];

    this.hitObjects = [];

    this.comboColors = [];
    this.customColors = [];

    this.bpm = 0;
    this.minBpm = 0;
    this.maxBpm = 0;
    this.filename = "";
    this.valid = false;
  }

  get hitObjectCount() {
    return this.hitObjects.length;
  }

  computeBPM() {
    const uninherited = this.timingPoints.filter(
      (tp) => tp.uninherited && tp.beatLength > 0,
    );
    if (uninherited.length === 0) {
      this.bpm = this.minBpm = this.maxBpm = 0;
      return;
    }

    const bpms = uninherited.map((tp) => 60000 / tp.beatLength);

    let dominant = bpms[0];
    let bestDur = 0;
    for (let i = 0; i < uninherited.length; i++) {
      const start = uninherited[i].time;
      const end =
        i + 1 < uninherited.length ? uninherited[i + 1].time : Infinity;
      const dur = end - start;
      if (dur > bestDur) {
        bestDur = dur;
        dominant = bpms[i];
      }
    }
    this.bpm = dominant;
    this.minBpm = Math.min(...bpms);
    this.maxBpm = Math.max(...bpms);
  }

  setRate(multiplier) {
    if (multiplier <= 0) return;

    for (const tp of this.timingPoints) {
      tp.time = Math.round(tp.time / multiplier);
      if (tp.uninherited) {
        tp.beatLength = tp.beatLength / multiplier;
      }
    }

    for (const ho of this.hitObjects) {
      ho.time = Math.round(ho.time / multiplier);
      if (ho.isSpinner && ho.endTime != null) {
        ho.endTime = Math.round(ho.endTime / multiplier);
      }
      if (ho.isHold && ho.endTime != null) {
        ho.endTime = Math.round(ho.endTime / multiplier);
      }
      if (ho.isSlider && ho.length != null) {
        ho.length = ho.length / multiplier;
      }
    }

    if (this.previewTime > 0)
      this.previewTime = Math.round(this.previewTime / multiplier);
    this.audioLeadIn = Math.round(this.audioLeadIn / multiplier);

    this.computeBPM();
  }

  removeSpinners() {
    this.hitObjects = this.hitObjects.filter((ho) => !ho.isSpinner);
  }

  clone() {
    const b = new Beatmap();
    Object.assign(b, this);
    b.tags = this.tags.slice();
    b.timingPoints = this.timingPoints.map((tp) => ({ ...tp }));
    b.hitObjects = this.hitObjects.map((ho) => ({ ...ho }));
    b.comboColors = this.comboColors.map((c) => c.slice());
    b.customColors = this.customColors.map((c) => ({ ...c }));
    return b;
  }

  serialize() {
    const out = [];
    out.push(`osu file format v${this.formatVersion}`);
    out.push("");

    out.push("[General]");
    out.push(`AudioFilename: ${this.audioFilename}`);
    out.push(`AudioLeadIn: ${this.audioLeadIn}`);
    out.push(`PreviewTime: ${this.previewTime}`);
    out.push(`Countdown: ${this.countdown}`);
    out.push(`SampleSet: ${this.sampleSet}`);
    out.push(`StackLeniency: ${this.stackLeniency}`);
    out.push(`Mode: ${this.mode}`);
    out.push(`LetterboxInBreaks: ${this.letterboxInBreaks ? 1 : 0}`);
    if (this.mode === 3) out.push(`SpecialStyle: ${this.specialStyle ? 1 : 0}`);
    out.push(`WidescreenStoryboard: ${this.widescreenStoryboard ? 1 : 0}`);
    out.push("");

    out.push("[Editor]");
    out.push(`DistanceSpacing: 1.5`);
    out.push(`BeatDivisor: 4`);
    out.push(`GridSize: 32`);
    out.push(`TimelineZoom: 1`);
    out.push("");

    out.push("[Metadata]");
    out.push(`Title:${this.title}`);
    if (this.titleUnicode) out.push(`TitleUnicode:${this.titleUnicode}`);
    out.push(`Artist:${this.artist}`);
    if (this.artistUnicode) out.push(`ArtistUnicode:${this.artistUnicode}`);
    out.push(`Creator:${this.creator}`);
    out.push(`Version:${this.version}`);
    out.push(`Source:${this.source || ""}`);
    out.push(`Tags:${this.tags.join(" ")}`);
    out.push(`BeatmapID:${this.beatmapID}`);
    out.push(`BeatmapSetID:${this.beatmapSetID}`);
    out.push("");

    out.push("[Difficulty]");
    out.push(`HPDrainRate:${round1(this.hpDrainRate)}`);
    out.push(`CircleSize:${round1(this.circleSize)}`);
    out.push(`OverallDifficulty:${round1(this.overallDifficulty)}`);

    out.push(`ApproachRate:${round1(this.approachRate)}`);
    out.push(`SliderMultiplier:${this.sliderMultiplier}`);
    out.push(`SliderTickRate:${this.sliderTickRate}`);
    out.push("");

    out.push("[Events]");
    out.push("//Background and Video events");
    if (this.background) {
      out.push(`0,0,"${this.background}",0,0`);
    }
    out.push("//Break Periods");
    out.push("//Storyboard Layer 0 (Background)");
    out.push("//Storyboard Layer 1 (Fail)");
    out.push("//Storyboard Layer 2 (Pass)");
    out.push("//Storyboard Layer 3 (Foreground)");
    out.push("//Storyboard Layer 4 (Overlay)");
    out.push("//Storyboard Sound Samples");
    out.push("");

    out.push("[TimingPoints]");
    for (const tp of this.timingPoints) {
      out.push(
        `${tp.time},${tp.beatLength},${tp.meter},${tp.sampleSet},${tp.sampleIndex},${tp.volume},${tp.uninherited ? 1 : 0},${tp.effects}`,
      );
    }
    out.push("");

    if (this.comboColors.length > 0 || this.customColors.length > 0) {
      out.push("[Colours]");
      this.comboColors.forEach((c, i) => {
        out.push(`Combo${i + 1} : ${c.join(",")}`);
      });
      this.customColors.forEach((c) => out.push(`${c.k} : ${c.v}`));
      out.push("");
    }

    out.push("[HitObjects]");
    for (const ho of this.hitObjects) {
      out.push(this.serializeHitObject(ho));
    }

    return out.join("\n");
  }

  serializeHitObject(ho) {
    const parts = [ho.x, ho.y, ho.time, ho.type, ho.hitSound];

    if (ho.isSlider) {
      parts.push(ho.sliderParams || "");
      parts.push(ho.slides != null ? ho.slides : 1);

      if (ho.length != null) {
        parts.push(ho.length);
      }
    } else if (ho.isSpinner) {
      parts.push(ho.endTime != null ? ho.endTime : ho.time);
    } else if (ho.isHold) {
      parts.push(ho.endTime != null ? ho.endTime : ho.time);
    }

    if (ho.raw) {
      const rawParts = ho.raw.split(",");

      let sampleStart;
      if (ho.isSlider) sampleStart = 8;
      else if (ho.isSpinner) sampleStart = 6;
      else if (ho.isHold) sampleStart = 5;
      else sampleStart = 5;

      if (rawParts.length > sampleStart) {
        const sampleParts = rawParts.slice(sampleStart);
        if (ho.isHold) {
          const lastIdx = parts.length - 1;
          const sampleStr = sampleParts.join(":");
          parts[lastIdx] = `${parts[lastIdx]}:${sampleStr}`;
        } else {
          parts.push(...sampleParts);
        }
      }
    }

    return parts.join(",");
  }
}

function round1(n) {
  return (Math.round(n * 10) / 10).toString();
}
