// Studio runtime: DOM wiring, the Three.js viewport, preset/state persistence and the
// audio transport. These share mutable module state (score, breath curve, playback clock,
// scene handles) and are kept in one module so that state stays private to it; every pure
// domain concern (acoustics, solver, geometry, SCAD, data tables) lives in its own module
// and is imported here.
import { SCALES, getMidiName, midiToFreq } from '../data/scales.js';
import { SONG_TEMPLATES } from '../data/songs.js';
import { buildSongScore, getPlayablePitches as scorePlayablePitches, quantizeMidi as scoreQuantizeMidi, midiToHoles as scoreMidiToHoles } from '../data/score.js';
import { DEFAULT_FLUTE_PRESETS } from '../data/presets.js';
import { WOOD_PROFILES, THEME_PRESETS, PART_MATERIAL_CHARACTER, PART_KEYS, ENV_PROFILES } from '../data/appearance.js';
import { WebPhysicalPipe } from '../acoustics/modal.js';
import { computeFluteGeometry } from '../geometry/flute.js';
import { generateScadJs, lastTpuGasketsScad, lastChimneyDisplayScad, lastKeyworkDisplayGroups } from '../cad/scad.js';
import { buildKeywork, classifyKeyworkPart } from '../cad/keywork-scad.js';
import { splitStlComponents } from '../cad/stl-components.js';
import { encodeScoreMidi } from '../export/midi.js';
import { stlStringToGeometry } from '../cad/stl.js';
import { createWoodGrainTexture } from './wood-texture.js';
import { createRoomImpulseBuffer } from '../audio/room-impulse.js';
import { connectFluteOutputChain } from '../audio/output-chain.js';
import { ensureFluteWorkletModule } from '../audio/worklet-loader.js';
import { byId, requireEl, valueOr, eventValue, type StudioEl } from './dom.js';
import type { ScoreNote, BreathPoint, FlutePreset, FluteGeometry, KeyworkMode, PartKey, ToneHole } from '../types.js';

import type * as THREE_NS from 'three';

/** The OpenSCAD WASM module, loaded at runtime from a sibling of this bundle. */
interface OpenScadModule { renderToStl(source: string): Promise<string>; }

/** `err && err.message ? err.message : err`, on a value the catch clause types as unknown. */
function errorText(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}

/** `err.message` on a caught value. */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}


let audioContext: AudioContext | null = null;
let liveProcessorNode: ScriptProcessorNode | null = null;
let isAudioRunning = false;
let dummyOsc: OscillatorNode | null = null;
let dummyGain: GainNode | null = null;
let masterGainNode: GainNode | null = null;

let scoreNotes: ScoreNote[] = [];

// Interactive Breath Curve Wave Shaper State (Normalized 0.0 to 1.0 curve over time)
let breathCurvePoints: BreathPoint[] = [
  { t: 0.0, v: 0.70 },
  { t: 0.25, v: 0.85 },
  { t: 0.50, v: 0.65 },
  { t: 0.75, v: 0.90 },
  { t: 1.0, v: 0.70 }
];
let isDrawingCurve = false;

function initBreathShaperCanvas() {
  const canvasOrNull = byId('shaper-canvas');
  const containerOrNull = byId('shaper-container');
  if (!canvasOrNull || !containerOrNull) return;
  // Rebound so the nested function declarations below see a non-null binding: control-flow
  // narrowing does not reach into a hoisted function body.
  const canvas: StudioEl = canvasOrNull;
  const container: StudioEl = containerOrNull;

  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;

  function renderCurve() {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background horizontal grid lines (25%, 50%, 75%)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    [0.25, 0.50, 0.75].forEach(pct => {
      ctx.beginPath();
      ctx.moveTo(0, h * (1 - pct));
      ctx.lineTo(w, h * (1 - pct));
      ctx.stroke();
    });

    // Draw Smooth Breath Curve Gradient Area
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.02)');

    ctx.beginPath();
    ctx.moveTo(0, h);
    breathCurvePoints.forEach((pt, i) => {
      const x = pt.t * w;
      const y = (1 - pt.v) * h;
      if (i === 0) ctx.lineTo(x, y);
      else {
        const prev = breathCurvePoints[i - 1];
        const cx = (prev.t * w + x) / 2;
        ctx.bezierCurveTo(cx, (1 - prev.v) * h, cx, y, x, y);
      }
    });
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw Curve Stroke
    ctx.beginPath();
    breathCurvePoints.forEach((pt, i) => {
      const x = pt.t * w;
      const y = (1 - pt.v) * h;
      if (i === 0) ctx.moveTo(x, y);
      else {
        const prev = breathCurvePoints[i - 1];
        const cx = (prev.t * w + x) / 2;
        ctx.bezierCurveTo(cx, (1 - prev.v) * h, cx, y, x, y);
      }
    });
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Draw Control Points
    breathCurvePoints.forEach(pt => {
      const x = pt.t * w;
      const y = (1 - pt.v) * h;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Draw Current Playhead Line on Shaper
    const totalScoreDur = scoreNotes.reduce((max, n) => Math.max(max, (n.startTime || 0) + n.duration), 0) || 4.0;
    const playheadNorm = (currentPlaybackTime % totalScoreDur) / totalScoreDur;
    const phX = playheadNorm * w;
    ctx.beginPath();
    ctx.moveTo(phX, 0);
    ctx.lineTo(phX, h);
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function handlePointer(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0.1, Math.min(1.0, 1.0 - ((e.clientY - rect.top) / rect.height)));

    // Find nearest point or insert
    const existing = breathCurvePoints.find(p => Math.abs(p.t - x) < 0.04);
    if (existing) {
      existing.v = parseFloat(y.toFixed(2));
    } else {
      breathCurvePoints.push({ t: parseFloat(x.toFixed(3)), v: parseFloat(y.toFixed(2)) });
      breathCurvePoints.sort((a, b) => a.t - b.t);
    }
    // Ensure endpoints exist
    if (breathCurvePoints[0].t > 0) breathCurvePoints.unshift({ t: 0.0, v: breathCurvePoints[0].v });
    if (breathCurvePoints[breathCurvePoints.length - 1].t < 1.0) breathCurvePoints.push({ t: 1.0, v: breathCurvePoints[breathCurvePoints.length - 1].v });
    renderCurve();
  }

  canvas.onmousedown = (e) => {
    isDrawingCurve = true;
    handlePointer(e);
    window.addEventListener('mousemove', onCanvasMove);
    window.addEventListener('mouseup', onCanvasUp);
  };

  function onCanvasMove(e: MouseEvent): void {
    if (isDrawingCurve) handlePointer(e);
  }

  function onCanvasUp() {
    isDrawingCurve = false;
    window.removeEventListener('mousemove', onCanvasMove);
    window.removeEventListener('mouseup', onCanvasUp);
  }

  renderCurve();
  window.renderBreathShaper = renderCurve;
}

function getBreathPressureAtTime(tNorm: number): number {
  if (!breathCurvePoints || breathCurvePoints.length === 0) return 0.70;
  const clampedT = Math.max(0, Math.min(1, tNorm));
  for (let i = 0; i < breathCurvePoints.length - 1; i++) {
    const p1 = breathCurvePoints[i];
    const p2 = breathCurvePoints[i + 1];
    if (clampedT >= p1.t && clampedT <= p2.t) {
      const span = p2.t - p1.t;
      const alpha = span > 0 ? (clampedT - p1.t) / span : 0;
      return p1.v + alpha * (p2.v - p1.v);
    }
  }
  return breathCurvePoints[breathCurvePoints.length - 1].v;
}

let lastSelectedDuration = 0.5;
let draggedNoteIdx = -1;
let isResizingRight = false;
let isDraggingNote = false;
let dragStartX = 0;
let dragStartY = 0;
let dragOrigDur = 0.5;
let dragOrigStart = 0.0;
let rollZoomMode: string = 'fit';
let rollSnap = 0.125; // Default 1/8 note snap resolution

function snapTime(val: number): number {
  const selSnap = byId('sel-roll-snap');
  const snapVal = selSnap ? selSnap.value : '0.125';
  if (snapVal === 'none') return parseFloat(val.toFixed(3));
  const step = parseFloat(snapVal);
  return parseFloat((Math.round(val / step) * step).toFixed(3));
}

// Physical 1:1 Pitches: 1 Bell fundamental + N physical tone holes + 1 overblow octave
// The three below and regenerateSongForCurrentAcoustics() are DOM adapters over
// src/web/data/score.ts. The logic lives there so the offline example generator builds the
// same score from the same inputs.
function currentScoreInputs(): [number, string, number] {
  return [
    parseInt(requireEl('sel-root').value),
    requireEl('sel-scale').value,
    parseInt(requireEl('sel-holes').value)
  ];
}

function getPlayablePitches() {
  return scorePlayablePitches(...currentScoreInputs());
}

function quantizeMidi(target: number): number {
  return scoreQuantizeMidi(target, ...currentScoreInputs());
}

function midiToHoles(midi: number): boolean[] {
  return scoreMidiToHoles(midi, ...currentScoreInputs());
}



let currentSongKey: string = 'desert_caravan';

function regenerateSongForCurrentAcoustics() {
  const built = buildSongScore(currentSongKey, ...currentScoreInputs());

  // Load the song's tailored breath curve pattern
  if (built.breathCurve.length > 0) {
    breathCurvePoints = built.breathCurve;
    if (window.renderBreathShaper) window.renderBreathShaper();
  }

  scoreNotes = built.notes;

  renderPianoRoll();
}

function populateSongDropdown() {
  const sel = byId('sel-preset-melody');
  if (!sel) return;
  sel.innerHTML = '';
  Object.keys(SONG_TEMPLATES).forEach(k => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.innerText = SONG_TEMPLATES[k].name;
    sel.appendChild(opt);
  });
  sel.value = currentSongKey;
}

// -------------------------------------------------------------
// Global Flute Preset Manager (Complete CAD + Acoustics + Visuals + Song)
let userFlutePresets: Record<string, FlutePreset> = {};

function loadFlutePresetsFromStorage() {
  try {
    const raw = localStorage.getItem('flute_studio_presets_v2');
    userFlutePresets = raw ? JSON.parse(raw) : {};
  } catch(e) { userFlutePresets = {}; }
  populateFlutePresetDropdown();
}

function saveFlutePresetsToStorage() {
  try {
    localStorage.setItem('flute_studio_presets_v2', JSON.stringify(userFlutePresets));
  } catch(e) {}
  populateFlutePresetDropdown();
}

function getAllFlutePresets() {
  return { ...DEFAULT_FLUTE_PRESETS, ...userFlutePresets };
}

function populateFlutePresetDropdown() {
  const sel = byId('sel-flute-preset');
  if (!sel) return;
  const curVal = sel.value;
  sel.innerHTML = '';

  const grpDef = document.createElement('optgroup');
  grpDef.label = "Factory Flutes";
  Object.keys(DEFAULT_FLUTE_PRESETS).forEach(k => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.innerText = DEFAULT_FLUTE_PRESETS[k].name;
    grpDef.appendChild(opt);
  });
  sel.appendChild(grpDef);

  if (Object.keys(userFlutePresets).length > 0) {
    const grpUser = document.createElement('optgroup');
    grpUser.label = "Saved Custom Flutes";
    Object.keys(userFlutePresets).forEach(k => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.innerText = userFlutePresets[k].name;
      grpUser.appendChild(opt);
    });
    sel.appendChild(grpUser);
  }

  if (curVal && (DEFAULT_FLUTE_PRESETS[curVal] || userFlutePresets[curVal])) {
    sel.value = curVal;
  } else {
    sel.value = 'desert_drone';
  }
}

function autoGenerateFlutePresetName() {
  const root = parseInt(requireEl('sel-root').value);
  const scale = requireEl('sel-scale').value.replace(/_/g, ' ');
  const holes = requireEl('sel-holes').value;
  const finish = getActiveWoodFinishKey();
  return `${getMidiName(root)} ${scale.charAt(0).toUpperCase() + scale.slice(1)} ${holes}-Hole (${finish.charAt(0).toUpperCase() + finish.slice(1)})`;
}

/**
 * What a preset means when it does not name a field. Presets written before a field existed —
 * and the four factory presets, which have never carried these — load with the value the markup
 * ships rather than with whatever the previously selected flute happened to leave behind. That
 * is the whole point: loading a preset must land on the same instrument every time.
 *
 * Every value here is the `selected` option or `value` attribute of the matching control in
 * index.html. The gallery-studio test pins those same defaults from the other side.
 */
const PRESET_FIELD_DEFAULTS = {
  drone1Interval: '0',
  drone2Interval: '7',
  tubeShellMode: 'staggered',
  keyworkMode: 'none',
  padMaterial: 'tpu',
  keySlap: '65',
  segments: '1',
  printPart: 'assembled',
  jointTol: '0.18',
  jointLen: '14.0'
} as const;

function saveCurrentFlutePreset() {
  const defaultName = autoGenerateFlutePresetName();
  const name = prompt("Save Complete Flute Preset As:", defaultName);
  if (!name) return;

  const key = 'flute_' + Date.now();
  userFlutePresets[key] = {
    name: name,
    root: requireEl('sel-root').value,
    scale: requireEl('sel-scale').value,
    holes: requireEl('sel-holes').value,
    profile: requireEl('sel-profile').value,
    chimDepth: requireEl('rng-chim-depth').value,
    chimRim: requireEl('rng-chim-rim').value,
    finish: getActiveWoodFinishKey(),
    env: getActiveEnvKey(),
    indicator: getActiveIndicatorKey(),
    theme: currentThemeKey,
    song: currentSongKey,
    // A preset is the whole flute, not only its acoustics: the drone tuning, the shell, the
    // keywork and the print slicing all change what gets built and what gets heard.
    drone1Interval: valueOr('sel-drone1-interval', PRESET_FIELD_DEFAULTS.drone1Interval),
    drone2Interval: valueOr('sel-drone2-interval', PRESET_FIELD_DEFAULTS.drone2Interval),
    tubeShellMode: valueOr('sel-tube-shell-mode', PRESET_FIELD_DEFAULTS.tubeShellMode),
    keyworkMode: valueOr('sel-keywork-mode', PRESET_FIELD_DEFAULTS.keyworkMode),
    padMaterial: valueOr('sel-pad-material', PRESET_FIELD_DEFAULTS.padMaterial),
    keySlap: valueOr('rng-key-slap', PRESET_FIELD_DEFAULTS.keySlap),
    segments: valueOr('sel-print-segments', PRESET_FIELD_DEFAULTS.segments),
    printPart: valueOr('sel-print-part', PRESET_FIELD_DEFAULTS.printPart),
    jointTol: valueOr('rng-joint-tol', PRESET_FIELD_DEFAULTS.jointTol),
    jointLen: valueOr('rng-joint-len', PRESET_FIELD_DEFAULTS.jointLen),
    breathCurve: JSON.parse(JSON.stringify(breathCurvePoints || []))
  };

  saveFlutePresetsToStorage();
  requireEl('sel-flute-preset').value = key;
  persistCurrentStudioState();
}

function duplicateCurrentFlutePreset() {
  saveCurrentFlutePreset();
}

function deleteCurrentFlutePreset() {
  const sel = byId('sel-flute-preset');
  const key = sel ? sel.value : null;
  if (!key || DEFAULT_FLUTE_PRESETS[key]) {
    alert("Built-in factory presets cannot be deleted.");
    return;
  }
  if (confirm(`Delete custom flute preset "${userFlutePresets[key].name}"?`)) {
    delete userFlutePresets[key];
    saveFlutePresetsToStorage();
    applyFlutePreset('desert_drone');
  }
}

function applyFlutePreset(key: string): void {
  const all = getAllFlutePresets();
  const p = all[key] || DEFAULT_FLUTE_PRESETS.desert_drone;

  requireEl('sel-root').value = p.root;
  requireEl('sel-scale').value = p.scale;
  requireEl('sel-holes').value = p.holes;
  requireEl('sel-profile').value = p.profile;
  requireEl('rng-chim-depth').value = p.chimDepth;
  requireEl('rng-chim-rim').value = p.chimRim;
  requireEl('val-chim-depth').innerText = `${parseFloat(p.chimDepth).toFixed(1)} mm`;
  requireEl('val-chim-rim').innerText = `${parseFloat(p.chimRim).toFixed(1)} mm`;

  // The rest of the flute. `?? default` rather than `if (present)`: a preset that omits a field
  // must reset that control, not inherit it from whichever flute was loaded before.
  setValueIfPresent('sel-drone1-interval', p.drone1Interval ?? PRESET_FIELD_DEFAULTS.drone1Interval);
  setValueIfPresent('sel-drone2-interval', p.drone2Interval ?? PRESET_FIELD_DEFAULTS.drone2Interval);
  setValueIfPresent('sel-tube-shell-mode', p.tubeShellMode ?? PRESET_FIELD_DEFAULTS.tubeShellMode);
  setValueIfPresent('sel-keywork-mode', p.keyworkMode ?? PRESET_FIELD_DEFAULTS.keyworkMode);
  setValueIfPresent('sel-pad-material', p.padMaterial ?? PRESET_FIELD_DEFAULTS.padMaterial);
  setValueIfPresent('sel-print-segments', p.segments ?? PRESET_FIELD_DEFAULTS.segments);
  setValueIfPresent('sel-print-part', p.printPart ?? PRESET_FIELD_DEFAULTS.printPart);

  const keySlap = p.keySlap ?? PRESET_FIELD_DEFAULTS.keySlap;
  setValueIfPresent('rng-key-slap', keySlap);
  setTextIfPresent('val-key-slap', `${keySlap}%`);
  const slapGain = currentKeySlapGain();
  postToWaveguide({ type: 'slapGain', value: slapGain });
  if (liveMelPipe) liveMelPipe.keySlapGain = slapGain;
  if (liveD1Pipe) liveD1Pipe.keySlapGain = slapGain;
  if (liveD2Pipe) liveD2Pipe.keySlapGain = slapGain;

  const jointTol = p.jointTol ?? PRESET_FIELD_DEFAULTS.jointTol;
  setValueIfPresent('rng-joint-tol', jointTol);
  setTextIfPresent('val-joint-tol', `${parseFloat(jointTol).toFixed(2)} mm`);

  const jointLen = p.jointLen ?? PRESET_FIELD_DEFAULTS.jointLen;
  setValueIfPresent('rng-joint-len', jointLen);
  setTextIfPresent('val-joint-len', `${parseFloat(jointLen).toFixed(1)} mm`);

  setValueIfPresent('sel-wood-finish', p.finish);
  setValueIfPresent('sel-environment', p.env);
  setValueIfPresent('sel-indicator-style', p.indicator);
  if (p.theme && THEME_PRESETS[p.theme]) applyTheme(p.theme);
  else applyEnvironment(p.env);

  currentSongKey = p.song || 'desert_caravan';
  requireEl('sel-preset-melody').value = currentSongKey;

  if (p.breathCurve && Array.isArray(p.breathCurve) && p.breathCurve.length > 0) {
    breathCurvePoints = JSON.parse(JSON.stringify(p.breathCurve));
    if (window.renderBreathShaper) window.renderBreathShaper();
  }

  updateExportButtonLabels();
  persistCurrentStudioState();
  // The preset may have moved the drone intervals, and the pipes outlive the rebuild.
  syncAudioGeometry();
  regenerateSongForCurrentAcoustics();
  rebuild3DFlute();
}




function resetSongAndBreath() {
  const all = getAllFlutePresets();
  const selPreset = byId('sel-flute-preset');
  const pKey = selPreset ? selPreset.value : 'desert_drone';
  const p = all[pKey] || DEFAULT_FLUTE_PRESETS.desert_drone;

  if (p && p.breathCurve && Array.isArray(p.breathCurve)) {
    breathCurvePoints = JSON.parse(JSON.stringify(p.breathCurve));
  } else {
    breathCurvePoints = [
      { t: 0.0, v: 0.65 },
      { t: 0.25, v: 0.85 },
      { t: 0.50, v: 0.70 },
      { t: 0.75, v: 0.90 },
      { t: 1.0, v: 0.65 }
    ];
  }

  regenerateSongForCurrentAcoustics();
  if (window.renderBreathShaper) window.renderBreathShaper();
  persistCurrentStudioState();
}

function resetBreathCurveOnly() {
  const all = getAllFlutePresets();
  const selPreset = byId('sel-flute-preset');
  const pKey = selPreset ? selPreset.value : 'desert_drone';
  const p = all[pKey] || DEFAULT_FLUTE_PRESETS.desert_drone;

  if (p && p.breathCurve && Array.isArray(p.breathCurve)) {
    breathCurvePoints = JSON.parse(JSON.stringify(p.breathCurve));
  } else {
    breathCurvePoints = [
      { t: 0.0, v: 0.65 },
      { t: 0.25, v: 0.85 },
      { t: 0.50, v: 0.70 },
      { t: 0.75, v: 0.90 },
      { t: 1.0, v: 0.65 }
    ];
  }
  if (window.renderBreathShaper) window.renderBreathShaper();
  persistCurrentStudioState();
}

function quantizeScore() {
  scoreNotes.forEach(s => {
    s.midi = quantizeMidi(s.midi);
    s.holes = midiToHoles(s.midi);
  });
  renderRibbon();
  rebuild3DFlute();
}

function renderPianoRoll(activeIdx = -1) {
  const labelsContainer = byId('pianoroll-labels');
  const track = byId('pianoroll-track');
  const scrollContainer = byId('pianoroll-grid-scroll');
  if (!labelsContainer || !track || !scrollContainer) return;

  const playable = getPlayablePitches();
  const numHoles = parseInt(requireEl('sel-holes').value);
  const reversedPitches = [...playable].reverse();

  // Clear previous labels & notes
  labelsContainer.innerHTML = '';
  track.querySelectorAll('.roll-grid-row, .piano-note-block').forEach(el => el.remove());

  // Compute track width: Fit full container width or scale by fixed bars
  const totalScoreDur = scoreNotes.reduce((max, n) => Math.max(max, (n.startTime || 0) + n.duration), 0) || 4.0;
  const containerW = scrollContainer.clientWidth || 800;

  let effectiveTrackWidth = containerW;
  let pxPerSec = containerW / Math.max(2.0, totalScoreDur);

  const selBars = byId('sel-roll-bars');
  rollZoomMode = selBars ? selBars.value : 'fit';

  if (rollZoomMode === '1') {
    effectiveTrackWidth = Math.max(containerW, 800);
    pxPerSec = effectiveTrackWidth / 4.0;
  } else if (rollZoomMode === '2') {
    effectiveTrackWidth = Math.max(containerW, 1400);
    pxPerSec = effectiveTrackWidth / 8.0;
  } else if (rollZoomMode === '4') {
    effectiveTrackWidth = Math.max(containerW, 2400);
    pxPerSec = effectiveTrackWidth / 16.0;
  } else {
    // 'fit' mode fills 100% of the visible piano roll view seamlessly!
    effectiveTrackWidth = Math.max(containerW, 600);
    pxPerSec = effectiveTrackWidth / Math.max(2.0, totalScoreDur);
  }

  track.style.width = `${effectiveTrackWidth}px`;

  // Render Left Row Labels & Grid Background
  reversedPitches.forEach((pitch, rowIdx) => {
    const origIdx = playable.indexOf(pitch);
    const isCurrentActiveRow = (activeIdx >= 0 && scoreNotes[activeIdx] && scoreNotes[activeIdx].midi === pitch);
    
    const labelRow = document.createElement('div');
    labelRow.className = `roll-row-label ${isCurrentActiveRow ? 'active' : ''}`;
    
    let holeName = 'Bell (All Closed)';
    if (origIdx > 0 && origIdx <= numHoles) {
      holeName = `Hole ${origIdx} Open`;
    } else if (origIdx > numHoles) {
      holeName = 'Overblow (+Octave)';
    }

    labelRow.innerHTML = `
      <span>${getMidiName(pitch)}</span>
      <span class="hole-tag">${holeName}</span>
    `;
    labelsContainer.appendChild(labelRow);

    const gridRow = document.createElement('div');
    gridRow.className = 'roll-grid-row';
    gridRow.dataset.pitch = String(pitch);
    gridRow.dataset.rowIdx = String(rowIdx);

    // Click empty row to append a new note with last selected duration at that exact pitch
    gridRow.onclick = (e) => {
      if (e.target !== gridRow) return;
      insertNoteAtPitch(pitch);
    };

    track.appendChild(gridRow);
  });

  // Render Note Blocks with Overlap & Duration Support
  scoreNotes.forEach((note, idx) => {
    if (note.startTime === undefined) note.startTime = 0;
    const leftPx = note.startTime * pxPerSec;
    const widthPx = Math.max(16, note.duration * pxPerSec - 2);
    const pitchRowIdx = reversedPitches.indexOf(note.midi);
    const rowHeightPct = 100 / reversedPitches.length;
    const topPct = (pitchRowIdx >= 0 ? pitchRowIdx : 0) * rowHeightPct;

    const noteEl = document.createElement('div');
    noteEl.className = `piano-note-block ${idx === activeIdx ? 'active' : ''}`;
    noteEl.style.left = `${leftPx}px`;
    noteEl.style.width = `${widthPx}px`;
    noteEl.style.top = `${topPct}%`;
    noteEl.style.height = `calc(${rowHeightPct}% - 4px)`;
    noteEl.dataset.noteIdx = String(idx);

    noteEl.innerHTML = `
      <span style="pointer-events:none;">${getMidiName(note.midi)}</span>
      <div class="resize-handle" style="position:absolute; right:0; top:0; bottom:0; width:6px; cursor:ew-resize;"></div>
    `;

    // Full 2D Drag Handling (Move Time X, Move Pitch Y, and Horizontal Duration Resize)
    noteEl.onmousedown = (e) => {
      e.stopPropagation();
      e.preventDefault();
      draggedNoteIdx = idx;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragOrigDur = note.duration;
      dragOrigStart = (note.startTime !== undefined) ? note.startTime : 0.0;
      lastSelectedDuration = note.duration;

      if (e.target instanceof HTMLElement && e.target.classList.contains('resize-handle')) {
        isResizingRight = true;
      } else {
        isDraggingNote = true;
      }

      window.addEventListener('mousemove', onNoteMouseMove);
      window.addEventListener('mouseup', onNoteMouseUp);
    };

    noteEl.oncontextmenu = (e) => {
      e.preventDefault();
      if (scoreNotes.length > 1) {
        scoreNotes.splice(idx, 1);
        renderPianoRoll();
      }
    };

    track.appendChild(noteEl);
  });
}

function onNoteMouseMove(e: MouseEvent): void {
  if (draggedNoteIdx < 0 || draggedNoteIdx >= scoreNotes.length) return;
  const note = scoreNotes[draggedNoteIdx];
  const track = byId('pianoroll-track');
  if (!track) return;

  const playable = getPlayablePitches();
  const reversedPitches = [...playable].reverse();
  const totalScoreDur = scoreNotes.reduce((max, n) => Math.max(max, (n.startTime || 0) + n.duration), 0) || 4.0;
  const pxPerSec = track.clientWidth / Math.max(2.0, totalScoreDur);

  if (isResizingRight) {
    const deltaX = e.clientX - dragStartX;
    const rawDur = Math.max(0.05, dragOrigDur + (deltaX / pxPerSec));
    const snappedDur = Math.max(0.05, snapTime(rawDur));
    if (snappedDur !== note.duration) {
      note.duration = snappedDur;
      lastSelectedDuration = note.duration;
      renderPianoRoll();
    }
  } else if (isDraggingNote) {
    // 1. Horizontal Time Dragging with Grid Snap
    const deltaX = e.clientX - dragStartX;
    const rawStart = Math.max(0, dragOrigStart + (deltaX / pxPerSec));
    const snappedStart = snapTime(rawStart);

    // 2. Vertical Tone Hole Pitch Snapping
    const trackRect = track.getBoundingClientRect();
    const relativeY = e.clientY - trackRect.top;
    const rowHeight = trackRect.height / reversedPitches.length;
    const targetRowIdx = Math.max(0, Math.min(reversedPitches.length - 1, Math.floor(relativeY / rowHeight)));
    const targetPitch = reversedPitches[targetRowIdx];

    let changed = false;
    if (snappedStart !== note.startTime) {
      note.startTime = snappedStart;
      changed = true;
    }
    if (targetPitch && targetPitch !== note.midi) {
      note.midi = targetPitch;
      note.holes = midiToHoles(targetPitch);
      changed = true;
    }

    if (changed) {
      lastSelectedDuration = note.duration;
      renderPianoRoll();
    }
  }
}

function onNoteMouseUp() {
  if (draggedNoteIdx >= 0) {
    // Re-sort notes chronologically on mouse release
    scoreNotes.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
    renderPianoRoll();
  }
  draggedNoteIdx = -1;
  isDraggingNote = false;
  isResizingRight = false;
  window.removeEventListener('mousemove', onNoteMouseMove);
  window.removeEventListener('mouseup', onNoteMouseUp);
}

function insertNoteAtPitch(pitch: number): void {
  const noteDur = lastSelectedDuration || 0.5;
  const lastNote = scoreNotes[scoreNotes.length - 1];
  const rawStart = lastNote ? ((lastNote.startTime || 0) + lastNote.duration) : 0;
  const startTime = snapTime(rawStart);
  scoreNotes.push({
    startTime: parseFloat(startTime.toFixed(3)),
    midi: pitch,
    holes: midiToHoles(pitch),
    duration: parseFloat(noteDur.toFixed(3))
  });
  renderPianoRoll();
}

function addNote() {
  const playable = getPlayablePitches();
  const defaultPitch = playable[1] || playable[0];
  insertNoteAtPitch(defaultPitch);
}


function updatePlayheadUI(activeIdx: number): void {
  const track = byId('pianoroll-track');
  const ph = byId('pianoroll-playhead');
  const totalScoreDur = scoreNotes.reduce((max, n) => Math.max(max, (n.startTime || 0) + n.duration), 0) || 4.0;
  const pxPerSec = track ? (track.clientWidth / Math.max(2.0, totalScoreDur)) : 80;

  if (ph) {
    const px = currentPlaybackTime * pxPerSec;
    ph.style.left = `${px}px`;

    const scrollContainer = byId('pianoroll-grid-scroll');
    if (scrollContainer && (px > scrollContainer.scrollLeft + scrollContainer.clientWidth - 80 || px < scrollContainer.scrollLeft)) {
      scrollContainer.scrollLeft = Math.max(0, px - 60);
    }
  }

  // Update active note block classes without destroying DOM
  const noteBlocks = document.querySelectorAll('.piano-note-block');
  noteBlocks.forEach((el, idx) => {
    if (idx === activeIdx) el.classList.add('active');
    else el.classList.remove('active');
  });

  // Update active row label
  const playable = getPlayablePitches();
  const reversedPitches = [...playable].reverse();
  const activePitch = (activeIdx >= 0 && scoreNotes[activeIdx]) ? scoreNotes[activeIdx].midi : null;
  const rowLabels = document.querySelectorAll('.roll-row-label');
  rowLabels.forEach((el, idx) => {
    if (reversedPitches[idx] === activePitch) el.classList.add('active');
    else el.classList.remove('active');
  });
}

function renderRibbon(activeIdx = -1) {
  renderPianoRoll(activeIdx);
}

// 3D Engine: Exact 1:1 OpenSCAD Solid Model & Self-Supporting Donut Chimneys
let scene: THREE_NS.Scene;
let camera: THREE_NS.PerspectiveCamera;
let renderer: THREE_NS.WebGLRenderer;
let controls: OrbitControlsLike;
let fluteRootGroup: THREE_NS.Group | null = null;
let toneHoleMeshes: THREE_NS.Object3D[] = [], fingerMeshes: THREE_NS.Object3D[] = [], keyLeverMeshes: THREE_NS.Object3D[] = [];




// One material instance per part, reused across rebuilds so a theme change can recolour the model in
// place without touching geometry or the WASM compiler.
let partMaterials: Record<PartKey, THREE_NS.MeshStandardMaterial> | null = null;

function makePartMaterial(key: PartKey): THREE_NS.MeshStandardMaterial {
  const ch = PART_MATERIAL_CHARACTER[key];
  const spec: THREE_NS.MeshStandardMaterialParameters = { color: 0xffffff, metalness: ch.metalness, roughness: ch.roughness };
  if (ch.emissiveScale !== undefined) {
    spec.emissive = 0x000000;
    spec.emissiveIntensity = ch.emissiveScale;
  }
  return new THREE.MeshStandardMaterial(spec);
}

function getPartMaterials(): Record<PartKey, THREE_NS.MeshStandardMaterial> {
  if (!partMaterials) {
    // Written out rather than folded over PART_KEYS so the record is complete by construction.
    partMaterials = {
      chimney: makePartMaterial('chimney'),
      axlePin: makePartMaterial('axlePin'),
      hingeStanch: makePartMaterial('hingeStanch'),
      hingeBoss: makePartMaterial('hingeBoss'),
      touchPad: makePartMaterial('touchPad'),
      keyCup: makePartMaterial('keyCup'),
      padGasket: makePartMaterial('padGasket')
    };
    applyPartColors();
  }
  return partMaterials;
}

function applyPartColors() {
  if (!partMaterials) return;
  const palette = (getActiveTheme().parts) || THEME_PRESETS.cedar_canyon.parts;
  const materials = partMaterials;
  PART_KEYS.forEach(function(key) {
    const hex = palette[key];
    if (hex === undefined) return;
    const mat = materials[key];
    mat.color.setHex(hex);
    if (PART_MATERIAL_CHARACTER[key].emissiveScale !== undefined) {
      mat.emissive.setHex(hex).multiplyScalar(0.45);
    }
    mat.needsUpdate = true;
  });
  applyChimneyOpacity();
}

// The transparency knob exists to expose the bore and the internal tubes. Fading the donuts with the
// body would remove the only external landmark that says where a tone hole actually is, but leaving
// them fully opaque would plant solid discs in front of the melody tube. They therefore follow the
// body at half rate: always more solid than the wall, never opaque enough to hide what is behind them.
function applyChimneyOpacity() {
  if (!partMaterials || !partMaterials.chimney) return;
  const bodyOpacity = getActiveOpacityPercent() / 100.0;
  const donutOpacity = 1.0 - (1.0 - bodyOpacity) * 0.5;
  const mat = partMaterials.chimney;
  mat.transparent = (donutOpacity < 0.99);
  mat.opacity = donutOpacity;
  mat.depthWrite = (donutOpacity > 0.6);
  mat.needsUpdate = true;
}

let currentThemeKey: string = 'cedar_canyon';

// A theme carries a default opacity, but a transparency the user dialled in is their own setting.
// restoreStudioState() parks the persisted value here so the boot-time applyTheme() call honours it
// instead of resetting to the theme default; it is consumed once, so later theme picks still apply
// their own opacity.
let pendingRestoredOpacityPercent: number | null = null;

// The individual wood/environment/indicator/opacity selects were removed in favour of the single
// theme picker, so the active theme is the source of truth whenever those controls are absent.
function getActiveTheme() {
  return THEME_PRESETS[currentThemeKey] || THEME_PRESETS.cedar_canyon;
}

function getActiveWoodFinishKey() {
  const sel = byId('sel-wood-finish');
  return sel ? sel.value : getActiveTheme().wood;
}

function getActiveEnvKey() {
  const sel = byId('sel-environment');
  return sel ? sel.value : getActiveTheme().env;
}

function getActiveIndicatorKey() {
  const sel = byId('sel-indicator-style');
  return sel ? sel.value : getActiveTheme().indicator;
}

function getActiveOpacityPercent() {
  const knob = byId('rng-flute-opacity');
  if (!knob) return getActiveTheme().opacity;
  const pct = parseInt(knob.value);
  return isNaN(pct) ? getActiveTheme().opacity : pct;
}

function getActiveFluteMaterialSpec() {
  return {
    finish: WOOD_PROFILES[getActiveWoodFinishKey()] || WOOD_PROFILES.cedar,
    opacityVal: getActiveOpacityPercent() / 100.0
  };
}

function setValueIfPresent(elementId: string, value: string | number | undefined | null): void {
  const el = byId(elementId);
  if (el && value !== undefined && value !== null) el.value = String(value);
}

/** The readout beside a slider. Setting the slider alone leaves the number next to it lying. */
function setTextIfPresent(elementId: string, text: string): void {
  const el = byId(elementId);
  if (el) el.innerText = text;
}

function applyTheme(themeKey: string): void {
  const theme = THEME_PRESETS[themeKey] || THEME_PRESETS.cedar_canyon;
  currentThemeKey = THEME_PRESETS[themeKey] ? themeKey : 'cedar_canyon';

  // Sync the legacy per-property controls where they still exist, so that a later read of them
  // reports the theme rather than a stale value from the previously selected theme.
  setValueIfPresent('sel-wood-finish', theme.wood);
  setValueIfPresent('sel-environment', theme.env);
  setValueIfPresent('sel-indicator-style', theme.indicator);
  const opacityPercent = (pendingRestoredOpacityPercent !== null) ? pendingRestoredOpacityPercent : theme.opacity;
  pendingRestoredOpacityPercent = null;
  setValueIfPresent('rng-flute-opacity', String(opacityPercent));
  const opacityLabel = byId('val-flute-opacity');
  if (opacityLabel) opacityLabel.innerText = `${opacityPercent}%`;

  applyEnvironment(theme.env);
  updateRoomAcoustics(theme.env);

  const finish = WOOD_PROFILES[theme.wood] || WOOD_PROFILES.cedar;
  const woodMap = createWoodGrainTexture(finish.color, finish.dark, finish.grain, finish.isBamboo);
  const opacityVal = opacityPercent / 100.0;

  if (fluteMesh) {
    fluteMesh.material.color.setHex(finish.color);
    fluteMesh.material.map = woodMap;
    fluteMesh.material.roughness = finish.roughness;
    fluteMesh.material.metalness = finish.metalness;
    fluteMesh.material.transparent = (opacityVal < 0.99);
    fluteMesh.material.opacity = opacityVal;
    fluteMesh.material.depthWrite = (opacityVal > 0.6);
    fluteMesh.material.needsUpdate = true;
  }

  applyPartColors();

  setValueIfPresent('sel-theme', currentThemeKey);

  persistCurrentStudioState();
}

requireEl('sel-theme').addEventListener('change', (e) => {
  applyTheme(eventValue(e));
});


// Body transparency rotary knob.
// The rest of the app already talks to `#rng-flute-opacity` through its `.value` (applyTheme,
// restoreStudioState, getActiveOpacityPercent), so the knob exposes a real `value` property whose
// setter also redraws the dial. That keeps those call sites working unchanged against a custom
// control. Transparency is a skin: it mutates the existing material and never rebuilds geometry.
(function initOpacityKnob() {
  const knobOrNull = byId('rng-flute-opacity');
  if (!knobOrNull) return;
  const knob: StudioEl = knobOrNull;

  const MIN = 15, MAX = 100, STEP = 5;
  const CX = 13, CY = 13, R = 10.5, SWEEP_START = -135, SWEEP_DEG = 270;
  const arc = requireEl('knob-opacity-arc');
  const pointer = requireEl('knob-opacity-pointer');
  const readout = requireEl('val-flute-opacity');
  let percent = 100;

  function polar(angleDeg: number): [number, number] {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return [CX + R * Math.cos(rad), CY + R * Math.sin(rad)];
  }

  function render() {
    const angle = SWEEP_START + SWEEP_DEG * (percent - MIN) / (MAX - MIN);
    const [sx, sy] = polar(SWEEP_START);
    const [ex, ey] = polar(angle);
    const largeArc = (angle - SWEEP_START) > 180 ? 1 : 0;
    arc.setAttribute('d', `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${R} ${R} 0 ${largeArc} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`);
    pointer.setAttribute('transform', `rotate(${angle.toFixed(2)} ${CX} ${CY})`);
    readout.innerText = `${percent}%`;
    knob.setAttribute('aria-valuenow', String(percent));
  }

  function setPercent(raw: string | number, notify: boolean): void {
    const parsed = parseFloat(String(raw));
    const snapped = isNaN(parsed) ? percent : Math.round(parsed / STEP) * STEP;
    const next = Math.max(MIN, Math.min(MAX, snapped));
    const changed = (next !== percent);
    percent = next;
    render();
    if (notify && changed) updateFluteMaterialOnly();
  }

  Object.defineProperty(knob, 'value', {
    get() { return String(percent); },
    set(v) { setPercent(v, false); }
  });

  let dragPointerId: number | null = null, dragStartY = 0, dragStartPercent = 100;

  knob.addEventListener('pointerdown', (e) => {
    dragPointerId = e.pointerId;
    dragStartY = e.clientY;
    dragStartPercent = percent;
    knob.setPointerCapture(e.pointerId);
    knob.focus();
    e.preventDefault();
  });

  knob.addEventListener('pointermove', (e) => {
    if (dragPointerId !== e.pointerId) return;
    // 150 px of vertical travel spans the full range.
    setPercent(dragStartPercent + (dragStartY - e.clientY) * ((MAX - MIN) / 150), true);
  });

  function endDrag(e: PointerEvent): void {
    if (dragPointerId !== e.pointerId) return;
    if (knob.hasPointerCapture(e.pointerId)) knob.releasePointerCapture(e.pointerId);
    dragPointerId = null;
  }
  knob.addEventListener('pointerup', endDrag);
  knob.addEventListener('pointercancel', endDrag);

  knob.addEventListener('wheel', (e) => {
    e.preventDefault();
    setPercent(percent + (e.deltaY < 0 ? STEP : -STEP), true);
  }, { passive: false });

  knob.addEventListener('keydown', (e) => {
    let next = null;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = percent + STEP;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = percent - STEP;
    else if (e.key === 'PageUp') next = percent + STEP * 4;
    else if (e.key === 'PageDown') next = percent - STEP * 4;
    else if (e.key === 'Home') next = MIN;
    else if (e.key === 'End') next = MAX;
    if (next === null) return;
    e.preventDefault();
    setPercent(next, true);
  });

  knob.addEventListener('focus', () => { knob.style.boxShadow = '0 0 0 2px var(--accent)'; });
  knob.addEventListener('blur', () => { knob.style.boxShadow = 'none'; });

  render();
})();


let mainLight: THREE_NS.DirectionalLight | null = null;
let sideLight: THREE_NS.DirectionalLight | null = null;
let rimLight: THREE_NS.DirectionalLight | null = null;
let ambientLight: THREE_NS.AmbientLight | null = null;
let groundGrid: THREE_NS.GridHelper | null = null;

function applyEnvironment(envKey: string): void {
  const env = ENV_PROFILES[envKey] || ENV_PROFILES.canyon;
  const container = byId('viewport-container');
  if (container) container.style.background = env.bg;

  if (ambientLight) {
    ambientLight.color.setHex(env.ambient);
    ambientLight.intensity = env.ambientInt;
  }
  if (mainLight) {
    mainLight.color.setHex(env.keyLight);
    mainLight.intensity = env.keyInt;
  }
  if (sideLight) {
    sideLight.color.setHex(env.fillLight);
    sideLight.intensity = env.fillInt;
  }
  if (rimLight) {
    rimLight.color.setHex(env.rimLight || 0xffffff);
    rimLight.intensity = env.rimInt || 1.0;
  }
  if (groundGrid && scene) {
    scene.remove(groundGrid);
    groundGrid = new THREE.GridHelper(600, 20, env.gridColor, env.gridColor);
    groundGrid.position.y = -10;
    groundGrid.material.opacity = 0.25;
    groundGrid.material.transparent = true;
    scene.add(groundGrid);
  }
}

function init3D() {
  const container = requireEl('viewport-container');
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 4000);
  camera.position.set(0, 80, -520);

  renderer = new THREE.WebGLRenderer({ canvas: requireEl('viewport-canvas'), antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.zoomSpeed = 0.35;
  controls.rotateSpeed = 0.65;
  controls.panSpeed = 0.50;

  ambientLight = new THREE.AmbientLight(0xffffff, 1.15);
  scene.add(ambientLight);

  // Key Light (Front-Right high)
  mainLight = new THREE.DirectionalLight(0xffedd5, 1.4);
  mainLight.position.set(160, 220, -380);
  scene.add(mainLight);

  // Fill Light (Front-Left soft)
  sideLight = new THREE.DirectionalLight(0x93c5fd, 0.75);
  sideLight.position.set(-200, 120, -300);
  scene.add(sideLight);

  // Back Rim Light (Behind flute for crisp silhouette edge separation)
  rimLight = new THREE.DirectionalLight(0xffffff, 1.15);
  rimLight.position.set(0, 150, 400);
  scene.add(rimLight);

  groundGrid = new THREE.GridHelper(600, 20, 0x1e293b, 0x1e293b);
  groundGrid.position.y = -10;
  groundGrid.material.opacity = 0.25;
  groundGrid.material.transparent = true;
  scene.add(groundGrid);

  fluteRootGroup = new THREE.Group();
  scene.add(fluteRootGroup);

  // Applied after fluteRootGroup exists but before the first build, so rebuild3DFlute() derives its
  // material from the restored theme. restoreStudioState() has already set currentThemeKey.
  applyTheme(currentThemeKey);

  rebuild3DFlute();

  function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Smoothly animate door-hinge key rotation around vertical flute Z-axis
    if (keyLeverMeshes && keyLeverMeshes.length > 0) {
      keyLeverMeshes.forEach(kGroup => {
        if (kGroup.userData) {
          const target = kGroup.userData.targetAngle !== undefined ? kGroup.userData.targetAngle : (kGroup.userData.openAngle || 0.0);
          kGroup.userData.currAngle += (target - kGroup.userData.currAngle) * 0.30;
          kGroup.rotation.z = kGroup.userData.currAngle;
        }
      });
    }

    renderer.render(scene, camera);
  }
  animate();
}


let fluteMesh: THREE_NS.Mesh<THREE_NS.BufferGeometry, THREE_NS.MeshStandardMaterial> | null = null;
let chimneyMesh: THREE_NS.Mesh<THREE_NS.BufferGeometry, THREE_NS.MeshStandardMaterial> | null = null;
const chimneyStlCache: { key: string; stl: string | null } = { key: '', stl: null };
/** Keyed by the display program's own text, so a rebuild that does not move the keywork is free. */
const keyworkStlCache = new Map<string, string>();


function updateFluteMaterialOnly() {
  if (!fluteMesh) return;
  const { finish, opacityVal } = getActiveFluteMaterialSpec();

  const woodMap = createWoodGrainTexture(finish.color, finish.dark, finish.grain, finish.isBamboo);

  fluteMesh.material.color.setHex(finish.color);
  fluteMesh.material.map = woodMap;
  fluteMesh.material.roughness = finish.roughness;
  fluteMesh.material.metalness = finish.metalness;
  fluteMesh.material.transparent = (opacityVal < 0.99);
  fluteMesh.material.opacity = opacityVal;
  fluteMesh.material.depthWrite = (opacityVal > 0.6);
  fluteMesh.material.needsUpdate = true;

  applyChimneyOpacity();

  persistCurrentStudioState();
}


// Dynamically frame the flute so top and bottom fit comfortably within viewport window
function fitCameraToFlute(targetGroup: THREE_NS.Object3D): void {
  if (!camera || !controls || !targetGroup) return;
  
  // Compute true Three.js world-space bounding box of the entire assembled model + indicators
  const box = new THREE.Box3().setFromObject(targetGroup);
  if (box.isEmpty()) return;

  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  const container = byId('viewport-container');
  const aspect = container ? (container.clientWidth / container.clientHeight) : 1.5;
  const fov = camera.fov * (Math.PI / 180);

  // Determine required distance for both height and width with 25% safety margin
  const distY = (size.y * 1.25) / (2 * Math.tan(fov / 2));
  const distX = (size.x * 1.30) / (2 * Math.tan(fov / 2) * aspect);
  const dist = Math.max(distY, distX, 180);

  // Set near and far planes appropriately for wide scale ranges (Piccolo to Contrabass)
  camera.near = Math.max(0.5, dist / 50);
  camera.far = Math.max(5000, dist * 10);
  camera.updateProjectionMatrix();

  // Position camera directly in front of the center point looking along +Z onto the front face (-Z direction)
  controls.target.copy(center);
  camera.position.set(center.x, center.y, center.z - dist);
  camera.lookAt(center);
  controls.update();
}

// === OpenSCAD WASM renderer: single source of truth ===
// generateScadJs() -> real OpenSCAD WASM -> STL -> Three.js
// Zero hand-translation. Exact 1:1 fidelity with exported .scad

let openSCADInstance: OpenScadModule | null = null;
let renderPending = false;
let renderQueued = false;

async function getOpenSCAD() {
  if (openSCADInstance) return openSCADInstance;
  // Resolved from the bundle's own location: dist/flute.js -> ../openscad.js, which is the
  // repo root when served locally and docs/ when served from the built site.
  const mod = await import('../openscad.js');
  openSCADInstance = await mod.createOpenSCAD();
  return openSCADInstance;
}

// Persist full studio state to LocalStorage
function persistCurrentStudioState() {
  try {
    const state = {
      presetKey: valueOr('sel-flute-preset', 'desert_drone'),
      root: valueOr('sel-root', '69'),
      scale: valueOr('sel-scale', 'hijaz'),
      holes: valueOr('sel-holes', '6'),
      profile: valueOr('sel-profile', 'sac'),
      chimDepth: valueOr('rng-chim-depth', '2.8'),
      chimRim: valueOr('rng-chim-rim', '3.3'),
      theme: currentThemeKey,
      finish: getActiveWoodFinishKey(),
      opacity: String(getActiveOpacityPercent()),
      env: getActiveEnvKey(),
      indicator: getActiveIndicatorKey(),
      song: currentSongKey || 'desert_caravan',
      drone1Interval: valueOr('sel-drone1-interval', '0'),
      drone2Interval: valueOr('sel-drone2-interval', '7'),
      tubeShellMode: valueOr('sel-tube-shell-mode', 'staggered'),
      keyworkMode: valueOr('sel-keywork-mode', 'none'),
      padMaterial: valueOr('sel-pad-material', 'tpu'),
      keySlap: valueOr('rng-key-slap', '65'),
      segments: valueOr('sel-print-segments', '1'),
      printPart: valueOr('sel-print-part', 'assembled'),
      jointTol: valueOr('rng-joint-tol', '0.18'),
      jointLen: valueOr('rng-joint-len', '14.0'),
      breathCurve: breathCurvePoints
    };
    localStorage.setItem('flute_studio_active_state_v1', JSON.stringify(state));
  } catch(e) {
    console.warn('Could not persist studio state:', e);
  }
}

function restoreStudioState() {
  loadFlutePresetsFromStorage();
  populateSongDropdown();

  try {
    const raw = localStorage.getItem('flute_studio_active_state_v1');
    if (raw) {
      const state = JSON.parse(raw);
      if (state.theme && THEME_PRESETS[state.theme]) currentThemeKey = state.theme;
      setValueIfPresent('sel-theme', currentThemeKey);
      if (state.root) requireEl('sel-root').value = state.root;
      if (state.scale) requireEl('sel-scale').value = state.scale;
      if (state.holes) requireEl('sel-holes').value = state.holes;
      if (state.profile) requireEl('sel-profile').value = state.profile;
      if (state.chimDepth) {
        requireEl('rng-chim-depth').value = state.chimDepth;
        requireEl('val-chim-depth').innerText = `${parseFloat(state.chimDepth).toFixed(1)} mm`;
      }
      if (state.chimRim) {
        requireEl('rng-chim-rim').value = state.chimRim;
        requireEl('val-chim-rim').innerText = `${parseFloat(state.chimRim).toFixed(1)} mm`;
      }
      { const el = byId('sel-wood-finish'); if (state.finish && el) el.value = state.finish; }
      const opacityEl = byId('rng-flute-opacity');
      if (state.opacity && opacityEl) {
        opacityEl.value = state.opacity;
        requireEl('val-flute-opacity').innerText = `${state.opacity}%`;
        pendingRestoredOpacityPercent = parseInt(opacityEl.value);
      }
      const envEl = byId('sel-environment');
      if (state.env && envEl) {
        envEl.value = state.env;
        applyEnvironment(state.env);
      }
      { const el = byId('sel-indicator-style'); if (state.indicator && el) el.value = state.indicator; }
      { const el = byId('sel-drone1-interval'); if (state.drone1Interval && el) el.value = state.drone1Interval; }
      { const el = byId('sel-drone2-interval'); if (state.drone2Interval && el) el.value = state.drone2Interval; }
      { const el = byId('sel-tube-shell-mode'); if (state.tubeShellMode && el) el.value = state.tubeShellMode; }
      { const el = byId('sel-keywork-mode'); if (state.keyworkMode && el) el.value = state.keyworkMode; }
      { const el = byId('sel-pad-material'); if (state.padMaterial && el) el.value = state.padMaterial; }
      const keySlapEl = byId('rng-key-slap');
      if (state.keySlap && keySlapEl) {
        keySlapEl.value = state.keySlap;
        requireEl('val-key-slap').innerText = `${state.keySlap}%`;
      }
      { const el = byId('sel-print-segments'); if (state.segments && el) el.value = state.segments; }
      { const el = byId('sel-print-part'); if (state.printPart && el) el.value = state.printPart; }
      const jointTolEl = byId('rng-joint-tol');
      if (state.jointTol && jointTolEl) {
        jointTolEl.value = state.jointTol;
        requireEl('val-joint-tol').innerText = `${parseFloat(state.jointTol).toFixed(2)} mm`;
      }
      const jointLenEl = byId('rng-joint-len');
      if (state.jointLen && jointLenEl) {
        jointLenEl.value = state.jointLen;
        requireEl('val-joint-len').innerText = `${parseFloat(state.jointLen).toFixed(1)} mm`;
      }
      if (state.song) {
        currentSongKey = state.song;
        const melodyEl = byId('sel-preset-melody');
        if (melodyEl) melodyEl.value = state.song;
      }
      if (state.breathCurve && Array.isArray(state.breathCurve) && state.breathCurve.length > 0) {
        breathCurvePoints = JSON.parse(JSON.stringify(state.breathCurve));
        if (window.renderBreathShaper) window.renderBreathShaper();
      }
      const presetEl = byId('sel-flute-preset');
      if (state.presetKey && presetEl) {
        presetEl.value = state.presetKey;
      }
      regenerateSongForCurrentAcoustics();
      return;
    }
  } catch(e) {
    console.error('Could not restore saved studio state, falling back to the default preset:', e);
  }

  // Fallback: apply default Hijaz preset
  applyFlutePreset('desert_drone');
}


function rebuild3DFlute() {
  if (!fluteRootGroup) return;
  if (renderPending) { renderQueued = true; return; }
  renderPending = true;

  // Halt active physical audio playback while compiling 3D CSG geometry
  if (typeof isAudioRunning !== 'undefined' && isAudioRunning) {
    stopAudio();
  }

  const spinner = byId('render-spinner');
  if (spinner) spinner.classList.remove('hidden');
  
  const rootMidi      = parseInt(requireEl('sel-root').value);
  const numHoles      = parseInt(requireEl('sel-holes').value);
  const scaleKey      = requireEl('sel-scale').value;
  const profile       = requireEl('sel-profile').value;
  const chimneyDepth  = parseFloat(requireEl('rng-chim-depth').value);
  const rimThickness  = parseFloat(requireEl('rng-chim-rim').value);
  const numSegments   = parseInt(valueOr('sel-print-segments', '1'));
  const printPart     = valueOr('sel-print-part', 'assembled');
  const jointTol      = parseFloat(valueOr('rng-joint-tol', '0.18'));
  const jointLen      = parseFloat(valueOr('rng-joint-len', '14.0'));
  const drone1Int     = parseInt(valueOr('sel-drone1-interval', '0'));
  const drone2Int     = parseInt(valueOr('sel-drone2-interval', '7'));
  const tubeShellMode = valueOr('sel-tube-shell-mode', 'staggered');
  const keyworkMode   = valueOr('sel-keywork-mode', 'none');
  const padMaterial   = valueOr('sel-pad-material', 'tpu');

  const scadStr = generateScadJs(rootMidi, scaleKey, numHoles, profile, chimneyDepth, rimThickness, numSegments, printPart, jointTol, jointLen, drone1Int, drone2Int, tubeShellMode, keyworkMode, padMaterial);
  const chimneyScadStr = lastChimneyDisplayScad;
  const keyworkGroups = lastKeyworkDisplayGroups;
  requireEl('lbl-status').innerText = 'Compiling OpenSCAD WASM...';

  let scadEngine: OpenScadModule | null = null;
  let bodyRenderMs = 0, chimneyRenderMs = 0, keyworkRenderMs = 0;
  let keyworkNotice = '';

  getOpenSCAD()
    .then(function(scad) {
      scadEngine = scad;
      const t0 = performance.now();
      return scad.renderToStl(scadStr).then(function(stl) {
        bodyRenderMs = performance.now() - t0;
        return stl;
      });
    })
    .then(function(stl) {
      if (!chimneyScadStr) return { stl: stl, chimneyStl: null };
      // The donut source depends only on pitch, scale, hole count and the two chimney dimensions, so
      // most rebuild triggers (segments, joints, keywork, drones, shell mode) leave it untouched. A
      // second WASM invocation costs about as much as the body render regardless of how small the
      // program is, so re-using the previous result is what keeps that cost off the common path.
      if (chimneyStlCache.key === chimneyScadStr) return { stl: stl, chimneyStl: chimneyStlCache.stl };
      const t0 = performance.now();
      if (!scadEngine) throw new Error('OpenSCAD engine was not captured by the first stage');
      return scadEngine.renderToStl(chimneyScadStr).then(
        function(chimneyStl) {
          chimneyRenderMs = performance.now() - t0;
          chimneyStlCache.key = chimneyScadStr;
          chimneyStlCache.stl = chimneyStl;
          return { stl: stl, chimneyStl: chimneyStl };
        },
        function(err) {
          // The donuts are also part of the body solid, so a failed display render costs colour, not shape.
          console.warn('Chimney display render failed; donuts stay uncoloured inside the body mesh:', err);
          return { stl: stl, chimneyStl: null };
        }
      );
    })
    .then(async function(rendered) {
      // The keywork display programs, rendered from the same modules the printed body contains.
      const groups: { part: PartKey; stl: string }[] = [];
      for (const group of keyworkGroups) {
        const cached = keyworkStlCache.get(group.scad);
        if (cached !== undefined) { groups.push({ part: group.part, stl: cached }); continue; }
        if (!scadEngine) throw new Error('OpenSCAD engine was not captured by the first stage');
        const t0 = performance.now();
        try {
          const kwStl = await scadEngine.renderToStl(group.scad);
          keyworkRenderMs += performance.now() - t0;
          if (keyworkStlCache.size > 12) keyworkStlCache.clear();
          keyworkStlCache.set(group.scad, kwStl);
          groups.push({ part: group.part, stl: kwStl });
        } catch (err) {
          // The mechanism is already part of the body solid; a failed display render costs colour
          // and animation, not shape.
          console.warn('Keywork display render failed; the mechanism stays part of the body mesh:', err);
        }
      }
      return { ...rendered, keywork: groups };
    })
    .then(function(rendered) {
      const stl = rendered.stl;

      if (!fluteRootGroup) throw new Error('3D scene has not been initialised');
      while (fluteRootGroup.children.length > 0)
        fluteRootGroup.remove(fluteRootGroup.children[0]);
      toneHoleMeshes = [];
      fingerMeshes   = [];
      keyLeverMeshes = [];

      const geom = stlStringToGeometry(stl);
      const { finish, opacityVal } = getActiveFluteMaterialSpec();

      const woodMap = createWoodGrainTexture(finish.color, finish.dark, finish.grain, finish.isBamboo);

      const mat = new THREE.MeshStandardMaterial({
        color: finish.color,
        map: woodMap,
        roughness: finish.roughness,
        metalness: finish.metalness,
        transparent: (opacityVal < 0.99),
        opacity: opacityVal,
        depthWrite: (opacityVal > 0.6)
      });
      fluteMesh = new THREE.Mesh(geom, mat);

      // Rotate so the flute stands upright (Y-axis) with front face (+Y in SCAD) pointing forward (+Z in Three.js)
      fluteMesh.rotation.x = -Math.PI / 2;

      geom.computeBoundingBox();
      const box = geom.boundingBox;
      if (!box) throw new Error('STL geometry produced no bounding box');
      const cx  = (box.min.x + box.max.x) / 2;
      const cy  = (box.min.y + box.max.y) / 2;
      fluteMesh.position.set(-cx, 0, cy);
      fluteRootGroup.add(fluteMesh);

      // Parented to fluteMesh with an identity transform. Both meshes come out of OpenSCAD in the same
      // coordinate space, so the parent's rotation and centring offset land them on top of each other
      // exactly; deriving a placement here is what caused the two earlier misalignments.
      chimneyMesh = null;
      if (rendered.chimneyStl) {
        chimneyMesh = new THREE.Mesh(stlStringToGeometry(rendered.chimneyStl), getPartMaterials().chimney);
        chimneyMesh.renderOrder = 1;
        fluteMesh.add(chimneyMesh);
      }

      // Acoustic & Geometric dimensions for Three.js keywork placement
      const fluteGeom = computeFluteGeometry(rootMidi, scaleKey, numHoles, drone1Int, drone2Int, chimneyDepth, rimThickness);
      // Drilled hole count, which the scale may have reduced below the requested one.
      const drilledHoles = fluteGeom.numHoles;

      // The keywork, split into its solids and parented to fluteMesh with an identity transform.
      // Both meshes leave OpenSCAD in the same coordinate space, so nothing here places a part:
      // the rotation a pressed key applies is about the pivot the layout already computed, which
      // is the same expression the emitted SCAD uses.
      const kwLayout = buildKeywork(fluteGeom, keyworkMode as KeyworkMode, numSegments, jointLen).layout;
      if (kwLayout) {
        const parts = getPartMaterials();
        for (const group of rendered.keywork) {
          for (const comp of splitStlComponents(group.stl)) {
            const role = classifyKeyworkPart(kwLayout, comp.min, comp.max);
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(comp.positions, 3));
            g.computeVertexNormals();
            const mesh = new THREE.Mesh(g, parts[group.part === 'padGasket' ? 'padGasket' : role.part]);
            if (role.pivot && role.openAngle !== undefined) {
              const pivot = new THREE.Group();
              pivot.position.set(role.pivot.x, role.pivot.y, 0);
              mesh.position.set(-role.pivot.x, -role.pivot.y, 0);
              pivot.add(mesh);
              pivot.userData = {
                holeIndex: role.holeIndex,
                openAngle: role.openAngle,
                closedAngle: 0,
                currAngle: role.openAngle,
                targetAngle: role.openAngle
              };
              pivot.rotation.z = role.openAngle;
              fluteMesh.add(pivot);
              keyLeverMeshes.push(pivot);
            } else {
              fluteMesh.add(mesh);
            }
          }
        }
        if (kwLayout.warnings.length > 0) {
          console.warn(`[keywork] ${kwLayout.warnings.length} warning(s) for this instrument:`);
          for (const w of kwLayout.warnings) console.warn(`[keywork] !! ${w.code}: ${w.message}`);
        }
      }
      keyworkNotice = kwLayout && kwLayout.warnings.length > 0
        ? `keywork: ${kwLayout.warnings.length} warning(s) - ` + kwLayout.warnings.map((w) => w.code).join(', ')
        : '';

      // Automatically frame camera so entire flute height and hardware fits in viewport
      if (fluteRootGroup) fitCameraToFlute(fluteRootGroup);

      const facets = (stl.match(/facet normal/g) || []).length;
      requireEl('lbl-status').innerText = fluteGeom.holeNotice ? 'Engine Ready – holes reduced'
        : (fluteGeom.tuningNotice ? 'Engine Ready – tuning compromised'
        : (keyworkNotice ? 'Engine Ready – keywork warnings' : 'Engine Ready'));
      requireEl('lbl-viewport-title').innerText =
        'Parametric ' + drilledHoles + '-Hole Triple Flute (' + getMidiName(rootMidi) + ')';
      requireEl('lbl-viewport-sub').innerText =
        'OpenSCAD WASM Exact Solid Model • ' + facets.toLocaleString() + ' Polygons'
        + (fluteGeom.holeNotice ? ' • ' + fluteGeom.holeNotice : '')
        + (fluteGeom.tuningNotice ? ' • ' + fluteGeom.tuningNotice : '')
        + (keyworkNotice ? ' • ' + keyworkNotice : '');

      console.log('WASM render OK:', facets, 'facets',
        '| body', bodyRenderMs.toFixed(0) + 'ms',
        '| chimneys', chimneyRenderMs.toFixed(0) + 'ms',
        '| keywork', keyworkRenderMs.toFixed(0) + 'ms',
        '(+' + (bodyRenderMs > 0 ? (100 * chimneyRenderMs / bodyRenderMs).toFixed(1) : '0') + '%)');
      setTimeout(() => {
        if (spinner) spinner.classList.add('hidden');
        renderPending = false;
        if (renderQueued) {
          renderQueued = false;
          setTimeout(rebuild3DFlute, 50);
        }
      }, 150);
    })
    .catch(function(err) {
      console.error('OpenSCAD WASM error:', err);
      requireEl('lbl-status').innerText = 'Render error';
      if (spinner) spinner.classList.add('hidden');
      renderPending = false;
    });
}


function update3DFingersPose(activeHoles: boolean[] | null): void {
  // Animate Fingertip indicators
  if (fingerMeshes && fingerMeshes.length > 0) {
    fingerMeshes.forEach((fGroup, idx) => {
      const isCovered = (activeHoles && idx < activeHoles.length) ? activeHoles[idx] : true;
      const targetZ = isCovered ? (fGroup.userData.closedZ || 20) : (fGroup.userData.openZ || 30);
      fGroup.position.z += (targetZ - fGroup.position.z) * 0.35;
    });
  }

  // Animate Articulated Mechanical Door-Hinge Key Levers
  if (keyLeverMeshes && keyLeverMeshes.length > 0) {
    keyLeverMeshes.forEach((kGroup, idx) => {
      // Indexed by the HOLE the part belongs to, not by build order: keys_low keys a subset, and
      // the build order used to be read as a hole number.
      const hole = typeof kGroup.userData.holeIndex === 'number' ? kGroup.userData.holeIndex : idx;
      const isCovered = (activeHoles && hole < activeHoles.length) ? activeHoles[hole] : true;
      kGroup.userData.targetAngle = isCovered ? (kGroup.userData.closedAngle || 0.0) : (kGroup.userData.openAngle || 0.20);
    });
  }
}




// ============================================================================
// Audio engine selection.
//   'waveguide' - digital waveguide bore + tone hole lattice, runs in an AudioWorklet.
//                 Pitch is a consequence of the geometry, not of midiToFreq().
//   'modal'     - the original WebPhysicalPipe bank of biquad resonators on a
//                 ScriptProcessor. Pitch is forced to equal temperament.
// The modal engine is retained verbatim as an A/B reference and as a fallback that
// involves no worklet at all. Change this one constant to switch; there is no UI for it.
// ============================================================================
const FLUTE_AUDIO_ENGINE = 'waveguide';

let liveWorkletNode: AudioWorkletNode | null = null;
let lastPostedScoreSig = '';


// silently mute. Every failure path here reports to the console AND to the status label.
async function startWaveguideEngine(geom: FluteGeometry): Promise<boolean> {
  try {
    // startAudio() creates the context before calling this; an absent one is reported through
    // the same catch that reports every other startup failure.
    const ctx = audioContext;
    if (!ctx) throw new Error('audio context has not been created');
    await ensureFluteWorkletModule(ctx);
    liveWorkletNode = new AudioWorkletNode(ctx, 'flute-pipes', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: {
        geometry: geom,
        score: scoreNotes,
        breath: breathCurvePoints,
        slapGain: currentKeySlapGain()
      }
    });
    liveWorkletNode.port.onmessage = (e) => {
      if (e.data && e.data.type === 'time') currentPlaybackTime = e.data.playTime;
    };
    liveWorkletNode.onprocessorerror = (e) => {
      console.error('[flute] waveguide worklet processor error', e);
      setAudioEngineError('Waveguide worklet crashed - see console');
    };
    lastPostedScoreSig = '';
    return true;
  } catch (err) {
    console.error('[flute] failed to start the waveguide AudioWorklet:', err);
    setAudioEngineError('Waveguide engine failed to load: ' + errorText(err));
    return false;
  }
}

function setAudioEngineError(msg: string): void {
  const el = byId('lbl-status');
  if (el) el.innerText = 'AUDIO ERROR: ' + msg;
}

function postToWaveguide(msg: Record<string, unknown>): void {
  if (liveWorkletNode) { try { liveWorkletNode.port.postMessage(msg); } catch (e) {} }
}

// The worklet holds its own copy of the score and breath curve because it schedules per
// sample. Pushing on a cheap signature change keeps the two in step without posting the
// whole score on every UI frame.
function syncWaveguideScore() {
  if (!liveWorkletNode) return;
  const sig = scoreNotes.length + ':' + scoreNotes.map(s => `${s.midi},${s.startTime},${s.duration},${(s.holes || []).join('')}`).join('|')
    + '#' + breathCurvePoints.map(p => `${p.t},${p.v}`).join('|');
  if (sig === lastPostedScoreSig) return;
  lastPostedScoreSig = sig;
  postToWaveguide({ type: 'score', score: scoreNotes.map(s => ({ midi: s.midi, startTime: s.startTime || 0, duration: s.duration, holes: s.holes || [] })) });
  postToWaveguide({ type: 'breath', breath: breathCurvePoints.map(p => ({ t: p.t, v: p.v })) });
}


// High-Fidelity Spatial Room Simulator (Algorithmic Impulse Generator)
let convolverNode: ConvolverNode | null = null;
let wetGainNode: GainNode | null = null;
let dryGainNode: GainNode | null = null;


function updateRoomAcoustics(envKey: string): void {
  if (!audioContext || !convolverNode) return;
  try {
    convolverNode.buffer = createRoomImpulseBuffer(audioContext, envKey);
  } catch(e) {}
}

let liveMelPipe: WebPhysicalPipe | null = null, liveD1Pipe: WebPhysicalPipe | null = null, liveD2Pipe: WebPhysicalPipe | null = null;
let currentPlaybackTime = 0.0;
let liveArticNote: ScoreNote | null = null;

function currentKeySlapGain() {
  const el = byId('rng-key-slap');
  if (!el) return 0.65;
  const v = parseInt(el.value, 10);
  return isNaN(v) ? 0.65 : v / 100.0;
}

// Impact energy scales with how many pads actually travel; a release is softer than a
// closure because lifting pads are spring-returned rather than finger-driven.
function keySlapImpactBetween(prevNote: ScoreNote | null, nextNote: ScoreNote | null): number {
  if (!nextNote) return 0.50;
  const prev = prevNote && Array.isArray(prevNote.holes) ? prevNote.holes : null;
  const next = Array.isArray(nextNote.holes) ? nextNote.holes : null;
  if (!prev || !next || prev.length !== next.length || next.length === 0) return 0.85;
  let moved = 0;
  for (let i = 0; i < next.length; i++) {
    if (prev[i] !== next[i]) moved++;
  }
  return 0.45 + 0.55 * Math.min(1.0, moved / next.length);
}

// Reads the geometry the CAD panel is currently describing. Same inputs generateScadJs() gets,
// so the printed instrument and the synthesised one cannot disagree.
function currentFluteGeometry() {
  const num = (id: string, dflt: number): number => {
    const el = byId(id);
    const v = el ? parseFloat(el.value) : NaN;
    return isNaN(v) ? dflt : v;
  };
  const scaleEl = byId('sel-scale');
  return computeFluteGeometry(
    num('sel-root', 69),
    scaleEl ? scaleEl.value : 'hijaz',
    num('sel-holes', 6),
    num('sel-drone1-interval', 0),
    num('sel-drone2-interval', 7),
    num('rng-chim-depth', 2.8),
    num('rng-chim-rim', 3.3)
  );
}

// The pipes outlive any single note, so a geometry change has to reach them here. Constructing
// them once in startAudio() is what let the CAD bore and the synthesised bore drift apart.
function syncAudioGeometry() {
  const geom = currentFluteGeometry();
  if (liveWorkletNode) postToWaveguide({ type: 'geometry', geometry: geom });
  if (!liveMelPipe || !liveD1Pipe || !liveD2Pipe) return geom;
  liveMelPipe.setGeometry(geom.melody.bore, geom.melody.acousticLength);
  liveD1Pipe.setGeometry(geom.drone1.bore, geom.drone1.acousticLength);
  liveD2Pipe.setGeometry(geom.drone2.bore, geom.drone2.acousticLength);
  // The score never addresses the drones, so their pitch has to follow the root from here too.
  liveD1Pipe.setFreq(geom.drone1.frequency);
  liveD2Pipe.setFreq(geom.drone2.frequency);
  return geom;
}

async function startAudio() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') await audioContext.resume();

  const sr = audioContext.sampleRate;
  const geom = currentFluteGeometry();

  liveArticNote = null;
  currentPlaybackTime = 0.0;

  // Pure Acoustic Flow Graph: engine node (Dry Model) -> Master Split -> [Dry Gain + Convolver Room Reverb Wet Gain] -> Destination
  let engineNode: AudioNode | null = null;
  if (FLUTE_AUDIO_ENGINE === 'waveguide') {
    const ok = await startWaveguideEngine(geom);
    if (!ok) { isAudioRunning = false; return; }
    engineNode = liveWorkletNode;
    isAudioRunning = true;
  } else {
    liveMelPipe = new WebPhysicalPipe(sr, geom.melody.bore, geom.melody.acousticLength);
    liveD1Pipe = new WebPhysicalPipe(sr, geom.drone1.bore, geom.drone1.acousticLength);
    liveD2Pipe = new WebPhysicalPipe(sr, geom.drone2.bore, geom.drone2.acousticLength);

    liveD1Pipe.setFreq(geom.drone1.frequency);
    liveD2Pipe.setFreq(geom.drone2.frequency);

    const startSlapGain = currentKeySlapGain();
    liveMelPipe.keySlapGain = startSlapGain;
    liveD1Pipe.keySlapGain = startSlapGain;
    liveD2Pipe.keySlapGain = startSlapGain;

    isAudioRunning = true;
    liveProcessorNode = audioContext.createScriptProcessor(2048, 1, 2);
    engineNode = liveProcessorNode;
  }

  if (!engineNode) throw new Error('no audio engine node was created');

  // The same graph builder the offline .wav render uses, so a rendered example and live
  // playback cannot drift apart in the output stage.
  const chain = connectFluteOutputChain(audioContext, engineNode, valueOr('sel-environment', 'canyon'));
  dryGainNode = chain.dryGain;
  wetGainNode = chain.wetGain;
  convolverNode = chain.convolver;
  masterGainNode = chain.masterGain;

  if (liveProcessorNode) {
  // A ScriptProcessor with no connected input is not guaranteed to be pulled; the silent
  // oscillator keeps it alive. An AudioWorklet needs no such keep-alive.
  dummyOsc = audioContext.createOscillator();
  dummyGain = audioContext.createGain();
  dummyGain.gain.value = 0.0;
  dummyOsc.connect(dummyGain);
  dummyGain.connect(liveProcessorNode);
  dummyOsc.start();

  liveProcessorNode.onaudioprocess = (e) => {
    if (!isAudioRunning) return;
    // The modal branch above creates all three pipes together; this states that invariant
    // rather than letting an audio-thread TypeError turn into unexplained silence.
    const mel = liveMelPipe, d1 = liveD1Pipe, d2 = liveD2Pipe;
    if (!mel || !d1 || !d2) return;
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);

    const totalDur = scoreNotes.reduce((max, s) => Math.max(max, (s.startTime || 0) + s.duration), 0) || 4.0;
    const dt = 1.0 / sr;

    for (let i = 0; i < 2048; i++) {
      currentPlaybackTime += dt;
      if (currentPlaybackTime >= totalDur) currentPlaybackTime = 0.0;

      let activeNotes = [];
      for (let s of scoreNotes) {
        const sTime = s.startTime || 0;
        if (currentPlaybackTime >= sTime && currentPlaybackTime < sTime + s.duration) {
          activeNotes.push(s);
        }
      }

      const normTime = (currentPlaybackTime % totalDur) / totalDur;
      const liveBreathIntensity = getBreathPressureAtTime(normTime);

      const topNote = activeNotes.length > 0 ? activeNotes[activeNotes.length - 1] : null;
      if (topNote !== liveArticNote) {
        mel.triggerKeySlap(keySlapImpactBetween(liveArticNote, topNote));
        liveArticNote = topNote;
      }

      let sM = 0;
      if (topNote) {
        mel.setFreq(midiToFreq(topNote.midi));
        sM = mel.process(liveBreathIntensity * 0.90);
      } else {
        sM = mel.process(0.0);
      }

      const sD1 = d1.process(liveBreathIntensity * 0.75);
      const sD2 = d2.process(liveBreathIntensity * 0.65);

      // Pure Linear Acoustic Bore Summation (Zero artificial distortion/clipping)
      outL[i] = (sD1 * 0.50 + sD2 * 0.25 + sM * 0.85) * 0.50;
      outR[i] = (sD1 * 0.25 + sD2 * 0.50 + sM * 0.85) * 0.50;
    }
  };
  }
  requireEl('btn-play').innerText = '⏸ Pause';

  if (window.playheadTimer) clearInterval(window.playheadTimer);
  window.playheadTimer = setInterval(() => {
    if (!isAudioRunning) return;
    syncWaveguideScore();
    let activeIdx = -1;
    for (let i = scoreNotes.length - 1; i >= 0; i--) {
      const s = scoreNotes[i];
      const sTime = s.startTime || 0;
      if (currentPlaybackTime >= sTime && currentPlaybackTime < sTime + s.duration) {
        activeIdx = i;
        break;
      }
    }
    
    const track = byId('pianoroll-track');
    const ph = requireEl('pianoroll-playhead');
    const totalScoreDur = scoreNotes.reduce((max, n) => Math.max(max, (n.startTime || 0) + n.duration), 0) || 4.0;
    const pxPerSec = track ? (track.clientWidth / Math.max(2.0, totalScoreDur)) : 80;

    updatePlayheadUI(activeIdx);
    if (window.renderBreathShaper) window.renderBreathShaper();
    if (activeIdx >= 0) {
      update3DFingersPose(scoreNotes[activeIdx].holes);
    }
  }, 30);
}

function stopAudio() {
  isAudioRunning = false;
  if (dummyOsc) { try { dummyOsc.stop(); dummyOsc.disconnect(); } catch(e){} }
  if (liveProcessorNode) { liveProcessorNode.onaudioprocess = null; liveProcessorNode.disconnect(); liveProcessorNode = null; }
  if (liveWorkletNode) {
    try { liveWorkletNode.port.postMessage({ type: 'stop' }); } catch(e){}
    try { liveWorkletNode.disconnect(); } catch(e){}
    liveWorkletNode = null;
  }
  if (window.playheadTimer) clearInterval(window.playheadTimer);
  updatePlayheadUI(-1);
  update3DFingersPose([]);
  requireEl('btn-play').innerText = '▶ Play';
}

requireEl('btn-play').addEventListener('click', async () => {
  if (isAudioRunning) stopAudio();
  else await startAudio();
});
requireEl('btn-stop').addEventListener('click', stopAudio);
// Spacebar global Play/Pause toggle (ignored when typing in form inputs)
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.key === ' ') {
    const tag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return; // allow normal typing/selection inside form controls
    }
    e.preventDefault();
    if (isAudioRunning) {
      stopAudio();
    } else {
      startAudio();
    }
  }
});

requireEl('btn-add-note').addEventListener('click', addNote);
requireEl('btn-reset-song').addEventListener('click', resetSongAndBreath);
requireEl('btn-reset-breath').addEventListener('click', resetBreathCurveOnly);
requireEl('sel-roll-bars').addEventListener('change', () => { renderPianoRoll(); });
requireEl('sel-roll-snap').addEventListener('change', () => { renderPianoRoll(); });
window.addEventListener('resize', () => { if (byId('pianoroll-track')) renderPianoRoll(); if (window.renderBreathShaper) initBreathShaperCanvas(); });

// Scale, Hole Count, Root Pitch & Chimney Listeners
function onAcousticsChanged() {
  persistCurrentStudioState();
  // Ahead of rebuild3DFlute(), which suspends audio while OpenSCAD compiles: this way the pipes
  // are already on the new geometry whether or not the rebuild path runs.
  syncAudioGeometry();
  regenerateSongForCurrentAcoustics();
  rebuild3DFlute();
}

requireEl('sel-holes').addEventListener('change', onAcousticsChanged);
requireEl('sel-scale').addEventListener('change', onAcousticsChanged);
requireEl('sel-drone1-interval').addEventListener('change', onAcousticsChanged);
requireEl('sel-drone2-interval').addEventListener('change', onAcousticsChanged);
requireEl('sel-tube-shell-mode').addEventListener('change', onAcousticsChanged);
requireEl('sel-root').addEventListener('change', onAcousticsChanged);
requireEl('sel-profile').addEventListener('change', () => {
  rebuild3DFlute();
});

requireEl('sel-preset-melody').addEventListener('change', (e) => {
  currentSongKey = eventValue(e);
  persistCurrentStudioState();
  regenerateSongForCurrentAcoustics();
});
requireEl('sel-flute-preset').addEventListener('change', (e) => {
  applyFlutePreset(eventValue(e));
});



requireEl('sel-keywork-mode').addEventListener('change', () => {
  persistCurrentStudioState();
  rebuild3DFlute();
});
requireEl('sel-pad-material').addEventListener('change', () => {
  persistCurrentStudioState();
  rebuild3DFlute();
});
requireEl('rng-key-slap').addEventListener('input', (e) => {
  requireEl('val-key-slap').innerText = `${eventValue(e)}%`;
  const g = currentKeySlapGain();
  postToWaveguide({ type: 'slapGain', value: g });
  if (liveMelPipe) liveMelPipe.keySlapGain = g;
  if (liveD1Pipe) liveD1Pipe.keySlapGain = g;
  if (liveD2Pipe) liveD2Pipe.keySlapGain = g;
  persistCurrentStudioState();
});

// The two export buttons do NOT produce the same thing, and each now says which. The ZIP is the
// print bundle: it always contains every segment, because a bundle holding one part of a
// four-part instrument is not printable. The .SCAD download is the source for exactly what the
// viewport is showing, so that a part visible on screen can be opened in OpenSCAD as-is. The
// selector drives the preview and the .SCAD, never the ZIP.
function segmentPartLabel(printPart: string): string {
  return printPart === 'assembled' ? 'assembly' : `segment ${printPart.replace('part_', '')}`;
}

function updateExportButtonLabels(): void {
  const scadBtn = byId('btn-export-scad');
  if (scadBtn) scadBtn.innerText = `💾 .SCAD (${segmentPartLabel(valueOr('sel-print-part', 'assembled'))})`;

  const zipBtn = byId('btn-export-stl-zip');
  // Skipped mid-export, when the handler owns the caption and will restore its own.
  if (zipBtn && !zipBtn.disabled) {
    const segments = parseInt(valueOr('sel-print-segments', '1'));
    zipBtn.innerText = segments === 1
      ? '📦 Export Printable STLs (.ZIP, 1 piece)'
      : `📦 Export Printable STLs (.ZIP, all ${segments} segments)`;
  }
}

requireEl('sel-print-segments').addEventListener('change', () => {
  updateExportButtonLabels();
  persistCurrentStudioState();
  rebuild3DFlute();
});
requireEl('sel-print-part').addEventListener('change', () => {
  updateExportButtonLabels();
  persistCurrentStudioState();
  rebuild3DFlute();
});
requireEl('rng-joint-tol').addEventListener('input', (e) => {
  requireEl('val-joint-tol').innerText = `${parseFloat(eventValue(e)).toFixed(2)} mm`;
  persistCurrentStudioState();
  rebuild3DFlute();
});
requireEl('rng-joint-len').addEventListener('input', (e) => {
  requireEl('val-joint-len').innerText = `${parseFloat(eventValue(e)).toFixed(1)} mm`;
  persistCurrentStudioState();
  rebuild3DFlute();
});

requireEl('rng-chim-depth').addEventListener('input', (e) => {
  requireEl('val-chim-depth').innerText = `${parseFloat(eventValue(e)).toFixed(1)} mm`;
  persistCurrentStudioState();
  rebuild3DFlute();
});



requireEl('rng-chim-rim').addEventListener('input', (e) => {
  requireEl('val-chim-rim').innerText = `${parseFloat(eventValue(e)).toFixed(1)} mm`;
  persistCurrentStudioState();
  rebuild3DFlute();
});


// Download OpenSCAD

// Batch STL Export (Generates and bundles all printable segments into a ready-to-print ZIP)
requireEl('btn-export-stl-zip').addEventListener('click', async () => {
  const btn = requireEl('btn-export-stl-zip');
  const origText = btn.innerText;
  btn.innerText = '⏳ Slicing STLs in WASM...';
  btn.disabled = true;

  try {
    const root = parseInt(requireEl('sel-root').value);
    const scaleKey = requireEl('sel-scale').value;
    const numHoles = parseInt(requireEl('sel-holes').value);
    const profile = requireEl('sel-profile').value;
    const chimneyDepth = parseFloat(requireEl('rng-chim-depth').value);
    const rimThickness = parseFloat(requireEl('rng-chim-rim').value);
    const numSegments = parseInt(valueOr('sel-print-segments', '1'));
    const jointTol = parseFloat(valueOr('rng-joint-tol', '0.18'));
    const jointLen = parseFloat(valueOr('rng-joint-len', '14.0'));
    const drone1Int = parseInt(valueOr('sel-drone1-interval', '0'));
    const drone2Int = parseInt(valueOr('sel-drone2-interval', '7'));
    const tubeShellMode = valueOr('sel-tube-shell-mode', 'staggered');
    const keyworkMode = valueOr('sel-keywork-mode', 'none');
    const padMaterial = valueOr('sel-pad-material', 'tpu');

    const zip = new JSZip();
    const scad = await getOpenSCAD();
    const fluteName = `${getMidiName(root)}_${scaleKey}_${numHoles}hole`;

    if (numSegments === 1) {
      requireEl('lbl-status').innerText = 'Rendering Monolithic STL...';
      const code = generateScadJs(root, scaleKey, numHoles, profile, chimneyDepth, rimThickness, 1, 'assembled', jointTol, jointLen, drone1Int, drone2Int, tubeShellMode, keyworkMode, padMaterial);
      const stl = await scad.renderToStl(code);
      zip.file(`${fluteName}_full_monolithic.stl`, stl);
    } else {
      for (let s = 1; s <= numSegments; s++) {
        requireEl('lbl-status').innerText = `Rendering Segment ${s}/${numSegments} with socket joints...`;
        const partKey = `part_${s}`;
        const code = generateScadJs(root, scaleKey, numHoles, profile, chimneyDepth, rimThickness, numSegments, partKey, jointTol, jointLen, drone1Int, drone2Int, tubeShellMode, keyworkMode, padMaterial);
        const stl = await scad.renderToStl(code);
        let partLabel = 'head';
        if (s === numSegments) partLabel = 'foot_bell';
        else if (s > 1) partLabel = `mid_section_${s-1}`;
        zip.file(`${fluteName}_segment_${s}_of_${numSegments}_${partLabel}.stl`, stl);
      }
    }

    // Include the complete parametric OpenSCAD source file in the zip
    const masterScad = generateScadJs(root, scaleKey, numHoles, profile, chimneyDepth, rimThickness, numSegments, 'assembled', jointTol, jointLen, drone1Int, drone2Int, tubeShellMode, keyworkMode, padMaterial);
    zip.file(`${fluteName}_master_cad.scad`, masterScad);

    // Export Separate TPU Pad Gasket Rings STL if TPU/Silicone mode selected
    if (keyworkMode !== 'none' && lastTpuGasketsScad) {
      requireEl('lbl-status').innerText = 'Generating TPU Gasket STLs...';
      const tpuScad = `// TPU Soft Key Gasket Rings for ${fluteName}\n$fn = 48;\n${lastTpuGasketsScad}\n`;
      try {
        const tpuStl = await scad.renderToStl(tpuScad);
        zip.file(`${fluteName}_TPU_key_gaskets_set.stl`, tpuStl);
      } catch(e){
        console.error('TPU gasket STL render failed; the ZIP will omit the gasket set:', e);
      }
    }

    requireEl('lbl-status').innerText = 'Packaging ZIP archive...';
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fluteName}_printable_segments_${numSegments}pcs_tol_${jointTol.toFixed(2)}mm.zip`;
    a.click();
    URL.revokeObjectURL(url);
    requireEl('lbl-status').innerText = 'STLs Exported Successfully!';
  } catch(err) {
    console.error('STL Export Error:', err);
    alert('Error generating STL files: ' + errorMessage(err));
    requireEl('lbl-status').innerText = 'Export error';
  } finally {
    btn.innerText = origText;
    btn.disabled = false;
  }
});

requireEl('btn-export-scad').addEventListener('click', () => {
  const root = parseInt(requireEl('sel-root').value);
  const scaleKey = requireEl('sel-scale').value;
  const numHoles = parseInt(requireEl('sel-holes').value);
  const profile = requireEl('sel-profile').value;
  const chimneyDepth = parseFloat(requireEl('rng-chim-depth').value);
  const rimThickness = parseFloat(requireEl('rng-chim-rim').value);
  const numSegments = parseInt(valueOr('sel-print-segments', '1'));
  const printPart = valueOr('sel-print-part', 'assembled');
  const jointTol = parseFloat(valueOr('rng-joint-tol', '0.18'));
  const jointLen = parseFloat(valueOr('rng-joint-len', '14.0'));
  const drone1Int = parseInt(valueOr('sel-drone1-interval', '0'));
  const drone2Int = parseInt(valueOr('sel-drone2-interval', '7'));
  const tubeShellMode = valueOr('sel-tube-shell-mode', 'staggered');
  const keyworkMode = valueOr('sel-keywork-mode', 'none');
  const padMaterial = valueOr('sel-pad-material', 'tpu');

  // generateScadJs() is the single source of truth for geometry: the 3D preview, the per-part
  // STL renders, the ZIP's master SCAD, and this download all call it with the same inputs, so
  // every export describes the same instrument.
  const scadContent = generateScadJs(root, scaleKey, numHoles, profile, chimneyDepth, rimThickness, numSegments, printPart, jointTol, jointLen, drone1Int, drone2Int, tubeShellMode, keyworkMode, padMaterial);

  // The part belongs in the name. Without it, exporting segment 2 and then segment 3 produced
  // two different files under one filename.
  const partSuffix = printPart === 'assembled' ? 'assembled' : `${printPart}_of_${numSegments}`;
  const blob = new Blob([scadContent], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `flute_${root}_${scaleKey}_${numHoles}holes_${partSuffix}.scad`;
  a.click();
});

// The gallery has always shipped a flute.mid beside each example; this is the same encoder on
// the score the piano roll is currently showing, so the studio can produce what the gallery does.
requireEl('btn-export-midi').addEventListener('click', () => {
  try {
    if (scoreNotes.length === 0) {
      alert('The piano roll is empty, so there is no melody to write.');
      return;
    }
    const root = parseInt(requireEl('sel-root').value);
    const scaleKey = requireEl('sel-scale').value;
    const numHoles = parseInt(requireEl('sel-holes').value);
    const bytes = encodeScoreMidi({
      score: scoreNotes,
      breath: breathCurvePoints,
      drone1Midi: root + parseInt(valueOr('sel-drone1-interval', '0')),
      drone2Midi: root + parseInt(valueOr('sel-drone2-interval', '7'))
    });
    // Copied into a fresh buffer: `bytes` is a view, and Blob must not capture more than it.
    const blob = new Blob([bytes.slice()], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flute_${getMidiName(root)}_${scaleKey}_${numHoles}holes.mid`;
    a.click();
    URL.revokeObjectURL(url);
    requireEl('lbl-status').innerText = `MIDI Exported (${bytes.length} bytes)`;
  } catch (err) {
    console.error('MIDI Export Error:', err);
    alert('Error writing the MIDI file: ' + errorMessage(err));
    requireEl('lbl-status').innerText = 'Export error';
  }
});

// index.html wires the three preset buttons with inline onclick attributes, which resolve
// against the global scope. The studio is now a module, so those three functions are the only
// ones published there; everything else stays module-private.
window.saveCurrentFlutePreset = saveCurrentFlutePreset;
window.duplicateCurrentFlutePreset = duplicateCurrentFlutePreset;
window.deleteCurrentFlutePreset = deleteCurrentFlutePreset;

// Init
// Each stage is isolated so that a failure in one (state restore, breath shaper) cannot stop
// init3D() and leave the viewport permanently empty.
setTimeout(() => {
  const bootStages: [string, () => void][] = [
    ['restoreStudioState', restoreStudioState],
    ['updateExportButtonLabels', updateExportButtonLabels],
    ['init3D', init3D]
  ];
  for (const [stageName, stage] of bootStages) {
    try {
      stage();
    } catch (err) {
      console.error(`Boot stage "${stageName}" failed:`, err);
    }
  }
  setTimeout(() => {
    try {
      initBreathShaperCanvas();
    } catch (err) {
      console.error('Boot stage "initBreathShaperCanvas" failed:', err);
    }
  }, 100);
}, 80);
