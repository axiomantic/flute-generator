// Third esbuild entry point, bundled to dist/flute-offline.js. It is imported by a page rather
// than by the studio: the example generator opens the served site in a headless browser and
// calls into this module, which is how the gallery's .wav files come out of the same
// AudioWorklet the studio plays through. It must sit beside dist/flute-worklet.js, because
// worklet-loader.js resolves that file against its own bundle URL.
export { renderScoreOffline } from './offline-render.js';
export { scoreDurationSeconds } from '../data/score.js';
export { encodeWav16 } from '../export/wav.js';
