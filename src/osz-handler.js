import JSZip from 'jszip';
import { parseBeatmap, normalizeText } from './osu-parser.js';


export async function loadOsz(input) {

  let files = input;
  if (input instanceof File) {
    files = [input];
  } else if (input instanceof FileList) {
    files = Array.from(input);
  }


  if (files.length === 1 && /\.(osz|zip)$/i.test(files[0].name)) {
    return await loadZipFile(files[0]);
  }


  return await loadLooseFiles(files);
}


async function loadZipFile(file) {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  const beatmaps = [];
  let audio = null;
  let background = null;
  const files = {};

  const entries = Object.values(zip.files);
  const fileNames = [];
  for (const entry of entries) {
    if (entry.dir) continue;
    fileNames.push(entry.name);
  }


  for (const name of fileNames) {
    if (name.toLowerCase().endsWith('.osu')) {
      const text = await zip.file(name).async('string');
      const bm = parseBeatmap(text, name);
      if (bm.valid) beatmaps.push(bm);
    }
  }


  const audioMap = {};
  for (const name of fileNames) {
    if (/\.(mp3|ogg)$/i.test(name)) {
      const blob = await zip.file(name).async('blob');
      const baseName = name.split('/').pop();
      audioMap[baseName.toLowerCase()] = { name: baseName, blob, originalPath: name };
    }
  }


  if (beatmaps.length > 0) {
    const audioName = beatmaps[0].audioFilename;
    audio = audioMap[audioName.toLowerCase()] || Object.values(audioMap)[0] || null;
  }


  if (beatmaps.length > 0 && beatmaps[0].background) {
    const bgName = beatmaps[0].background;
    const matchEntry = fileNames.find(n => n.toLowerCase().endsWith('/' + bgName.toLowerCase()) || n.toLowerCase() === bgName.toLowerCase());
    if (matchEntry) {
      const blob = await zip.file(matchEntry).async('blob');
      const url = URL.createObjectURL(blob);
      background = { name: bgName, blob, url, originalPath: matchEntry };
    }
  }


  for (const name of fileNames) {
    files[name] = await zip.file(name).async('uint8array');
  }

  return { beatmaps, audio, background, audioMap, zip, files };
}


async function loadLooseFiles(fileList) {
  const beatmaps = [];
  let audio = null;
  let background = null;
  const files = {};
  const audioMap = {};

  for (const file of fileList) {

    const name = file.name.split('/').pop() || file.name;
    const lower = name.toLowerCase();

    if (lower.endsWith('.osu')) {
      const text = await file.text();
      const bm = parseBeatmap(text, name);
      if (bm.valid) {

        bm.filename = name;
        beatmaps.push(bm);
      }
    } else if (/\.(mp3|ogg)$/i.test(name)) {
      audioMap[lower] = { name, blob: file, originalPath: name };
    } else if (/\.(jpg|jpeg|png)$/i.test(name)) {

    }


    const buf = await file.arrayBuffer();
    files[name] = new Uint8Array(buf);
  }


  if (beatmaps.length > 0) {
    const audioName = beatmaps[0].audioFilename;
    audio = audioMap[audioName.toLowerCase()] || Object.values(audioMap)[0] || null;
  }


  if (beatmaps.length > 0 && beatmaps[0].background) {
    const bgName = beatmaps[0].background.toLowerCase();
    for (const file of fileList) {
      const name = file.name.split('/').pop() || file.name;
      if (name.toLowerCase() === bgName) {
        const url = URL.createObjectURL(file);
        background = { name: beatmaps[0].background, blob: file, url, originalPath: name };
        break;
      }
    }
  }


  if (!background && beatmaps.length > 0) {
    for (const file of fileList) {
      const name = file.name.split('/').pop() || file.name;
      if (/\.(jpg|jpeg|png)$/i.test(name)) {
        const url = URL.createObjectURL(file);
        background = { name, blob: file, url, originalPath: name };

        for (const bm of beatmaps) {
          bm.background = name;
        }
        break;
      }
    }
  }

  return { beatmaps, audio, background, audioMap, zip: null, files };
}


export async function buildOsz(originalFiles, newOsuName, newOsuText, newAudio) {
  return buildOszMulti(originalFiles, [{ name: newOsuName, text: newOsuText }], newAudio ? [newAudio] : []);
}


export async function buildOszMulti(originalFiles, newOsuFiles, newAudioFiles) {
  const zip = new JSZip();


  for (const [name, data] of Object.entries(originalFiles)) {
    zip.file(name, data);
  }


  for (const osu of newOsuFiles) {
    const baseName = osu.name.split('/').pop();
    zip.file(baseName, osu.text);
  }


  for (const audio of newAudioFiles) {
    if (!audio || !audio.name) continue;
    const baseName = audio.name.split('/').pop();
    if (audio.uint8array) {
      zip.file(baseName, audio.uint8array);
    } else if (audio.blob) {
      const ab = await audio.blob.arrayBuffer();
      zip.file(baseName, new Uint8Array(ab));
    }
  }


  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: 'application/octet-stream',
  });

  return blob;
}


export function makeOszFilename(beatmap) {
  const artist = normalizeText(beatmap.artist);
  const title = normalizeText(beatmap.title);
  const creator = normalizeText(beatmap.creator);
  if (!artist && !title) return 'modified.osz';
  return `${artist} - ${title} (${creator}).osz`;
}
