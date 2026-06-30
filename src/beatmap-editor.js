





import { Beatmap, GameMode, normalizeText } from './osu-parser.js';
import {
  calculateMultipliedAR,
  calculateMultipliedOD,
  calculateStarRating,
  clamp,
} from './difficulty-calculator.js';

export const EditorState = {
  NOT_READY: 0,
  READY: 1,
  GENERATING_BEATMAP: 2,
};

export const BadBeatmapReason = {
  NO_BEATMAP_LOADED: 0,
  ERROR_LOADING_BEATMAP: 1,
  EMPTY_MAP: 2,
};

export class BeatmapEditor {
  constructor() {
    this.state = EditorState.NOT_READY;
    this.notReadyReason = BadBeatmapReason.NO_BEATMAP_LOADED;

    this.originalBeatmap = null;  
    this.newBeatmap = null;       

    
    this.starRating = 0;
    this.aimRating = 0;
    this.speedRating = 0;

    
    this.hpIsLocked = false;
    this.csIsLocked = false;
    this.arIsLocked = false;
    this.odIsLocked = false;
    this.bpmIsLocked = false;

    this.lockedHP = 0;
    this.lockedCS = 0;
    this.lockedAR = 0;
    this.lockedOD = 0;
    this.lockedBpm = 200;

    
    this.scaleAR = true;
    this.scaleOD = true;
    this.forceHardrockCirclesize = false;
    this.noSpinners = false;
    this.changePitch = false;
    this.highQualityMp3s = false;

    
    this.bpmRate = 1.0;

    
    this.userProfiles = [
      this.makeEmptyProfile('Profile 1'),
      this.makeEmptyProfile('Profile 2'),
      this.makeEmptyProfile('Profile 3'),
      this.makeEmptyProfile('Profile 4'),
    ];

    
    this._listeners = {
      stateChanged: [],
      beatmapSwitched: [],
      beatmapModified: [],
      controlsModified: [],
    };

    
    this.loadSettings();
    this.loadProfilesFromDisk();
  }

  makeEmptyProfile(name) {
    return {
      name,
      hpIsLocked: false, csIsLocked: false, arIsLocked: false, odIsLocked: false,
      lockedHP: 0, lockedCS: 0, lockedAR: 0, lockedOD: 0,
      scaleAR: true, scaleOD: true,
      forceHardrockCirclesize: false,
      changePitch: false, noSpinners: false,
      bpmIsLocked: false,
      lockedBpm: 200,
      bpmMultiplier: 1.0,
    };
  }

  

  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
  }

  _emit(event) {
    for (const cb of (this._listeners[event] || [])) {
      try { cb(); } catch (e) { console.error(e); }
    }
  }

  

  loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('osutrainer_settings') || '{}');
      if (s.hpIsLocked != null) this.hpIsLocked = s.hpIsLocked;
      if (s.csIsLocked != null) this.csIsLocked = s.csIsLocked;
      if (s.arIsLocked != null) this.arIsLocked = s.arIsLocked;
      if (s.odIsLocked != null) this.odIsLocked = s.odIsLocked;
      if (s.scaleAR != null) this.scaleAR = s.scaleAR;
      if (s.scaleOD != null) this.scaleOD = s.scaleOD;
      if (s.lockedHP != null) this.lockedHP = s.lockedHP;
      if (s.lockedCS != null) this.lockedCS = s.lockedCS;
      if (s.lockedAR != null) this.lockedAR = s.lockedAR;
      if (s.lockedOD != null) this.lockedOD = s.lockedOD;
      if (s.bpmIsLocked != null) this.bpmIsLocked = s.bpmIsLocked;
      if (s.lockedBpm != null) this.lockedBpm = s.lockedBpm;
      if (s.bpmRate != null) this.bpmRate = s.bpmRate;
      if (s.changePitch != null) this.changePitch = s.changePitch;
      if (s.noSpinners != null) this.noSpinners = s.noSpinners;
      if (s.highQualityMp3s != null) this.highQualityMp3s = s.highQualityMp3s;
    } catch {}
  }

  saveSettings() {
    const s = {
      hpIsLocked: this.hpIsLocked,
      csIsLocked: this.csIsLocked,
      arIsLocked: this.arIsLocked,
      odIsLocked: this.odIsLocked,
      scaleAR: this.scaleAR,
      scaleOD: this.scaleOD,
      lockedHP: this.lockedHP,
      lockedCS: this.lockedCS,
      lockedAR: this.lockedAR,
      lockedOD: this.lockedOD,
      bpmIsLocked: this.bpmIsLocked,
      lockedBpm: this.lockedBpm,
      bpmRate: this.bpmRate,
      changePitch: this.changePitch,
      noSpinners: this.noSpinners,
      highQualityMp3s: this.highQualityMp3s,
    };
    try { localStorage.setItem('osutrainer_settings', JSON.stringify(s)); } catch {}
  }

  loadProfilesFromDisk() {
    try {
      const data = JSON.parse(localStorage.getItem('osutrainer_profiles') || 'null');
      if (Array.isArray(data) && data.length === 4) {
        for (let i = 0; i < 4; i++) {
          this.userProfiles[i] = { ...this.makeEmptyProfile(`Profile ${i+1}`), ...data[i] };
        }
      }
    } catch {}
  }

  saveProfilesToDisk() {
    try {
      localStorage.setItem('osutrainer_profiles', JSON.stringify(this.userProfiles));
    } catch {}
  }

  

  setState(s) {
    this.state = s;
    this._emit('stateChanged');
  }

  

  
  loadBeatmap(beatmap) {
    if (!beatmap || !beatmap.valid) {
      this.originalBeatmap = null;
      this.newBeatmap = null;
      this.setState(EditorState.NOT_READY);
      this.notReadyReason = BadBeatmapReason.ERROR_LOADING_BEATMAP;
      this._emit('beatmapSwitched');
      this._emit('controlsModified');
      return;
    }
    if (beatmap.hitObjectCount === 0) {
      this.originalBeatmap = beatmap;
      this.newBeatmap = beatmap.clone();
      this.setState(EditorState.NOT_READY);
      this.notReadyReason = BadBeatmapReason.EMPTY_MAP;
      this._emit('beatmapSwitched');
      this._emit('controlsModified');
      return;
    }

    
    
    
    this.originalBeatmap = beatmap;
    this.newBeatmap = beatmap.clone();

    
    if (this.bpmIsLocked) {
      this.setBpm(this.lockedBpm);
    } else {
      this.newBeatmap.setRate(this.bpmRate);
    }

    if (this.scaleAR) {
      this.newBeatmap.approachRate = calculateMultipliedAR(this.originalBeatmap, this.bpmRate);
    }
    if (this.scaleOD) {
      this.newBeatmap.overallDifficulty = calculateMultipliedOD(this.originalBeatmap, this.bpmRate);
    }

    if (this.hpIsLocked) this.newBeatmap.hpDrainRate = this.lockedHP;
    if (this.csIsLocked) this.newBeatmap.circleSize = this.lockedCS;
    if (this.arIsLocked) this.newBeatmap.approachRate = this.lockedAR;
    if (this.odIsLocked) this.newBeatmap.overallDifficulty = this.lockedOD;

    if (this.forceHardrockCirclesize) {
      this.newBeatmap.circleSize = this.originalBeatmap.circleSize * 1.3;
    }

    this.setState(EditorState.READY);
    this.requestDiffCalc();
    this._emit('beatmapSwitched');
    this._emit('beatmapModified');
    this._emit('controlsModified');
  }

  

  requestDiffCalc() {
    
    setTimeout(() => {
      try {
        const { stars, aim, speed } = calculateStarRating(this.newBeatmap);
        this.starRating = stars;
        this.aimRating = aim;
        this.speedRating = speed;
        this._emit('beatmapModified');
      } catch (e) {
        console.error(e);
        this.starRating = 0;
        this.aimRating = 0;
        this.speedRating = 0;
        this._emit('beatmapModified');
      }
    }, 0);
  }

  

  setHP(value) {
    if (this.state !== EditorState.READY) return;
    this.newBeatmap.hpDrainRate = clamp(value, 0, 11);
    if (this.hpIsLocked) this.lockedHP = this.newBeatmap.hpDrainRate;
    this._emit('beatmapModified');
  }

  setCS(value) {
    if (this.state !== EditorState.READY) return;
    this.forceHardrockCirclesize = false;
    this.newBeatmap.circleSize = clamp(value, 0, 11);
    if (this.csIsLocked) this.lockedCS = this.newBeatmap.circleSize;
    this.requestDiffCalc();
    this._emit('beatmapModified');
    this._emit('controlsModified');
  }

  setAR(value) {
    if (this.state !== EditorState.READY) return;
    this.newBeatmap.approachRate = clamp(value, 0, 11);
    if (this.arIsLocked) this.lockedAR = this.newBeatmap.approachRate;
    this.scaleAR = false;
    this._emit('beatmapModified');
    this._emit('controlsModified');
  }

  setOD(value) {
    if (this.state !== EditorState.READY) return;
    this.forceHardrockCirclesize = false;
    this.newBeatmap.overallDifficulty = clamp(value, 0, 11);
    if (this.odIsLocked) this.lockedOD = this.newBeatmap.overallDifficulty;
    this.scaleOD = false;
    this._emit('beatmapModified');
    this._emit('controlsModified');
  }

  toggleHpLock() {
    this.hpIsLocked = !this.hpIsLocked;
    if (this.hpIsLocked) {
      this.lockedHP = this.newBeatmap.hpDrainRate;
    } else if (this.originalBeatmap) {
      this.newBeatmap.hpDrainRate = this.originalBeatmap.hpDrainRate;
      this._emit('beatmapModified');
    }
    this._emit('controlsModified');
  }

  toggleCsLock() {
    this.csIsLocked = !this.csIsLocked;
    this.forceHardrockCirclesize = false;
    if (this.csIsLocked) {
      this.lockedCS = this.newBeatmap.circleSize;
    } else if (this.originalBeatmap) {
      this.newBeatmap.circleSize = this.originalBeatmap.circleSize;
      this._emit('beatmapModified');
    }
    this._emit('controlsModified');
  }

  toggleArLock() {
    this.arIsLocked = !this.arIsLocked;
    if (this.arIsLocked) {
      this.scaleAR = false;
      this.lockedAR = this.newBeatmap.approachRate;
    } else {
      this.setScaleAR(true);
    }
    this._emit('controlsModified');
  }

  toggleOdLock() {
    this.odIsLocked = !this.odIsLocked;
    this.forceHardrockCirclesize = false;
    if (this.odIsLocked) {
      this.scaleOD = false;
      this.lockedOD = this.newBeatmap.overallDifficulty;
    } else {
      this.setScaleOD(true);
    }
    this._emit('controlsModified');
  }

  toggleBpmLock() {
    this.bpmIsLocked = !this.bpmIsLocked;
    if (this.bpmIsLocked && this.newBeatmap) {
      this.lockedBpm = Math.round(this.newBeatmap.bpm);
      this._emit('beatmapModified');
    }
    this._emit('controlsModified');
  }

  setScaleAR(value) {
    this.scaleAR = value;
    if (this.state === EditorState.NOT_READY) return;
    if (this.scaleAR && this.newBeatmap.mode !== GameMode.Taiko && this.newBeatmap.mode !== GameMode.Mania) {
      this.newBeatmap.approachRate = calculateMultipliedAR(this.originalBeatmap, this.bpmRate);
      this._emit('beatmapModified');
    }
    this.arIsLocked = false;
    this._emit('controlsModified');
  }

  setScaleOD(value) {
    this.scaleOD = value;
    if (this.state === EditorState.NOT_READY) return;
    if (this.scaleOD) {
      this.newBeatmap.overallDifficulty = this.getScaledOD();
      if (this.forceHardrockCirclesize) {
        this.newBeatmap.overallDifficulty = clamp(this.getScaledOD() * 1.4, 0, 11);
      }
      this._emit('beatmapModified');
    }
    this.odIsLocked = false;
    this._emit('controlsModified');
  }

  toggleHrEmulation() {
    this.forceHardrockCirclesize = !this.forceHardrockCirclesize;
    this.csIsLocked = false;
    if (this.forceHardrockCirclesize) {
      this.newBeatmap.circleSize = this.originalBeatmap.circleSize * 1.3;
    } else {
      this.newBeatmap.circleSize = this.originalBeatmap.circleSize;
    }
    this.requestDiffCalc();
    this._emit('controlsModified');
    this._emit('beatmapModified');
  }

  toggleNoSpinners() {
    this.noSpinners = !this.noSpinners;
    this._emit('controlsModified');
    this._emit('beatmapModified');
  }

  toggleChangePitchSetting() {
    this.changePitch = !this.changePitch;
    this._emit('controlsModified');
  }

  toggleHighQualityMp3s() {
    this.highQualityMp3s = !this.highQualityMp3s;
    this._emit('controlsModified');
  }

  setBpmMultiplier(multiplier) {
    if (this.bpmIsLocked) {
      const bpm = Math.round(this.originalBeatmap.bpm * multiplier);
      this.lockedBpm = bpm;
    }
    this.applyBpmMultiplier(multiplier);
  }

  setBpm(bpm) {
    if (this.bpmIsLocked) this.lockedBpm = bpm;
    const originalBpm = this.originalBeatmap ? this.originalBeatmap.bpm : 0;
    if (originalBpm === 0) return;
    
    const newMultiplier = bpm / originalBpm;
    this.applyBpmMultiplier(newMultiplier);
  }

  applyBpmMultiplier(multiplier) {
    if (Math.abs(this.bpmRate - multiplier) < 1e-9) return;
    if (multiplier <= 0) {
      this._emit('beatmapModified');
      return;
    }
    this.bpmRate = multiplier;
    if (this.state === EditorState.NOT_READY) return;

    
    if (this.scaleAR && !this.arIsLocked &&
        this.newBeatmap.mode !== GameMode.Taiko &&
        this.newBeatmap.mode !== GameMode.Mania) {
      this.newBeatmap.approachRate = calculateMultipliedAR(this.originalBeatmap, this.bpmRate);
    }

    
    if (this.scaleOD && !this.odIsLocked) {
      this.newBeatmap.overallDifficulty = this.getScaledOD();
      if (this.forceHardrockCirclesize) {
        this.newBeatmap.overallDifficulty = clamp(this.getScaledOD() * 1.4, 0, 11);
      }
    }

    
    
    this.newBeatmap = this.originalBeatmap.clone();
    this.newBeatmap.setRate(this.bpmRate);

    
    if (this.scaleAR && !this.arIsLocked &&
        this.newBeatmap.mode !== GameMode.Taiko &&
        this.newBeatmap.mode !== GameMode.Mania) {
      this.newBeatmap.approachRate = calculateMultipliedAR(this.originalBeatmap, this.bpmRate);
    }
    if (this.scaleOD && !this.odIsLocked) {
      this.newBeatmap.overallDifficulty = this.getScaledOD();
    }
    if (this.hpIsLocked) this.newBeatmap.hpDrainRate = this.lockedHP;
    else this.newBeatmap.hpDrainRate = this.originalBeatmap.hpDrainRate;
    if (this.csIsLocked) this.newBeatmap.circleSize = this.lockedCS;
    else if (this.forceHardrockCirclesize) this.newBeatmap.circleSize = this.originalBeatmap.circleSize * 1.3;
    else this.newBeatmap.circleSize = this.originalBeatmap.circleSize;
    if (this.arIsLocked) this.newBeatmap.approachRate = this.lockedAR;
    if (this.odIsLocked) this.newBeatmap.overallDifficulty = this.lockedOD;

    this.requestDiffCalc();
    this._emit('beatmapModified');
  }

  

  getMode() { return this.originalBeatmap ? this.originalBeatmap.mode : null; }

  getScaledAR() {
    if (!this.originalBeatmap) return 0;
    return calculateMultipliedAR(this.originalBeatmap, this.bpmRate);
  }

  getScaledOD() {
    if (!this.originalBeatmap) return 0;
    return calculateMultipliedOD(this.originalBeatmap, this.bpmRate);
  }

  getOriginalBpmData() {
    if (!this.originalBeatmap) return [0, 0, 0];
    return [this.originalBeatmap.bpm, this.originalBeatmap.minBpm, this.originalBeatmap.maxBpm];
  }

  getNewBpmData() {
    if (!this.newBeatmap) return [0, 0, 0];
    return [this.newBeatmap.bpm, this.newBeatmap.minBpm, this.newBeatmap.maxBpm];
  }

  newMapIsDifferent() {
    if (!this.newBeatmap || !this.originalBeatmap) return false;
    return (
      this.newBeatmap.hpDrainRate !== this.originalBeatmap.hpDrainRate ||
      this.newBeatmap.circleSize !== this.originalBeatmap.circleSize ||
      this.newBeatmap.approachRate !== this.originalBeatmap.approachRate ||
      this.newBeatmap.overallDifficulty !== this.originalBeatmap.overallDifficulty ||
      Math.abs(this.bpmRate - 1.0) > 0.001 ||
      this.noSpinners
    );
  }

  

  resetBeatmap() {
    if (this.state !== EditorState.READY) return;
    this.newBeatmap = this.originalBeatmap.clone();
    this.hpIsLocked = false;
    this.csIsLocked = false;
    this.arIsLocked = false;
    this.odIsLocked = false;
    this.bpmIsLocked = false;
    this.forceHardrockCirclesize = false;
    this.scaleAR = true;
    this.scaleOD = true;
    this.bpmRate = 1.0;
    this.requestDiffCalc();
    this._emit('controlsModified');
    this._emit('beatmapModified');
  }

  

  
  async generateBeatmap(audioBlob, onProgress) {
    if (this.state !== EditorState.READY) return null;

    this.setState(EditorState.GENERATING_BEATMAP);

    try {
      const compensateForDT = (this.newBeatmap.approachRate > 10 || this.newBeatmap.overallDifficulty > 10);

      
      
      
      
      const effectiveRate = compensateForDT ? this.bpmRate / 1.5 : this.bpmRate;

      
      const exportBeatmap = this.originalBeatmap.clone();
      if (Math.abs(effectiveRate - 1.0) > 0.001) {
        exportBeatmap.setRate(effectiveRate);
      }

      
      if (compensateForDT) {
        
        
        exportBeatmap.approachRate = calculateMultipliedAR(this.originalBeatmap, this.bpmRate);
        exportBeatmap.overallDifficulty = calculateMultipliedOD(this.originalBeatmap, this.bpmRate);
        
        exportBeatmap.approachRate = Math.min(exportBeatmap.approachRate, 10);
        exportBeatmap.overallDifficulty = Math.min(exportBeatmap.overallDifficulty, 10);
      } else {
        
        if (this.scaleAR && exportBeatmap.mode !== GameMode.Taiko && exportBeatmap.mode !== GameMode.Mania) {
          exportBeatmap.approachRate = calculateMultipliedAR(this.originalBeatmap, this.bpmRate);
        } else {
          exportBeatmap.approachRate = this.newBeatmap.approachRate;
        }
        if (this.scaleOD) {
          exportBeatmap.overallDifficulty = calculateMultipliedOD(this.originalBeatmap, this.bpmRate);
        } else {
          exportBeatmap.overallDifficulty = this.newBeatmap.overallDifficulty;
        }
      }

      
      if (this.hpIsLocked) exportBeatmap.hpDrainRate = this.lockedHP;
      else exportBeatmap.hpDrainRate = this.originalBeatmap.hpDrainRate;
      if (this.csIsLocked) exportBeatmap.circleSize = this.lockedCS;
      else if (this.forceHardrockCirclesize) exportBeatmap.circleSize = this.originalBeatmap.circleSize * 1.3;
      else exportBeatmap.circleSize = this.originalBeatmap.circleSize;
      if (this.arIsLocked) exportBeatmap.approachRate = this.lockedAR;
      if (this.odIsLocked) exportBeatmap.overallDifficulty = this.lockedOD;

      
      this.modifyBeatmapMetadata(exportBeatmap, this.bpmRate, this.changePitch, compensateForDT);

      
      if (this.noSpinners) exportBeatmap.removeSpinners();

      
      let newAudio = null;
      if (audioBlob && (Math.abs(this.bpmRate - 1.0) > 0.001 || this.changePitch)) {
        if (onProgress) onProgress({ phase: 'audio', ratio: 0 });
        const { generateAudioFile } = await import('./audio-processor.js');
        const result = await generateAudioFile(
          audioBlob,
          exportBeatmap.audioFilename,
          compensateForDT ? this.bpmRate / 1.5 : this.bpmRate,
          this.changePitch,
          this.highQualityMp3s,
          (r) => onProgress && onProgress({ phase: 'audio', ratio: r }),
        );
        
        newAudio = { blob: result.blob, name: exportBeatmap.audioFilename };
        if (onProgress) onProgress({ phase: 'audio', ratio: 1 });
      }

      
      if (onProgress) onProgress({ phase: 'osu', ratio: 1 });
      const osuText = exportBeatmap.serialize();

      
      const artist = normalizeText(exportBeatmap.artist);
      const title = normalizeText(exportBeatmap.title);
      const creator = normalizeText(exportBeatmap.creator);
      const diff = normalizeText(exportBeatmap.version);
      const osuFilename = `${artist} - ${title} (${creator}) [${diff}].osu`;

      this.setState(EditorState.READY);

      return {
        osuText,
        osuFilename,
        audioBlob: newAudio ? newAudio.blob : null,
        audioFilename: newAudio ? newAudio.name : null,
        exportBeatmap,
      };
    } catch (e) {
      console.error(e);
      this.setState(EditorState.READY);
      throw e;
    }
  }

  
  async generateBatch(beatmaps, rates, audioBlob, onProgress) {
    if (this.state !== EditorState.READY) return null;
    if (!beatmaps || beatmaps.length === 0 || !rates || rates.length === 0) return null;

    this.setState(EditorState.GENERATING_BEATMAP);

    try {
      const totalSteps = rates.length + rates.length * beatmaps.length;
      let currentStep = 0;

      
      
      const audioByRate = new Map();
      const ratesNeedingAudio = rates.filter(r =>
        audioBlob && (Math.abs(r - 1.0) > 0.001 || this.changePitch)
      );

      if (ratesNeedingAudio.length > 0) {
        const { generateAudioFilesParallel } = await import('./audio-processor.js');

        
        const baseAudioName = beatmaps[0].audioFilename;
        const audioJobs = ratesNeedingAudio.map(rate => {
          let audioName = baseAudioName.replace(/\.[^.]+$/, '');
          audioName += ` ${rate.toFixed(3)}x`;
          if (this.changePitch) {
            audioName += ` (pitch ${rate < 1 ? 'lowered' : 'raised'})`;
          }
          audioName += '.mp3';
          
          
          let needsDTComp = false;
          for (const bm of beatmaps) {
            const testAR = this.scaleAR && bm.mode !== GameMode.Taiko && bm.mode !== GameMode.Mania
              ? calculateMultipliedAR(bm, rate) : bm.approachRate;
            const testOD = this.scaleOD ? calculateMultipliedOD(bm, rate) : bm.overallDifficulty;
            if (testAR > 10 || testOD > 10) {
              needsDTComp = true;
              break;
            }
          }
          const audioRate = needsDTComp ? rate / 1.5 : rate;
          return {
            blob: audioBlob,
            name: baseAudioName,
            multiplier: audioRate,
            changePitch: this.changePitch,
            highQuality: this.highQualityMp3s,
            _rate: rate,
            _audioName: audioName,
          };
        });

        
        for (let i = 0; i < audioJobs.length; i++) {
          if (onProgress) onProgress({
            phase: 'audio',
            ratio: 0,
            current: i + 1,
            total: audioJobs.length,
            rate: audioJobs[i]._rate,
          });
        }

        
        
        const audioResults = await generateAudioFilesParallel(
          audioJobs,
          (jobIdx, ratio) => {
            if (onProgress) onProgress({
              phase: 'audio',
              ratio,
              current: jobIdx + 1,
              total: audioJobs.length,
              rate: audioJobs[jobIdx]._rate,
            });
          },
        );

        
        for (let i = 0; i < audioJobs.length; i++) {
          audioByRate.set(audioJobs[i]._rate, {
            blob: audioResults[i].blob,
            name: audioJobs[i]._audioName,
          });
          currentStep++;
          if (onProgress) onProgress({
            phase: 'audio',
            ratio: 1,
            current: i + 1,
            total: audioJobs.length,
            rate: audioJobs[i]._rate,
          });
        }
      }

      
      const results = [];
      const totalOsu = beatmaps.length * rates.length;

      for (let bi = 0; bi < beatmaps.length; bi++) {
        const originalBm = beatmaps[bi];

        for (let ri = 0; ri < rates.length; ri++) {
          const rate = rates[ri];
          const stepIdx = bi * rates.length + ri + 1;
          if (onProgress) onProgress({
            phase: 'osu',
            ratio: 0,
            current: stepIdx,
            total: totalOsu,
            beatmap: originalBm.version,
            rate,
          });

          
          const exportBeatmap = originalBm.clone();

          
          if (Math.abs(rate - 1.0) > 0.001) {
            exportBeatmap.setRate(rate);
          }

          
          if (this.scaleAR && exportBeatmap.mode !== GameMode.Taiko && exportBeatmap.mode !== GameMode.Mania) {
            exportBeatmap.approachRate = calculateMultipliedAR(originalBm, rate);
          }
          if (this.scaleOD) {
            exportBeatmap.overallDifficulty = calculateMultipliedOD(originalBm, rate);
          }

          
          if (this.hpIsLocked) exportBeatmap.hpDrainRate = this.lockedHP;
          if (this.csIsLocked) exportBeatmap.circleSize = this.lockedCS;
          if (this.arIsLocked) exportBeatmap.approachRate = this.lockedAR;
          if (this.odIsLocked) exportBeatmap.overallDifficulty = this.lockedOD;
          if (this.forceHardrockCirclesize) {
            exportBeatmap.circleSize = originalBm.circleSize * 1.3;
          }

          
          const compensateForDT = (exportBeatmap.approachRate > 10 || exportBeatmap.overallDifficulty > 10);

          
          
          const savedBpmRate = this.bpmRate;
          const savedNewBeatmap = this.newBeatmap;
          const savedOriginalBeatmap = this.originalBeatmap;
          this.bpmRate = rate;
          this.newBeatmap = exportBeatmap;
          this.originalBeatmap = originalBm;
          try {
            this.modifyBeatmapMetadata(exportBeatmap, rate, this.changePitch, compensateForDT);
          } finally {
            this.bpmRate = savedBpmRate;
            this.newBeatmap = savedNewBeatmap;
            this.originalBeatmap = savedOriginalBeatmap;
          }

          
          if (compensateForDT) {
            exportBeatmap.approachRate = calculateMultipliedAR(exportBeatmap, 1 / 1.5);
            exportBeatmap.overallDifficulty = calculateMultipliedOD(exportBeatmap, 1 / 1.5);
            const compensatedRate = (exportBeatmap.bpm / originalBm.bpm) / 1.5;
            
            const freshClone = originalBm.clone();
            freshClone.setRate(compensatedRate);
            
            exportBeatmap.timingPoints = freshClone.timingPoints;
            exportBeatmap.hitObjects = freshClone.hitObjects;
            exportBeatmap.previewTime = freshClone.previewTime;
            exportBeatmap.audioLeadIn = freshClone.audioLeadIn;
            exportBeatmap.computeBPM();
          }

          
          if (this.noSpinners) exportBeatmap.removeSpinners();

          
          if (audioByRate.has(rate)) {
            exportBeatmap.audioFilename = audioByRate.get(rate).name;
          } else if (rate === 1.0 && !this.changePitch) {
            
            exportBeatmap.audioFilename = originalBm.audioFilename;
          }

          
          const osuText = exportBeatmap.serialize();

          
          const artist = normalizeText(exportBeatmap.artist);
          const title = normalizeText(exportBeatmap.title);
          const creator = normalizeText(exportBeatmap.creator);
          const diff = normalizeText(exportBeatmap.version);
          const osuFilename = `${artist} - ${title} (${creator}) [${diff}].osu`;

          results.push({
            osuText,
            osuFilename,
            rate,
            beatmap: originalBm,
            exportBeatmap,
          });

          currentStep++;
          if (onProgress) onProgress({
            phase: 'osu',
            ratio: 1,
            current: stepIdx,
            total: totalOsu,
            beatmap: originalBm.version,
            rate,
          });
        }
      }

      this.setState(EditorState.READY);

      
      const audioFiles = [];
      for (const [rate, { blob, name }] of audioByRate) {
        audioFiles.push({ name, blob, rate });
      }

      return { osuFiles: results, audioFiles };
    } catch (e) {
      console.error(e);
      this.setState(EditorState.READY);
      throw e;
    }
  }

  
  modifyBeatmapMetadata(map, multiplier, changePitch = false, preDT = false) {
    
    if (preDT) {
      const bpm = map.bpm.toFixed(0);
      map.version += ` ${multiplier.toFixed(2)}x (${bpm}bpm)`;
      let audioName = map.audioFilename.replace(/\.[^.]+$/, '');
      audioName += ` ${multiplier.toFixed(3)}x withDT`;
      if (changePitch && Math.abs(multiplier - 1) > 0.001) {
        audioName += ` (pitch ${multiplier < 1 ? 'lowered' : 'raised'})`;
      }
      map.audioFilename = audioName + '.mp3';
    } else if (Math.abs(multiplier - 1) > 0.001) {
      const bpm = map.bpm.toFixed(0);
      map.version += ` ${multiplier.toFixed(2)}x (${bpm}bpm)`;
      let audioName = map.audioFilename.replace(/\.[^.]+$/, '');
      audioName += ` ${multiplier.toFixed(3)}x`;
      if (changePitch) {
        audioName += ` (pitch ${multiplier < 1 ? 'lowered' : 'raised'})`;
      }
      map.audioFilename = audioName + '.mp3';
    }

    
    let suffix = '';
    if (this.newBeatmap.hpDrainRate !== this.originalBeatmap.hpDrainRate) {
      suffix += ` HP${this.newBeatmap.hpDrainRate.toFixed(1)}`;
    }
    if (this.originalBeatmap.mode !== GameMode.Taiko &&
        this.originalBeatmap.mode !== GameMode.Mania &&
        this.newBeatmap.circleSize !== this.originalBeatmap.circleSize) {
      suffix += ` CS${this.newBeatmap.circleSize.toFixed(1)}`;
    }
    if (this.originalBeatmap.mode !== GameMode.Taiko &&
        this.originalBeatmap.mode !== GameMode.Mania &&
        (this.newBeatmap.approachRate !== this.getScaledAR() || this.newBeatmap.approachRate > 10)) {
      suffix += ` AR${this.newBeatmap.approachRate.toFixed(1)}`;
    }
    if (this.newBeatmap.overallDifficulty !== this.getScaledOD() || this.newBeatmap.overallDifficulty > 10) {
      suffix += ` OD${this.newBeatmap.overallDifficulty.toFixed(1)}`;
    }
    map.version += suffix;

    
    const artist = normalizeText(map.artist);
    const title = normalizeText(map.title);
    const creator = normalizeText(map.creator);
    const diff = normalizeText(map.version);
    map.filename = `${artist} - ${title} (${creator}) [${diff}].osu`;

    
    if (!map.tags.includes('osutrainer')) {
      map.tags.push('osutrainer');
    }
  }

  

  saveProfile(whichProfile) {
    const i = whichProfile;
    const p = this.userProfiles[i];
    p.hpIsLocked = this.hpIsLocked;
    p.csIsLocked = this.csIsLocked;
    p.arIsLocked = this.arIsLocked;
    p.odIsLocked = this.odIsLocked;
    p.lockedHP = this.lockedHP;
    p.lockedCS = this.lockedCS;
    p.lockedAR = this.lockedAR;
    p.lockedOD = this.lockedOD;

    if (this.newBeatmap && this.originalBeatmap) {
      if (this.newBeatmap.hpDrainRate !== this.originalBeatmap.hpDrainRate) {
        p.hpIsLocked = true;
        p.lockedHP = this.newBeatmap.hpDrainRate;
      }
      if (this.newBeatmap.circleSize !== this.originalBeatmap.circleSize) {
        p.csIsLocked = true;
        p.lockedCS = this.newBeatmap.circleSize;
      }
      if (this.scaleAR) {
        p.scaleAR = true;
        p.arIsLocked = false;
      } else if (this.newBeatmap.approachRate !== this.originalBeatmap.approachRate) {
        p.scaleAR = false;
        p.arIsLocked = true;
        p.lockedAR = this.newBeatmap.approachRate;
      }
      if (this.scaleOD) {
        p.scaleOD = true;
        p.odIsLocked = false;
      } else if (this.newBeatmap.overallDifficulty !== this.originalBeatmap.overallDifficulty) {
        p.scaleOD = false;
        p.odIsLocked = true;
        p.lockedOD = this.newBeatmap.overallDifficulty;
      }
    }

    p.forceHardrockCirclesize = this.forceHardrockCirclesize;
    p.changePitch = this.changePitch;
    p.noSpinners = this.noSpinners;
    p.bpmIsLocked = this.bpmIsLocked;
    p.lockedBpm = this.lockedBpm;
    p.bpmMultiplier = this.bpmRate;

    
    p.highQualityMp3s = this.highQualityMp3s;
    try {
      p.useMT = localStorage.getItem('osutrainer_use_mt') !== 'false';
      p.useOsuFilename = localStorage.getItem('osutrainer_use_osu_filename') === 'true';
    } catch {}

    this.saveProfilesToDisk();
    this._emit('controlsModified');
  }

  renameProfile(whichProfile, name) {
    this.userProfiles[whichProfile].name = name || `Profile ${whichProfile + 1}`;
    this.saveProfilesToDisk();
    this._emit('controlsModified');
  }

  loadProfile(whichProfile) {
    if (this.state !== EditorState.READY) return;
    const i = whichProfile;
    const p = this.userProfiles[i];

    if (p.hpIsLocked) {
      this.hpIsLocked = true;
      this.lockedHP = p.lockedHP;
      this.newBeatmap.hpDrainRate = p.lockedHP;
    } else {
      this.hpIsLocked = false;
      this.newBeatmap.hpDrainRate = this.originalBeatmap.hpDrainRate;
    }
    if (p.csIsLocked) {
      this.csIsLocked = true;
      this.lockedCS = p.lockedCS;
      this.newBeatmap.circleSize = p.lockedCS;
    } else {
      this.csIsLocked = false;
      this.newBeatmap.circleSize = this.originalBeatmap.circleSize;
    }
    if (p.arIsLocked) {
      this.arIsLocked = true;
      this.lockedAR = p.lockedAR;
      this.newBeatmap.approachRate = p.lockedAR;
    } else {
      this.arIsLocked = false;
      this.newBeatmap.approachRate = this.originalBeatmap.approachRate;
    }
    if (p.odIsLocked) {
      this.odIsLocked = true;
      this.lockedOD = p.lockedOD;
      this.newBeatmap.overallDifficulty = p.lockedOD;
    } else {
      this.odIsLocked = false;
      this.newBeatmap.overallDifficulty = this.originalBeatmap.overallDifficulty;
    }

    this.forceHardrockCirclesize = p.forceHardrockCirclesize;
    if (this.forceHardrockCirclesize) {
      this.newBeatmap.circleSize = this.originalBeatmap.circleSize * 1.3;
    }
    this.changePitch = p.changePitch;
    this.noSpinners = p.noSpinners;

    if (p.bpmIsLocked) {
      this.bpmIsLocked = true;
      this.setBpm(p.lockedBpm);
    } else {
      this.bpmIsLocked = false;
      this.applyBpmMultiplier(p.bpmMultiplier);
    }

    this.scaleAR = p.scaleAR;
    this.scaleOD = p.scaleOD;
    if (this.scaleAR) this.newBeatmap.approachRate = calculateMultipliedAR(this.originalBeatmap, this.bpmRate);
    if (this.scaleOD) this.newBeatmap.overallDifficulty = calculateMultipliedOD(this.originalBeatmap, this.bpmRate);

    
    if (p.highQualityMp3s !== undefined) this.highQualityMp3s = p.highQualityMp3s;
    try {
      if (p.useMT !== undefined) localStorage.setItem('osutrainer_use_mt', p.useMT ? 'true' : 'false');
      if (p.useOsuFilename !== undefined) localStorage.setItem('osutrainer_use_osu_filename', p.useOsuFilename ? 'true' : 'false');
    } catch {}

    this.requestDiffCalc();
    this._emit('beatmapModified');
    this._emit('controlsModified');
  }
}
