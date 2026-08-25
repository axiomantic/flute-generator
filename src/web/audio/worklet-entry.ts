// Separate esbuild entry point. Bundled to dist/flute-worklet.js and loaded with
// audioWorklet.addModule(), so the processor and WaveguideFlutePipe reach
// AudioWorkletGlobalScope as a real module rather than as text produced by
// Function.prototype.toString(). Nothing here may touch `window` or `document`.
import { FlutePipesProcessor } from './processor.js';

registerProcessor('flute-pipes', FlutePipesProcessor);
