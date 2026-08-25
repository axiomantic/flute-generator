// The worklet is a sibling of this bundle, so its URL is resolved against the bundle's own
// location rather than the page's. index.html at the repo root and the generated copy in
// docs/ therefore load the same file with no path rewriting.
const WORKLET_URL = new URL('./flute-worklet.js', import.meta.url).href;

export async function ensureFluteWorkletModule(ctx: BaseAudioContext): Promise<void> {
  if (!ctx.audioWorklet) throw new Error('AudioWorklet is not available in this browser');
  await ctx.audioWorklet.addModule(WORKLET_URL);
}
