// The pure domain surface, free of DOM and AudioWorklet globals, so it can be bundled for Node.
// Two consumers: the equivalence harness (same suite run against the pre-refactor inline script
// and against these modules) and the example gallery generator under scripts/.
export { generateScadJs } from '../cad/scad.js';
export { computeFluteGeometry, computeSmartJointCuts } from '../geometry/flute.js';
export { midiToFreq, getMidiName, SCALES } from '../data/scales.js';
export { SONG_TEMPLATES } from '../data/songs.js';
export { buildSongScore, getPlayablePitches, quantizeMidi, midiToHoles, scoreDurationSeconds } from '../data/score.js';
export { encodeScoreMidi } from '../export/midi.js';
export { encodeWav16 } from '../export/wav.js';
export { WaveguideFlutePipe } from '../acoustics/waveguide.js';
export { WebPhysicalPipe } from '../acoustics/modal.js';
export { solveHoleGeometryCached } from '../acoustics/solver.js';
