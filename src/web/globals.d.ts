// Two studio callbacks and one timer handle are parked on `window` so that code loaded at
// different times can reach them. They are declared rather than moved, because moving them
// would change when they become visible.
interface Window {
  renderBreathShaper?: () => void;
  playheadTimer?: ReturnType<typeof setInterval>;
  /** Safari's prefixed constructor, probed before the standard one. */
  webkitAudioContext?: typeof AudioContext;
  // Reached from the inline onclick attributes on the preset buttons in index.html.
  saveCurrentFlutePreset?: () => void;
  duplicateCurrentFlutePreset?: () => void;
  deleteCurrentFlutePreset?: () => void;
}

// The OpenSCAD WASM build is loaded at runtime from a sibling of the bundle. It ships no
// types of its own, so only the entry point the studio calls is described here.
declare module '*openscad.js' {
  export function createOpenSCAD(): Promise<{ renderToStl(source: string): Promise<string> }>;
}
