import { BeatmapEditor, EditorState } from './beatmap-editor.js';
import { GameMode, modeName } from './osu-parser.js';
import { getDifficultyColor } from './difficulty-calculator.js';
import { loadOsz, buildOsz, buildOszMulti, makeOszFilename } from './osz-handler.js';

const PRESET_RATES = [0.5, 0.75, 0.85, 1.0, 1.25, 1.5, 2.0];

export class UI {
  constructor() {
    this.editor = new BeatmapEditor();
    this.loadedOsz = null;
    this.currentDiffIndex = 0;
    this.selectedRates = new Set();
    this.selectedDiffIndices = new Set();

    this.cacheElements();
    this.bindEvents();
    this.bindEditorEvents();
    this.renderProfiles();
    this.renderBatchRates();
    this.render();

    this.renderMultiThreadedToggle();
    this.renderProcessingMode();

    this.prewarmFFmpeg();
  }

  prewarmFFmpeg() {
    import('./audio-processor.js').then(({ warmupFFmpeg }) => {
      warmupFFmpeg((msg) => console.log('[ffmpeg prewarm]', msg))
        .then(() => console.log('[ffmpeg] Pre-warmed and ready'))
        .catch(err => console.warn('[ffmpeg] Pre-warm failed (will retry on generate):', err.message));
    });
  }

  cacheElements() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      card: $('card'),

      songDisplay: $('songDisplay'),
      songCover: $('songCover'),
      songTitle: $('songTitle'),
      songArtist: $('songArtist'),
      diffBadge: $('diffBadge'),
      diffName: $('diffName'),
      diffDot: document.querySelector('#diffBadge .badge__dot'),
      starsBadge: $('starsBadge'),
      starsValue: $('starsValue'),
      modeBadge: $('modeBadge'),
      modeName: $('modeName'),

      uploadZone: $('uploadZone'),
      fileInput: $('fileInput'),
      folderInput: $('folderInput'),
      chooseFileBtn: $('chooseFileBtn'),
      chooseFolderBtn: $('chooseFolderBtn'),

      diffSelector: $('diffSelector'),
      diffSelectorList: $('diffSelectorList'),

      diffPanel: $('diffPanel'),
      bpmPanel: $('bpmPanel'),
      togglesPanel: $('togglesPanel'),
      profilesPanel: $('profilesPanel'),
      actionsPanel: $('actionsPanel'),

      HPSlider: $('HPSlider'),
      HPDisplay: $('HPDisplay'),
      HPLock: $('HPLock'),
      CSSlider: $('CSSlider'),
      CSDisplay: $('CSDisplay'),
      CSLock: $('CSLock'),
      ARSlider: $('ARSlider'),
      ARDisplay: $('ARDisplay'),
      ARLock: $('ARLock'),
      ODSlider: $('ODSlider'),
      ODDisplay: $('ODDisplay'),
      ODLock: $('ODLock'),

      BpmMultiplierTextBox: $('BpmMultiplierTextBox'),
      BpmSlider: $('BpmSlider'),
      OriginalBpmTextBox: $('OriginalBpmTextBox'),
      OriginalBpmRangeTextBox: $('OriginalBpmRangeTextBox'),
      NewBpmTextBox: $('NewBpmTextBox'),
      NewBpmRangeTextBox: $('NewBpmRangeTextBox'),
      BpmLock: $('BpmLock'),

      ScaleARCheck: $('ScaleARCheck'),
      ScaleODCheck: $('ScaleODCheck'),
      HRCheck: $('HRCheck'),
      NoSpinnersCheck: $('NoSpinnersCheck'),
      ChangePitchCheck: $('ChangePitchCheck'),
      highQualityMp3Check: $('highQualityMp3Check'),
      useOsuFilenameCheck: $('useOsuFilenameCheck'),
      MultiThreadedCheck: $('MultiThreadedCheck'),
      MultiThreadedToggle: $('MultiThreadedToggle'),
      MultiThreadedStatus: $('MultiThreadedStatus'),

      processingPanel: $('processingPanel'),
      modeLocalBtn: $('modeLocalBtn'),
      modeServerBtn: $('modeServerBtn'),
      serverConfigRow: $('serverConfigRow'),
      serverTestBtn: $('serverTestBtn'),
      serverStatus: $('serverStatus'),

      ResetButton: $('ResetButton'),
      GenerateMapButton: $('GenerateMapButton'),
      GenerateMapLabel: $('GenerateMapLabel'),
      BatchToggleButton: $('BatchToggleButton'),
      loadNewBtn: $('loadNewBtn'),

      batchPanel: $('batchPanel'),
      batchRates: $('batchRates'),
      batchCustomRate: $('batchCustomRate'),
      batchAddRate: $('batchAddRate'),
      batchDiffs: $('batchDiffs'),
      batchSummary: $('batchSummary'),
      batchSummaryCount: $('batchSummaryCount'),
      batchSummaryDetail: $('batchSummaryDetail'),
      BatchCloseButton: $('BatchCloseButton'),
      BatchGenerateButton: $('BatchGenerateButton'),
      BatchGenerateLabel: $('BatchGenerateLabel'),

      progressOverlay: $('progressOverlay'),
      progressTitle: $('progressTitle'),
      progressSubtitle: $('progressSubtitle'),
      progressFill: $('progressFill'),
      progressPct: $('progressPct'),

      aboutModal: $('aboutModal'),
      infoBtn: $('infoBtn'),

      toast: $('toast'),
    };
  }

  bindEvents() {

    this.el.chooseFileBtn.addEventListener('click', () => this.el.fileInput.click());
    this.el.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) this.handleFile(e.target.files);
    });

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {

      this.el.chooseFolderBtn.hidden = true;
      this.el.chooseFileBtn.textContent = 'Browse files';
    } else {
      this.el.chooseFolderBtn.addEventListener('click', () => this.el.folderInput.click());
      this.el.folderInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) this.handleFile(e.target.files);
      });
    }

    ['dragenter', 'dragover'].forEach(ev => {
      this.el.uploadZone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.el.uploadZone.classList.add('is-dragging');
      });
    });
    ['dragleave', 'drop'].forEach(ev => {
      this.el.uploadZone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.el.uploadZone.classList.remove('is-dragging');
      });
    });
    this.el.uploadZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) this.handleFile(files);
    });

    this.el.HPSlider.addEventListener('input', (e) => this.editor.setHP(parseFloat(e.target.value)));
    this.el.CSSlider.addEventListener('input', (e) => this.editor.setCS(parseFloat(e.target.value)));
    this.el.ARSlider.addEventListener('input', (e) => this.editor.setAR(parseFloat(e.target.value)));
    this.el.ODSlider.addEventListener('input', (e) => this.editor.setOD(parseFloat(e.target.value)));

    this.el.HPLock.addEventListener('click', () => this.editor.toggleHpLock());
    this.el.CSLock.addEventListener('click', () => this.editor.toggleCsLock());
    this.el.ARLock.addEventListener('click', () => this.editor.toggleArLock());
    this.el.ODLock.addEventListener('click', () => this.editor.toggleOdLock());
    this.el.BpmLock.addEventListener('click', () => this.editor.toggleBpmLock());

    this.el.BpmMultiplierTextBox.addEventListener('change', (e) => {
      const v = parseFloat(e.target.value);
      if (!isNaN(v)) this.editor.setBpmMultiplier(v);
      else this.renderBpm();
    });
    this.el.BpmMultiplierTextBox.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.target.blur();
    });

    this.el.BpmSlider.addEventListener('input', (e) => {
      this.editor.setBpmMultiplier(parseFloat(e.target.value));
    });

    this.el.NewBpmTextBox.addEventListener('change', (e) => {
      const v = parseInt(e.target.value, 10);
      if (!isNaN(v)) this.editor.setBpm(v);
      else this.renderBpm();
    });
    this.el.NewBpmTextBox.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.target.blur();
    });

    this.el.ScaleARCheck.addEventListener('change', (e) => this.editor.setScaleAR(e.target.checked));
    this.el.ScaleODCheck.addEventListener('change', (e) => this.editor.setScaleOD(e.target.checked));
    this.el.HRCheck.addEventListener('change', (e) => {

      this.editor.toggleHrEmulation();

      this.el.HRCheck.checked = this.editor.forceHardrockCirclesize;
    });
    this.el.NoSpinnersCheck.addEventListener('change', (e) => {
      this.editor.toggleNoSpinners();
      this.el.NoSpinnersCheck.checked = this.editor.noSpinners;
    });
    this.el.ChangePitchCheck.addEventListener('change', (e) => {
      this.editor.toggleChangePitchSetting();
      this.el.ChangePitchCheck.checked = this.editor.changePitch;
    });
    this.el.highQualityMp3Check.addEventListener('change', (e) => {
      this.editor.toggleHighQualityMp3s();
      this.el.highQualityMp3Check.checked = this.editor.highQualityMp3s;
    });

    this.el.useOsuFilenameCheck.addEventListener('change', (e) => {
      try { localStorage.setItem('osutrainer_use_osu_filename', e.target.checked ? 'true' : 'false'); } catch { }
      this.toast(e.target.checked ? 'Will save .osz as .osu filename' : 'Will save .osz as Artist - Title', 'success');
    });

    this.el.MultiThreadedCheck.addEventListener('change', (e) => {
      this.setMultiThreaded(e.target.checked);
    });

    this.el.modeLocalBtn.addEventListener('click', () => this.setProcessingMode('local'));
    this.el.modeServerBtn.addEventListener('click', () => this.setProcessingMode('server'));
    this.el.serverTestBtn.addEventListener('click', () => this.testServer());

    this.el.loadNewBtn.addEventListener('click', () => this.loadNewBeatmap());

    this.el.ResetButton.addEventListener('click', () => {
      this.editor.resetBeatmap();
      this.toast('Reset to original', 'success');
    });
    this.el.GenerateMapButton.addEventListener('click', () => this.handleGenerate());

    this.el.BatchToggleButton.addEventListener('click', () => this.toggleBatchPanel());
    this.el.BatchCloseButton.addEventListener('click', () => this.toggleBatchPanel(false));
    this.el.BatchGenerateButton.addEventListener('click', () => this.handleBatchGenerate());

    this.el.batchAddRate.addEventListener('click', () => this.addCustomRate());
    this.el.batchCustomRate.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.addCustomRate();
      }
    });

    this.el.infoBtn.addEventListener('click', () => this.showModal('aboutModal'));
    this.el.aboutModal.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', () => this.hideModal('aboutModal'));
    });

    document.querySelectorAll('.profile-card').forEach((card) => {
      const idx = parseInt(card.dataset.profile, 10);
      card.querySelector('.profile-card__save').addEventListener('click', (e) => {
        e.stopPropagation();
        this.editor.saveProfile(idx);
        this.flashProfile(idx);
        this.toast(`Saved to ${this.editor.userProfiles[idx].name}`, 'success');
      });
      card.querySelector('.profile-card__load').addEventListener('click', () => {
        if (this.editor.state !== EditorState.READY) {
          this.toast('Load a beatmap first', 'error');
          return;
        }
        this.editor.loadProfile(idx);
        this.markActiveProfile(idx);
        this.toast(`Loaded ${this.editor.userProfiles[idx].name}`, 'success');
      });
      card.querySelector('.profile-card__rename').addEventListener('click', (e) => {
        e.stopPropagation();
        const name = prompt('Rename profile:', this.editor.userProfiles[idx].name);
        if (name != null) {
          this.editor.renameProfile(idx, name.trim() || `Profile ${idx + 1}`);
          this.renderProfiles();
        }
      });
      card.querySelector('.profile-card__delete').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete "${this.editor.userProfiles[idx].name}"?`)) {
          this.editor.userProfiles[idx] = this.editor.makeEmptyProfile(`Profile ${idx + 1}`);
          this.editor.saveProfilesToDisk();
          this.renderProfiles();
          this.toast('Profile deleted', 'success');
        }
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!this.el.aboutModal.hasAttribute('hidden')) this.hideModal('aboutModal');
        if (!this.el.batchPanel.hasAttribute('hidden')) this.toggleBatchPanel(false);
      }
    });
  }

  bindEditorEvents() {
    this.editor.on('stateChanged', () => this.renderState());
    this.editor.on('beatmapSwitched', () => this.renderSong());
    this.editor.on('beatmapModified', () => {
      this.renderBpm();
      this.renderDifficulty();
      this.renderActions();
    });
    this.editor.on('controlsModified', () => {
      this.renderLocks();
      this.renderToggles();
      this.renderProfiles();
    });
  }

  async handleFile(fileInput) {
    if (!fileInput) return;
    this.showProgress('Loading…', 'Reading files');
    try {
      const osz = await loadOsz(fileInput);
      if (osz.beatmaps.length === 0) {
        this.hideProgress();
        this.toast('No .osu files found. Select an .osz/.zip file, or loose .osu + .mp3 files.', 'error');
        return;
      }
      this.loadedOsz = osz;
      this.currentDiffIndex = 0;

      this.editor.loadBeatmap(osz.beatmaps[0]);

      this.el.diffPanel.hidden = false;
      this.el.bpmPanel.hidden = false;
      this.el.togglesPanel.hidden = false;
      this.el.profilesPanel.hidden = false;
      this.el.actionsPanel.hidden = false;
      this.el.processingPanel.hidden = false;
      this.el.uploadZone.hidden = true;
      this.el.loadNewBtn.hidden = false;

      this.renderDiffSelector();

      this.renderBatchDiffs();
      this.selectedRates.clear();
      this.selectedDiffIndices.clear();

      this.selectedDiffIndices.add(0);
      this.renderBatchRates();
      this.renderBatchDiffs();
      this.updateBatchSummary();

      this.hideProgress();
      this.toast(`Loaded ${osz.beatmaps[0].title}`, 'success');
    } catch (e) {
      console.error(e);
      this.hideProgress();
      this.toast('Failed to load .osz file: ' + e.message, 'error');
    }
  }

  loadNewBeatmap() {

    this.editor.originalBeatmap = null;
    this.editor.newBeatmap = null;
    this.editor.setState(EditorState.NOT_READY);
    this.editor.bpmRate = 1.0;

    if (this.loadedOsz && this.loadedOsz.background) {
      URL.revokeObjectURL(this.loadedOsz.background.url);
    }
    this.loadedOsz = null;
    this.currentDiffIndex = 0;
    this.selectedRates.clear();
    this.selectedDiffIndices.clear();

    this.el.diffPanel.hidden = true;
    this.el.bpmPanel.hidden = true;
    this.el.togglesPanel.hidden = true;
    this.el.profilesPanel.hidden = true;
    this.el.actionsPanel.hidden = true;
    this.el.processingPanel.hidden = true;
    this.el.diffSelector.hidden = true;
    this.el.batchPanel.hidden = true;
    this.el.uploadZone.hidden = false;
    this.el.loadNewBtn.hidden = true;

    this.el.fileInput.value = '';

    this.el.songTitle.textContent = 'Drop an .osz file to begin';
    this.el.songArtist.textContent = 'or click the upload zone below';
    this.el.songCover.classList.remove('has-bg');
    this.el.songCover.style.backgroundImage = '';
    this.el.diffBadge.hidden = true;
    this.el.starsBadge.hidden = true;
    this.el.modeBadge.hidden = true;

    this.el.card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  renderDiffSelector() {
    const beatmaps = this.loadedOsz ? this.loadedOsz.beatmaps : [];
    if (beatmaps.length <= 1) {
      this.el.diffSelector.hidden = true;
      return;
    }
    this.el.diffSelector.hidden = false;
    this.el.diffSelectorList.innerHTML = '';
    beatmaps.forEach((bm, i) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'diff-selector__chip' + (i === this.currentDiffIndex ? ' is-active' : '');
      chip.dataset.idx = i;
      chip.innerHTML = `<span class="diff-selector__chip__dot"></span><span>${this.escapeHtml(bm.version || `Diff ${i + 1}`)}</span>`;
      chip.addEventListener('click', () => this.switchDifficulty(i));
      this.el.diffSelectorList.appendChild(chip);
    });
  }

  switchDifficulty(idx) {
    if (!this.loadedOsz) return;
    if (idx === this.currentDiffIndex) return;
    if (idx < 0 || idx >= this.loadedOsz.beatmaps.length) return;
    this.currentDiffIndex = idx;
    this.editor.loadBeatmap(this.loadedOsz.beatmaps[idx]);

    if (this.loadedOsz.audioMap) {
      const bm = this.loadedOsz.beatmaps[idx];
      const audioKey = bm.audioFilename.toLowerCase();
      if (this.loadedOsz.audioMap[audioKey]) {
        this.loadedOsz.audio = this.loadedOsz.audioMap[audioKey];
        console.log(`[audio] Switched to: ${this.loadedOsz.audio.name} for "${bm.version}"`);
      }
    }

    this.el.diffSelectorList.querySelectorAll('.diff-selector__chip').forEach((chip, i) => {
      chip.classList.toggle('is-active', i === idx);
    });

    if (this.selectedDiffIndices.size === 0) {
      this.selectedDiffIndices.add(idx);
      this.renderBatchDiffs();
      this.updateBatchSummary();
    }
  }

  toggleBatchPanel(force) {
    const show = force === undefined ? this.el.batchPanel.hasAttribute('hidden') : force;
    this.el.batchPanel.hidden = !show;
    if (show) {

      this.renderBatchDiffs();
      this.updateBatchSummary();
    }
  }

  renderBatchRates() {
    if (!this.el.batchRates) return;
    this.el.batchRates.innerHTML = '';

    const customRates = this.getCustomRates();
    const allRates = [...new Set([...PRESET_RATES, ...customRates])].sort((a, b) => a - b);

    for (const rate of allRates) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'batch-rate-chip'
        + (this.selectedRates.has(rate) ? ' is-selected' : '')
        + (customRates.includes(rate) ? ' is-custom' : '');
      chip.dataset.rate = rate;
      chip.innerHTML = `${rate.toFixed(2)}×`
        + (customRates.includes(rate) ? `<span class="batch-rate-chip__remove" data-remove="${rate}" title="Remove">×</span>` : '');
      chip.addEventListener('click', (e) => {
        if (e.target.dataset && e.target.dataset.remove !== undefined) {

          e.stopPropagation();
          this.removeCustomRate(parseFloat(e.target.dataset.remove));
        } else {
          this.toggleRate(rate);
        }
      });
      this.el.batchRates.appendChild(chip);
    }
  }

  getCustomRates() {
    try {
      return JSON.parse(localStorage.getItem('osutrainer_custom_rates') || '[]');
    } catch { return []; }
  }

  saveCustomRates(rates) {
    try { localStorage.setItem('osutrainer_custom_rates', JSON.stringify(rates)); } catch { }
  }

  addCustomRate() {
    const v = parseFloat(this.el.batchCustomRate.value);
    if (isNaN(v) || v <= 0) {
      this.toast('Rate must be a positive number', 'error');
      return;
    }
    const customs = this.getCustomRates();
    if (!customs.includes(v) && !PRESET_RATES.includes(v)) {
      customs.push(v);
      this.saveCustomRates(customs);
    }
    this.selectedRates.add(v);
    this.el.batchCustomRate.value = '';
    this.renderBatchRates();
    this.updateBatchSummary();
  }

  removeCustomRate(rate) {
    const customs = this.getCustomRates().filter(r => r !== rate);
    this.saveCustomRates(customs);
    this.selectedRates.delete(rate);
    this.renderBatchRates();
    this.updateBatchSummary();
  }

  toggleRate(rate) {
    if (this.selectedRates.has(rate)) {
      this.selectedRates.delete(rate);
    } else {
      this.selectedRates.add(rate);
    }
    this.renderBatchRates();
    this.updateBatchSummary();
  }

  renderBatchDiffs() {
    if (!this.el.batchDiffs) return;
    this.el.batchDiffs.innerHTML = '';
    const beatmaps = this.loadedOsz ? this.loadedOsz.beatmaps : [];
    if (beatmaps.length === 0) return;

    const allRow = document.createElement('label');
    allRow.className = 'batch-diff-row';
    const allInput = document.createElement('input');
    allInput.type = 'checkbox';
    const allChecked = beatmaps.every((_, i) => this.selectedDiffIndices.has(i));
    allInput.checked = allChecked;
    allInput.addEventListener('change', () => {
      if (allInput.checked) {
        for (let i = 0; i < beatmaps.length; i++) this.selectedDiffIndices.add(i);
      } else {
        this.selectedDiffIndices.clear();
      }
      this.renderBatchDiffs();
      this.updateBatchSummary();
    });
    const allCheck = document.createElement('span');
    allCheck.className = 'batch-diff-row__check';
    const allLabel = document.createElement('span');
    allLabel.className = 'batch-diff-row__label';
    allLabel.innerHTML = `<strong>All difficulties</strong>`;
    const allMeta = document.createElement('span');
    allMeta.className = 'batch-diff-row__meta';
    allMeta.textContent = `${beatmaps.length} total`;
    allRow.appendChild(allInput);
    allRow.appendChild(allCheck);
    allRow.appendChild(allLabel);
    allRow.appendChild(allMeta);
    this.el.batchDiffs.appendChild(allRow);

    beatmaps.forEach((bm, i) => {
      const row = document.createElement('label');
      row.className = 'batch-diff-row';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = this.selectedDiffIndices.has(i);
      input.addEventListener('change', () => {
        if (input.checked) this.selectedDiffIndices.add(i);
        else this.selectedDiffIndices.delete(i);
        this.renderBatchDiffs();
        this.updateBatchSummary();
      });
      const check = document.createElement('span');
      check.className = 'batch-diff-row__check';
      const label = document.createElement('span');
      label.className = 'batch-diff-row__label';
      label.textContent = bm.version || `Diff ${i + 1}`;
      const meta = document.createElement('span');
      meta.className = 'batch-diff-row__meta';
      const modeShort = ['std', 'taiko', 'catch', 'mania'][bm.mode] || '?';
      meta.textContent = `${modeShort} · ${bm.bpm.toFixed(0)}bpm · ${bm.hitObjectCount} obj`;
      row.appendChild(input);
      row.appendChild(check);
      row.appendChild(label);
      row.appendChild(meta);
      this.el.batchDiffs.appendChild(row);
    });
  }

  updateBatchSummary() {
    const rates = [...this.selectedRates].sort((a, b) => a - b);
    const diffCount = this.selectedDiffIndices.size;
    const totalMaps = rates.length * diffCount;
    const audioFiles = rates.filter(r => Math.abs(r - 1.0) > 0.001 || this.editor.changePitch).length;

    this.el.batchSummaryCount.textContent = `${totalMaps} map${totalMaps === 1 ? '' : 's'}`;
    if (totalMaps === 0) {
      this.el.batchSummaryDetail.textContent = 'select rates and difficulties';
    } else {
      const rateStr = rates.length === 0 ? 'no rates'
        : rates.length === 1 ? `${rates[0].toFixed(2)}×`
          : `${rates.length} rates (${rates.map(r => r.toFixed(2) + '×').join(', ')})`;
      const diffStr = diffCount === 0 ? 'no diffs'
        : diffCount === 1 ? '1 diff'
          : `${diffCount} diffs`;
      const audioStr = audioFiles === 0 ? 'no audio processing' : `${audioFiles} audio file${audioFiles === 1 ? '' : 's'}`;
      this.el.batchSummaryDetail.textContent = `${rateStr} · ${diffStr} · ${audioStr}`;
    }
    this.el.BatchGenerateButton.disabled = totalMaps === 0;
  }

  async handleBatchGenerate() {
    if (!this.loadedOsz) return;
    const rates = [...this.selectedRates].sort((a, b) => a - b);
    const diffIndices = [...this.selectedDiffIndices].sort((a, b) => a - b);
    if (rates.length === 0 || diffIndices.length === 0) {
      this.toast('Select at least one rate and one difficulty', 'error');
      return;
    }
    const beatmaps = diffIndices.map(i => this.loadedOsz.beatmaps[i]);
    const audioBlob = this.loadedOsz.audio ? this.loadedOsz.audio.blob : null;
    const totalMaps = rates.length * beatmaps.length;
    const needsAudioCount = rates.filter(r => audioBlob && (Math.abs(r - 1.0) > 0.001 || this.editor.changePitch)).length;

    if (!confirm(
      `Generate ${totalMaps} map${totalMaps === 1 ? '' : 's'}?\n\n` +
      `• Rates: ${rates.map(r => r.toFixed(2) + '×').join(', ')}\n` +
      `• Difficulties: ${beatmaps.map(b => b.version).join(', ')}\n` +
      `• Audio files to process: ${needsAudioCount}\n\n` +
      `This may take several minutes. The .osz will be downloaded when done.`
    )) return;

    try {
      console.log('[batch] Starting batch generate workflow');

      if (needsAudioCount > 0) {
        const { getFFmpeg } = await import('./audio-processor.js');
        await getFFmpeg((msg) => console.log('[ffmpeg]', msg));
      }

      this.showProgress('Generating batch…',
        `${needsAudioCount} audio file${needsAudioCount === 1 ? '' : 's'} + ${totalMaps} beatmap${totalMaps === 1 ? '' : 's'}`);

      const savedBpmRate = this.editor.bpmRate;
      const savedNewBeatmap = this.editor.newBeatmap;
      const savedOriginalBeatmap = this.editor.originalBeatmap;
      const savedState = this.editor.state;

      const audioForBatch = this.loadedOsz.audioMap || null;
      const result = await this.editor.generateBatch(beatmaps, rates, audioBlob, (p) => {
        if (p.phase === 'audio') {
          const pct = ((p.current - 1) + p.ratio) / p.total;
          this.showProgress(
            `Processing audio ${p.current}/${p.total}`,
            `Rate ${p.rate.toFixed(2)}× · ${Math.round(p.ratio * 100)}%`
          );
          this.setProgress(pct * 0.85);
        } else if (p.phase === 'osu') {
          const pct = 0.85 + ((p.current - 1) + p.ratio) / p.total * 0.13;
          this.showProgress(
            `Writing beatmap ${p.current}/${p.total}`,
            `${p.beatmap || ''} · ${p.rate.toFixed(2)}×`
          );
          this.setProgress(pct);
        }
      });

      this.editor.bpmRate = savedBpmRate;
      this.editor.newBeatmap = savedNewBeatmap;
      this.editor.originalBeatmap = savedOriginalBeatmap;
      this.editor.setState(savedState);

      if (!result) {
        this.hideProgress();
        return;
      }

      console.log('[batch] Batch done:', result.osuFiles.length, 'osu files,', result.audioFiles.length, 'audio files');

      this.showProgress('Packaging…', `Building .osz with ${result.osuFiles.length} new files`);
      this.setProgress(0.99);

      const oszBlob = await buildOszMulti(
        this.loadedOsz.files,
        result.osuFiles.map(f => ({ name: f.osuFilename, text: f.osuText })),
        result.audioFiles.map(a => ({ name: a.name, blob: a.blob })),
      );
      console.log('[batch] osz built, size:', oszBlob.size);

      this.setProgress(1);

      const filename = this.getDownloadFilename(beatmaps[0]);
      this.downloadBlob(oszBlob, filename);

      this.hideProgress();
      this.toast(`Created ${result.osuFiles.length} maps in ${filename}`, 'success');

      this.toggleBatchPanel(false);
    } catch (e) {
      console.error('[batch] FAILED:', e);
      this.hideProgress();
      this.toast('Batch failed: ' + e.message, 'error');
    }
  }

  async handleGenerate() {
    if (!this.editor.newMapIsDifferent()) return;
    if (!this.loadedOsz) return;

    try {
      console.log('[generate] Starting generate workflow');

      const { getFFmpeg } = await import('./audio-processor.js');
      await getFFmpeg((msg) => console.log('[ffmpeg]', msg));

      const audioBlob = this.loadedOsz.audio ? this.loadedOsz.audio.blob : null;
      const needsAudio = audioBlob && (Math.abs(this.editor.bpmRate - 1.0) > 0.001 || this.editor.changePitch);
      console.log('[generate] needsAudio:', needsAudio, 'bpmRate:', this.editor.bpmRate, 'changePitch:', this.editor.changePitch);

      this.showProgress(
        needsAudio ? 'Generating beatmap…' : 'Writing beatmap…',
        needsAudio ? 'Processing audio with ffmpeg.wasm' : 'Updating difficulty values',
      );

      const result = await this.editor.generateBeatmap(audioBlob, ({ phase, ratio }) => {
        if (phase === 'audio') {
          this.showProgress('Processing audio…', `ffmpeg.wasm ${Math.round(ratio * 100)}%`);
          this.setProgress(ratio * 0.9);
        } else if (phase === 'osu') {
          this.showProgress('Packaging…', 'Building .osz file');
          this.setProgress(0.95);
        }
      });
      console.log('[generate] generateBeatmap returned:', result ? 'OK' : 'NULL');

      if (!result) {
        console.warn('[generate] generateBeatmap returned null — state was', this.editor.state);
        this.hideProgress();
        return;
      }

      this.showProgress('Packaging…', 'Building .osz file');
      this.setProgress(0.97);

      const originalFiles = this.loadedOsz.files;
      const newAudioForZip = result.audioBlob ? {
        name: result.audioFilename,
        blob: result.audioBlob,
      } : null;
      console.log('[generate] Building osz with audio:', !!newAudioForZip);

      const oszBlob = await buildOsz(
        originalFiles,
        result.osuFilename,
        result.osuText,
        newAudioForZip,
      );
      console.log('[generate] osz built, size:', oszBlob.size);

      this.setProgress(1);

      const filename = this.getDownloadFilename(result.exportBeatmap);
      console.log('[generate] Downloading as:', filename);
      this.downloadBlob(oszBlob, filename);

      this.hideProgress();
      this.toast(`Created ${filename}`, 'success');
    } catch (e) {
      console.error('[generate] FAILED:', e);
      this.hideProgress();
      this.toast('Failed to generate map: ' + e.message, 'error');
    }
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  getDownloadFilename(beatmap) {
    const useOsuName = (() => {
      try { return localStorage.getItem('osutrainer_use_osu_filename') === 'true'; } catch { return false; }
    })();

    if (useOsuName && beatmap && beatmap.filename) {

      const baseName = beatmap.filename.split('/').pop().replace(/\.osu$/i, '');
      return `${baseName}.osz`;
    }

    return makeOszFilename(beatmap);
  }

  render() {
    this.renderState();
    this.renderSong();
    this.renderBpm();
    this.renderDifficulty();
    this.renderLocks();
    this.renderToggles();
    this.renderActions();
    this.renderProfiles();
  }

  renderState() {
    const ready = this.editor.state !== EditorState.NOT_READY;

    const inputs = [
      this.el.HPSlider, this.el.HPDisplay,
      this.el.ODSlider, this.el.ODDisplay,
      this.el.BpmSlider, this.el.BpmMultiplierTextBox,
    ];
    const mode = this.editor.getMode();
    const csEnabled = ready && (mode === GameMode.osu || mode === GameMode.CatchtheBeat);
    const arEnabled = ready && (mode === GameMode.osu || mode === GameMode.CatchtheBeat);

    this.el.CSSlider.disabled = !csEnabled;
    this.el.CSDisplay.disabled = !csEnabled;
    this.el.ARSlider.disabled = !arEnabled;
    this.el.ARDisplay.disabled = !arEnabled;

    inputs.forEach(el => { el.disabled = !ready; });

    const checks = [
      this.el.ScaleARCheck, this.el.ScaleODCheck, this.el.HRCheck,
      this.el.NoSpinnersCheck, this.el.ChangePitchCheck, this.el.highQualityMp3Check,
    ];
    checks.forEach(c => { c.disabled = !ready; });

    if (this.editor.state === EditorState.GENERATING_BEATMAP) {
      this.el.GenerateMapButton.disabled = true;
      this.el.GenerateMapLabel.textContent = 'Working…';
    }
  }

  renderSong() {
    const e = this.editor;
    if (!e.originalBeatmap) {
      this.el.songTitle.textContent = 'Drop an .osz file to begin';
      this.el.songArtist.textContent = 'or click the upload zone below';
      this.el.diffBadge.hidden = true;
      this.el.starsBadge.hidden = true;
      this.el.modeBadge.hidden = true;
      this.el.songCover.classList.remove('has-bg');
      this.el.songCover.style.backgroundImage = '';
      return;
    }

    const bm = e.originalBeatmap;
    this.el.songTitle.textContent = bm.titleUnicode || bm.title || 'Untitled';
    this.el.songArtist.textContent = `${bm.artistUnicode || bm.artist || 'Unknown'} · ${bm.creator || ''}`;

    this.el.diffBadge.hidden = false;
    this.el.diffName.textContent = bm.version || 'Difficulty';

    if (e.starRating > 0) {
      this.el.starsBadge.hidden = false;
      this.el.starsValue.textContent = e.starRating.toFixed(2);
      const color = getDifficultyColor(e.starRating);
      this.el.starsBadge.style.color = color;
    } else {
      this.el.starsBadge.hidden = true;
    }

    this.el.modeBadge.hidden = false;
    this.el.modeName.textContent = modeName(bm.mode);

    if (this.loadedOsz && this.loadedOsz.background) {
      this.el.songCover.classList.add('has-bg');
      this.el.songCover.style.backgroundImage = `url(${this.loadedOsz.background.url})`;
    } else {
      this.el.songCover.classList.remove('has-bg');
      this.el.songCover.style.backgroundImage = '';
    }
  }

  renderBpm() {
    const e = this.editor;
    if (!e.originalBeatmap) {
      this.el.OriginalBpmTextBox.textContent = '—';
      this.el.NewBpmTextBox.value = '—';
      this.el.BpmMultiplierTextBox.value = '1.00';
      this.el.BpmSlider.value = 1.0;
      this.el.OriginalBpmRangeTextBox.textContent = '';
      this.el.NewBpmRangeTextBox.textContent = '';
      return;
    }

    const [oldbpm, oldmin, oldmax] = e.getOriginalBpmData();
    let newbpm, newmin, newmax;
    if (Math.abs(e.bpmRate - 1.0) > 0.001) {
      [newbpm, newmin, newmax] = e.getNewBpmData();
    } else {
      [newbpm, newmin, newmax] = [oldbpm, oldmin, oldmax];
    }

    this.el.OriginalBpmTextBox.textContent = Math.round(oldbpm).toString();
    this.el.NewBpmTextBox.value = Math.round(newbpm).toString();

    if (newbpm > oldbpm + 0.001) {
      this.el.NewBpmTextBox.style.color = 'var(--red)';
    } else if (newbpm < oldbpm - 0.001) {
      this.el.NewBpmTextBox.style.color = 'var(--green)';
    } else {
      this.el.NewBpmTextBox.style.color = 'var(--blue)';
    }

    if (oldmin !== oldmax) {
      this.el.OriginalBpmRangeTextBox.textContent = `(${Math.round(oldmin)} - ${Math.round(oldmax)})`;
    } else {
      this.el.OriginalBpmRangeTextBox.textContent = '';
    }
    if (newmin !== newmax && Math.abs(e.bpmRate - 1.0) > 0.001) {
      this.el.NewBpmRangeTextBox.textContent = `(${Math.round(newmin)} - ${Math.round(newmax)})`;
    } else {
      this.el.NewBpmRangeTextBox.textContent = '';
    }

    this.el.BpmSlider.value = e.bpmRate;

    this.el.BpmMultiplierTextBox.value = e.bpmRate.toString();
  }

  renderDifficulty() {
    const e = this.editor;
    if (!e.newBeatmap) return;

    const set = (displayEl, sliderEl, newVal, originalVal, scaledVal) => {
      displayEl.value = newVal.toFixed(1);
      sliderEl.value = newVal;
      displayEl.classList.remove('is-higher', 'is-lower', 'is-extreme');
      if (newVal > 10) {
        displayEl.classList.add('is-extreme');
      } else if (newVal > originalVal + 0.05) {
        displayEl.classList.add('is-higher');
      } else if (newVal < originalVal - 0.05) {
        displayEl.classList.add('is-lower');
      }
    };

    set(this.el.HPDisplay, this.el.HPSlider, e.newBeatmap.hpDrainRate, e.originalBeatmap.hpDrainRate);
    set(this.el.CSDisplay, this.el.CSSlider, e.newBeatmap.circleSize, e.originalBeatmap.circleSize);

    this.el.ARDisplay.value = e.newBeatmap.approachRate.toFixed(1);
    this.el.ARSlider.value = e.newBeatmap.approachRate;
    this.el.ARDisplay.classList.remove('is-higher', 'is-lower', 'is-extreme');
    if (e.newBeatmap.approachRate > 10) {
      this.el.ARDisplay.classList.add('is-extreme');
    } else if (e.newBeatmap.approachRate > e.getScaledAR() + 0.05) {
      this.el.ARDisplay.classList.add('is-higher');
    } else if (e.newBeatmap.approachRate < e.getScaledAR() - 0.05) {
      this.el.ARDisplay.classList.add('is-lower');
    }

    this.el.ODDisplay.value = e.newBeatmap.overallDifficulty.toFixed(1);
    this.el.ODSlider.value = e.newBeatmap.overallDifficulty;
    this.el.ODDisplay.classList.remove('is-higher', 'is-lower', 'is-extreme');
    if (e.newBeatmap.overallDifficulty > 10) {
      this.el.ODDisplay.classList.add('is-extreme');
    } else if (e.newBeatmap.overallDifficulty > e.getScaledOD() + 0.05) {
      this.el.ODDisplay.classList.add('is-higher');
    } else if (e.newBeatmap.overallDifficulty < e.getScaledOD() - 0.05) {
      this.el.ODDisplay.classList.add('is-lower');
    }

    if (e.starRating > 0) {
      this.el.starsBadge.hidden = false;
      this.el.starsValue.textContent = e.starRating.toFixed(2);
      this.el.starsBadge.style.color = getDifficultyColor(e.starRating);
    } else {
      this.el.starsBadge.hidden = true;
    }
  }

  renderLocks() {
    const e = this.editor;
    this.el.HPLock.dataset.locked = e.hpIsLocked ? 'true' : 'false';
    this.el.CSLock.dataset.locked = e.csIsLocked ? 'true' : 'false';
    this.el.ARLock.dataset.locked = e.arIsLocked ? 'true' : 'false';
    this.el.ODLock.dataset.locked = e.odIsLocked ? 'true' : 'false';
    this.el.BpmLock.dataset.locked = e.bpmIsLocked ? 'true' : 'false';
  }

  renderToggles() {
    const e = this.editor;

    const checks = [
      [this.el.ScaleARCheck, e.scaleAR],
      [this.el.ScaleODCheck, e.scaleOD],
      [this.el.HRCheck, e.forceHardrockCirclesize],
      [this.el.NoSpinnersCheck, e.noSpinners],
      [this.el.ChangePitchCheck, e.changePitch],
      [this.el.highQualityMp3Check, e.highQualityMp3s],
    ];
    for (const [el, val] of checks) {
      if (el.checked !== val) {
        el.checked = val;
      }
    }
    this.renderMultiThreadedToggle();
  }

  async renderMultiThreadedToggle() {
    const { isMultiThreadedEnabled, isMultiThreadingSupported } = await import('./audio-processor.js');
    const enabled = isMultiThreadedEnabled();
    const supported = isMultiThreadingSupported();

    if (this.el.MultiThreadedCheck.checked !== enabled) {
      this.el.MultiThreadedCheck.checked = enabled;
    }

    const toggle = this.el.MultiThreadedToggle;
    const status = this.el.MultiThreadedStatus;
    toggle.classList.remove('is-unsupported', 'is-fallback');

    console.log(`[MT toggle] enabled=${enabled} supported=${supported} SAB=${typeof SharedArrayBuffer !== 'undefined'} crossIsolated=${typeof self !== 'undefined' ? self.crossOriginIsolated : '?'}`);

    if (enabled && supported) {
      let threads = 'all cores';
      try {
        if (navigator.hardwareConcurrency) {
          threads = `${navigator.hardwareConcurrency} cores`;
        }
      } catch { }
      status.textContent = `enabled · ${threads}`;
    } else if (enabled && !supported) {
      toggle.classList.add('is-fallback');
      status.textContent = '⚠ needs COOP/COEP headers — using single-threaded fallback';
    } else {
      status.textContent = 'single-threaded · works everywhere';
    }
  }

  async setMultiThreaded(enabled) {
    const { setMultiThreadedEnabled, isMultiThreadingSupported } = await import('./audio-processor.js');
    const supported = isMultiThreadingSupported();

    if (enabled && !supported) {

      const ok = confirm(
        'Multi-threaded mode requires COOP/COEP headers, which this server is not sending.\n\n' +
        'The toggle will be saved as ON, but audio processing will fall back to single-threaded until you serve the app with the required headers.\n\n' +
        'Continue?'
      );
      if (!ok) {

        this.el.MultiThreadedCheck.checked = !enabled;
        return;
      }
    }

    setMultiThreadedEnabled(enabled);
    this.renderMultiThreadedToggle();
    this.toast(
      enabled
        ? (supported ? 'Multi-threaded enabled' : 'Multi-threaded saved (will fall back to ST here)')
        : 'Single-threaded enabled',
      enabled && supported ? 'success' : 'success'
    );
  }

  _audioApi() {

    return {
      getProcessingMode: () => {
        try {
          const v = localStorage.getItem('osutrainer_processing_mode');
          return v === 'server' ? 'server' : 'local';
        } catch { return 'local'; }
      },
      setProcessingMode: (mode) => {
        try {
          localStorage.setItem('osutrainer_processing_mode', mode === 'server' ? 'server' : 'local');
        } catch {}
      },
    };
  }

  setProcessingMode(mode) {
    const api = this._audioApi();
    api.setProcessingMode(mode);
    this.renderProcessingMode();
    if (mode === 'server') {
      this.toast('Switched to server mode. Verifying connection…', 'success');

      setTimeout(() => this.testServer(), 100);
    } else {
      this.toast('Switched to local browser mode', 'success');
    }
  }

  async testServer() {
    const status = this.el.serverStatus;
    const testBtn = this.el.serverTestBtn;
    status.classList.remove('is-ok', 'is-err');
    status.textContent = 'testing…';
    testBtn.disabled = true;

    try {
      const { checkServerHealth } = await import('./audio-processor.js');
      const result = await checkServerHealth();
      if (result.ok) {
        status.classList.add('is-ok');
        status.textContent = result.ffmpeg
          ? `connected · ffmpeg ready (v${result.version || '?'})`
          : `connected · but ffmpeg not available on server`;
        this.toast('Server is reachable and ready', 'success');
      } else {
        status.classList.add('is-err');
        status.textContent = `failed: ${result.reason || 'unknown error'}`;
        this.toast('Server test failed: ' + (result.reason || 'unknown'), 'error');
      }
    } catch (e) {
      status.classList.add('is-err');
      status.textContent = `failed: ${e.message}`;
      this.toast('Server test failed: ' + e.message, 'error');
    } finally {
      testBtn.disabled = false;
    }
  }

  renderProcessingMode() {
    const api = this._audioApi();
    const mode = api.getProcessingMode();

    this.el.modeLocalBtn.classList.toggle('is-active', mode === 'local');
    this.el.modeServerBtn.classList.toggle('is-active', mode === 'server');
    this.el.serverConfigRow.hidden = (mode !== 'server');

    if (mode === 'server') {
      this.el.MultiThreadedToggle.style.opacity = '0.5';
      this.el.MultiThreadedToggle.style.pointerEvents = 'none';
      this.el.MultiThreadedStatus.textContent = 'disabled in server mode';

      if (this.el.serverStatus.textContent === 'not tested') {
        setTimeout(() => this.testServer(), 50);
      }
    } else {
      this.el.MultiThreadedToggle.style.opacity = '';
      this.el.MultiThreadedToggle.style.pointerEvents = '';
      this.renderMultiThreadedToggle();
    }
  }

  renderActions() {
    const e = this.editor;
    const enabled = (e.state === EditorState.READY) && e.newMapIsDifferent();
    this.el.GenerateMapButton.disabled = !enabled;
    this.el.GenerateMapLabel.textContent = (e.state === EditorState.GENERATING_BEATMAP) ? 'Working…' : 'Create Map';
    this.el.ResetButton.disabled = (e.state !== EditorState.READY);
  }

  renderProfiles() {
    const profiles = this.editor.userProfiles;
    document.querySelectorAll('.profile-card').forEach((card, i) => {
      const p = profiles[i];
      if (!p) return;
      card.querySelector('.profile-card__name').textContent = p.name || `Profile ${i + 1}`;

      const hasData = p.hpIsLocked || p.csIsLocked || p.arIsLocked || p.odIsLocked || p.bpmIsLocked ||
        p.forceHardrockCirclesize || p.noSpinners || p.changePitch ||
        Math.abs(p.bpmMultiplier - 1.0) > 0.001;
      const hint = card.querySelector('.profile-card__hint');
      hint.textContent = hasData ? 'click to load' : 'empty';
    });
  }

  markActiveProfile(idx) {
    document.querySelectorAll('.profile-card').forEach((card, i) => {
      card.classList.toggle('is-active', i === idx);
    });
    setTimeout(() => {
      document.querySelectorAll('.profile-card').forEach((card) => card.classList.remove('is-active'));
    }, 1200);
  }

  flashProfile(idx) {
    const card = document.querySelector(`.profile-card[data-profile="${idx}"]`);
    if (!card) return;
    card.classList.add('is-active');
    setTimeout(() => card.classList.remove('is-active'), 800);
  }

  showProgress(title, subtitle) {
    const wasHidden = this.el.progressOverlay.hidden;
    this.el.progressOverlay.hidden = false;
    this.el.progressTitle.textContent = title;
    this.el.progressSubtitle.textContent = subtitle || '';
    this.setProgress(0);

    if (wasHidden) {
      setTimeout(() => {
        const progressCard = this.el.progressOverlay.querySelector('.progress-card');
        if (progressCard) {
          progressCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
    }
  }

  setProgress(ratio) {
    const pct = Math.max(0, Math.min(1, ratio));
    this.el.progressFill.style.width = (pct * 100) + '%';
    this.el.progressPct.textContent = Math.round(pct * 100) + '%';
  }

  hideProgress() {
    this.el.progressOverlay.hidden = true;
  }

  showModal(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  }

  hideModal(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }

  toast(message, type) {
    const t = this.el.toast;
    t.textContent = message;
    t.classList.remove('is-error', 'is-success');
    if (type === 'error') t.classList.add('is-error');
    if (type === 'success') t.classList.add('is-success');
    t.hidden = false;

    void t.offsetWidth;
    t.classList.add('is-visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      t.classList.remove('is-visible');
      setTimeout(() => { t.hidden = true; }, 220);
    }, 2200);
  }

  escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
