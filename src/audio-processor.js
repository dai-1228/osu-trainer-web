




















import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';


const BASE = import.meta.env.BASE_URL || '/';
const mtCoreURL = `${BASE}mt/ffmpeg-core.js`;
const mtWasmURL = `${BASE}mt/ffmpeg-core.wasm`;
const mtWorkerURL = `${BASE}mt/ffmpeg-core.worker.js`;
const stCoreURL = `${BASE}st/ffmpeg-core.js`;
const stWasmURL = `${BASE}st/ffmpeg-core.wasm`;

const STORAGE_KEY = 'osutrainer_use_mt';
const POOL_SIZE_KEY = 'osutrainer_pool_size';



export function isMultiThreadedEnabled() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'false') return false;
    return true; 
  } catch { return true; }
}

export function setMultiThreadedEnabled(enabled) {
  try { localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false'); } catch {}
  
  _pool = null;
}

export function isMultiThreadingSupported() {
  
  
  
  return typeof SharedArrayBuffer !== 'undefined' ||
         (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated);
}


export async function isWebGPUSupported() {
  if (!('gpu' in navigator)) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}


export function getPoolSize() {
  const hc = navigator.hardwareConcurrency || 4;

  
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
                   (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);

  
  
  const maxPool = isMobile ? 2 : 8;

  try {
    const v = localStorage.getItem(POOL_SIZE_KEY);
    if (v) {
      const n = parseInt(v, 10);
      if (n > 1) return Math.min(n, maxPool);
      localStorage.removeItem(POOL_SIZE_KEY);
    }
  } catch {}
  return Math.min(hc, maxPool);
}

export function setPoolSize(n) {
  const clamped = Math.max(1, parseInt(n, 10) || 1);
  try { localStorage.setItem(POOL_SIZE_KEY, String(clamped)); } catch {}
  _pool = null;
}



class FFmpegPool {
  constructor(size, useMT) {
    this.size = size;
    this.useMT = useMT;
    this.instances = [];
    this.available = [];
    this.waiters = [];
    this.initPromise = null;
  }

  async initialize(onLog) {
    if (this._initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      console.log(`[ffmpeg] Initializing pool of ${this.size} ${this.useMT ? 'MT' : 'ST'} instance(s)...`);

      
      let blobCoreURL, blobWasmURL, blobWorkerURL;
      if (this.useMT) {
        blobCoreURL = await toBlobURL(mtCoreURL, 'text/javascript');
        blobWasmURL = await toBlobURL(mtWasmURL, 'application/wasm');
        blobWorkerURL = await toBlobURL(mtWorkerURL, 'text/javascript');
      } else {
        blobCoreURL = await toBlobURL(stCoreURL, 'text/javascript');
        blobWasmURL = await toBlobURL(stWasmURL, 'application/wasm');
      }

      
      const promises = [];
      for (let i = 0; i < this.size; i++) {
        promises.push(this._createInstance(i, blobCoreURL, blobWasmURL, blobWorkerURL, onLog));
      }
      await Promise.all(promises);
      console.log(`[ffmpeg] Pool ready: ${this.instances.length} instance(s)`);
      this._initialized = true;
    })();
    return this.initPromise;
  }

  async _createInstance(idx, blobCoreURL, blobWasmURL, blobWorkerURL, onLog) {
    const ffmpeg = new FFmpeg();
    if (onLog && idx === 0) {
      
      ffmpeg.on('log', ({ message }) => onLog(message));
    }
    const loadOpts = this.useMT
      ? { coreURL: blobCoreURL, wasmURL: blobWasmURL, workerURL: blobWorkerURL }
      : { coreURL: blobCoreURL, wasmURL: blobWasmURL };
    await ffmpeg.load(loadOpts);
    this.instances.push(ffmpeg);
    this.available.push(ffmpeg);
  }

  async acquire() {
    if (this.available.length > 0) {
      return this.available.pop();
    }
    
    return new Promise(resolve => this.waiters.push(resolve));
  }

  release(ffmpeg) {
    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter(ffmpeg);
    } else {
      this.available.push(ffmpeg);
    }
  }

  terminate() {
    for (const inst of this.instances) {
      try { inst.terminate(); } catch {}
    }
    this.instances = [];
    this.available = [];
    this.waiters = [];
    this.initPromise = null;
    this._initialized = false;
  }
}

let _pool = null;
let _poolPromise = null;


async function getPool(onLog) {
  
  if (_pool && _pool.instances.length > 0 && !_poolPromise) {
    return _pool;
  }

  
  if (_poolPromise) {
    await _poolPromise;
    return _pool;
  }

  
  _poolPromise = (async () => {
    const wantMT = isMultiThreadedEnabled();
    const canMT = isMultiThreadingSupported();
    const useMT = wantMT && canMT;

    if (wantMT && !canMT) {
      console.warn('[ffmpeg] Multi-threaded requested but SharedArrayBuffer unavailable — falling back to single-threaded.');
    }

    if (!_pool) {
      const size = getPoolSize();
      _pool = new FFmpegPool(size, useMT);
    } else if (_pool.useMT !== useMT) {
      _pool.terminate();
      const size = getPoolSize();
      _pool = new FFmpegPool(size, useMT);
    }

    
    if (_pool.instances.length === 0) {
      await _pool.initialize(onLog);
    }
    return _pool;
  })();

  try {
    await _poolPromise;
  } finally {
    _poolPromise = null;
  }

  return _pool;
}


export async function warmupFFmpeg(onLog) {
  await getPool(onLog);
}


export async function acquireFFmpeg(onLog) {
  const pool = await getPool(onLog);
  return { pool, instance: await pool.acquire() };
}


export function releaseFFmpeg(handle) {
  if (handle && handle.pool && handle.instance) {
    handle.pool.release(handle.instance);
  }
}


export async function getFFmpeg(onLog) {
  await getPool(onLog);
}


export function cleanupFFmpeg() {
  if (_pool) {
    console.log('[ffmpeg] Cleaning up pool — freeing memory');
    _pool.terminate();
    _pool = null;
  }
  _poolPromise = null;
}



function detectFormat(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  return ext;
}


async function processAudioFileWith(ffmpeg, inputBlob, inputName, multiplier, changePitch, highQuality, onProgress, sampleRateHint) {
  if (Math.abs(multiplier - 1.0) < 0.0001 && !changePitch) {
    return { blob: inputBlob, name: inputName, sampleRate: sampleRateHint };
  }

  const inExt = detectFormat(inputName);
  const inFileName = `input_${Math.random().toString(36).slice(2,8)}.${inExt || 'mp3'}`;
  const outFileName = `output_${Math.random().toString(36).slice(2,8)}.mp3`;

  await ffmpeg.writeFile(inFileName, await fetchFile(inputBlob));

  
  
  let inputSampleRate = sampleRateHint;
  let probeLogs = '';

  if (!inputSampleRate) {
    
    const logHandler = ({ message }) => { probeLogs += message + '\n'; };
    ffmpeg.on('log', logHandler);
    try {
      try { await ffmpeg.exec(['-i', inFileName]); }
      catch {  }
    } finally {
      ffmpeg.off('log', logHandler);
    }
    const m = probeLogs.match(/(\d+)\s*Hz/);
    inputSampleRate = m ? parseInt(m[1], 10) : 44100;
  }

  const filters = buildFilterChain(multiplier, changePitch, inputSampleRate);

  
  
  
  
  
  
  
  const ENCODER_DELAY_MS = 61.8;

  const args = [
    '-i', inFileName,
    '-filter:a', `${filters},adelay=${ENCODER_DELAY_MS}|${ENCODER_DELAY_MS}`,
    '-b:a', highQuality ? '192k' : '128k',
    outFileName,
  ];

  const progressHandler = ({ progress }) => {
    if (onProgress && typeof progress === 'number') {
      onProgress(Math.max(0, Math.min(1, progress)));
    }
  };
  ffmpeg.on('progress', progressHandler);

  try {
    await ffmpeg.exec(args);
  } finally {
    ffmpeg.off('progress', progressHandler);
  }

  const data = await ffmpeg.readFile(outFileName);
  const blob = new Blob([data.buffer], { type: 'audio/mpeg' });

  try {
    await ffmpeg.deleteFile(inFileName);
    await ffmpeg.deleteFile(outFileName);
  } catch {}

  return { blob, name: 'output.mp3', sampleRate: inputSampleRate };
}


export async function generateAudioFile(inputBlob, inputName, multiplier, changePitch, highQuality, onProgress) {
  const pool = await getPool();
  const ffmpeg = await pool.acquire();
  try {
    return await processAudioFileWith(ffmpeg, inputBlob, inputName, multiplier, changePitch, highQuality, onProgress);
  } finally {
    pool.release(ffmpeg);
  }
}


export async function generateAudioFilesParallel(jobs, onProgress) {
  const pool = await getPool();
  console.log(`[ffmpeg] Processing ${jobs.length} audio file(s) in parallel (pool size: ${pool.size})`);

  const results = new Array(jobs.length);
  let completedCount = 0;

  
  
  let sharedSampleRate = null;
  if (jobs.length > 0) {
    const probeFfmpeg = await pool.acquire();
    try {
      const inExt = detectFormat(jobs[0].name);
      const inFileName = `probe.${inExt || 'mp3'}`;
      await probeFfmpeg.writeFile(inFileName, await fetchFile(jobs[0].blob));
      let probeLogs = '';
      const logHandler = ({ message }) => { probeLogs += message + '\n'; };
      probeFfmpeg.on('log', logHandler);
      try {
        try { await probeFfmpeg.exec(['-i', inFileName]); }
        catch {  }
      } finally {
        probeFfmpeg.off('log', logHandler);
      }
      try { await probeFfmpeg.deleteFile(inFileName); } catch {}
      const m = probeLogs.match(/(\d+)\s*Hz/);
      sharedSampleRate = m ? parseInt(m[1], 10) : 44100;
      console.log(`[ffmpeg] Shared sample rate: ${sharedSampleRate} Hz`);
    } finally {
      pool.release(probeFfmpeg);
    }
  }

  
  const promises = jobs.map(async (job, idx) => {
    const ffmpeg = await pool.acquire();
    try {
      const result = await processAudioFileWith(
        ffmpeg,
        job.blob,
        job.name,
        job.multiplier,
        job.changePitch,
        job.highQuality,
        (ratio) => onProgress && onProgress(idx, ratio),
        sharedSampleRate,
      );
      completedCount++;
      if (onProgress) onProgress(idx, 1);
      return result;
    } finally {
      pool.release(ffmpeg);
    }
  });

  return Promise.all(promises);
}



function buildFilterChain(multiplier, changePitch, inputSampleRate) {
  const sr = inputSampleRate || 44100;

  if (changePitch) {
    
    const newRate = Math.round(sr * multiplier);
    return `asetrate=${newRate},aresample=${sr}`;
  }

  
  return buildAtempoChain(multiplier);
}

function buildAtempoChain(multiplier) {
  
  
  const stages = [];
  let m = multiplier;
  while (m > 2.0) {
    stages.push('atempo=2.0');
    m /= 2.0;
  }
  while (m < 0.5) {
    stages.push('atempo=0.5');
    m /= 0.5;
  }
  stages.push(`atempo=${m.toFixed(6)}`);
  return stages.join(',');
}
