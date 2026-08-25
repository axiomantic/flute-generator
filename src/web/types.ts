// Domain types shared by the solver, the geometry builder, the CAD generator and the audio
// engines. computeFluteGeometry() returns the single FluteGeometry object all four read.

/** A tone hole as the acoustic lattice sees it: position, size and the wall it is cut through. */
export interface LatticeHole {
  distanceFromFipple: number;
  diameter: number;
  chimneyDepth: number;
  /** Wall thickness at this hole. Undefined means "use the pipe's own wallThickness". */
  wall?: number;
}

/** A drilled tone hole. Carries the lattice fields plus what the CAD and the UI need. */
export interface ToneHole extends LatticeHole {
  index: number;
  interval: number;
  midi: number;
  frequency: number;
  /** Absolute CAD z of the hole centre: fippleZ - distanceFromFipple. */
  z: number;
  rimThickness: number;
  wall: number;
}

export interface SolverResidual { degree: number; cents: number; }

export interface LatticeSolverReport {
  sweeps: number;
  maxDeltaMM: number;
  /** Labels of the unknowns the sweep could not place exactly: 'acousticLength', 'degreeN'. */
  unreachable: string[];
  residuals: SolverResidual[];
  maxResidualCents: number;
  minCentreGapMM: number;
  minGapMM: number;
  spacingOK: boolean;
  converged: boolean;
}

/**
 * A lattice report after the diameter search has closed over it. solveToneHoleLattice() cannot
 * produce these fields: venting is a property of the chosen diameter, not of one lattice solve.
 */
export interface SolverReport extends LatticeSolverReport {
  ventRatio: number;
  ventTarget: number;
  ventShortfall: boolean;
  diameter: number;
  diameterLadder: { min: number; max: number; step: number; count: number; ranked: number };
  diameterLimit: string;
}

/** A lattice entry while the solver is still moving it: carries the degree it must sound. */
export interface SolverLatticeHole extends LatticeHole {
  degree: number;
  target: number;
  wall: number;
}

/** Reduced-fidelity knobs used only for the diameter ranking pass. */
export interface LatticeSolveOptions { maxSweeps?: number; posSteps?: number; freqIters?: number; }

export interface DiameterCandidate {
  diameter: number;
  minGap: number;
  hit: LatticeSolution;
  spacingOK: boolean;
  unreachCount: number;
  maxResidualCents: number;
  rmsResidualCents: number;
  ventRatio: number;
}

export interface BracketResult {
  /** null only if every bracket midpoint evaluated to NaN; arithmetic on it coerces to 0. */
  x: number | null;
  exact: boolean;
}

export interface LatticeSolution {
  acousticLength: number;
  /** Keyed by scale degree: 0 is the bell fundamental, 1..n the tone holes. */
  distanceByDegree: Record<number, number>;
  solver: LatticeSolverReport;
}

/** A lattice solution carrying the diameter search's verdict. */
export interface FullLatticeSolution extends LatticeSolution {
  solver: SolverReport;
}

export interface HoleGeometrySolution {
  diameter: number;
  minGap: number;
  solved: FullLatticeSolution;
}

export interface TubeGeometry {
  bore: number;
  acousticLength: number;
  frequency: number;
  holes: ToneHole[];
}

export interface DroppedHole { requestedIndex: number; interval: number; }

/** The instrument. Single source of truth for CAD, the 3D scene and both audio engines. */
export interface FluteGeometry {
  rootMidi: number;
  scaleKey: string;
  /** Holes actually drilled, after unusable scale degrees were dropped. */
  numHoles: number;
  requestedHoles: number;
  droppedHoles: DroppedHole[];
  holeNotice: string;
  tuningNotice: string;
  tuningSolver: SolverReport;
  drone1Interval: number;
  drone2Interval: number;
  scaleIntervals: number[];
  speedOfSound: number;
  wall: number;
  outerDiameter: number;
  tubeSpacing: number;
  holeDiameter: number;
  chimneyDepth: number;
  rimThickness: number;
  headLength: number;
  bodyLength: number;
  totalLength: number;
  fippleZ: number;
  windowLength: number;
  melody: TubeGeometry;
  drone1: TubeGeometry;
  drone2: TubeGeometry;
}

export interface JointCuts { zCut1: number; zCut2: number; zCut3: number; }

/**
 * Pad position arrays are branded so the instantaneous position and the commanded target
 * cannot be assigned to one another. Both are Float64Array at runtime; the brand exists only
 * at compile time and costs nothing.
 */
declare const padKind: unique symbol;
/** Where each pad IS, this sample. Moves toward the target at padTravelSamples. */
export type PadOpenness = Float64Array & { readonly [padKind]: 'instantaneous' };
/** Where each pad has been TOLD to go. Set by setFingering(), never by the audio loop. */
export type PadTarget = Float64Array & { readonly [padKind]: 'target' };

export type NoteHoles = boolean[];
export interface ScoreNote { midi: number; startTime: number; duration: number; holes: NoteHoles; }
export interface BreathPoint { t: number; v: number; }

export type PrintPart = 'assembled' | 'part_1' | 'part_2' | 'part_3' | 'part_4';
export type TubeShellMode = 'staggered' | 'unified';
export type KeyworkMode = 'none' | 'keys_all' | 'keys_low';
export type PadMaterial = 'tpu' | 'silicone' | 'pla_rigid';
export type BoreProfile = 'sac' | 'arched' | 'venturi' | 'flat';

// ---------------------------------------------------------------------------------------
// Appearance tables.

/** Every value here is a part classifyKeyworkPart() can actually return, or one the scene
 *  assigns directly (chimney, padGasket). A key with no emitter is a palette entry nothing
 *  colours. */
export type PartKey = 'chimney' | 'axlePin' | 'hingeStanch' | 'hingeBoss'
  | 'touchPad' | 'keyCup' | 'padGasket';

export interface WoodProfile {
  name: string;
  color: number;
  dark: number;
  roughness: number;
  metalness: number;
  grain: number;
  isBamboo: boolean;
}

export interface ThemePreset {
  wood: string;
  env: string;
  opacity: number;
  indicator: string;
  parts: Record<PartKey, number>;
}

export interface PartCharacter {
  metalness: number;
  roughness: number;
  /** Present only on the two parts that self-illuminate. */
  emissiveScale?: number;
}

export interface EnvProfile {
  bg: string;
  ambient: number; ambientInt: number;
  keyLight: number; keyInt: number;
  fillLight: number; fillInt: number;
  rimLight: number; rimInt: number;
  gridColor: number;
}

export interface SongTemplate {
  name: string;
  breathCurve: BreathPoint[];
  /** Scale degrees with durations; degrees above the scale length wrap up an octave. */
  intervals: { deg: number; d: number }[];
}

export interface FlutePreset {
  name: string;
  root: string; scale: string; holes: string; profile: string;
  chimDepth: string; chimRim: string;
  finish: string; env: string; indicator: string;
  song: string;
  breathCurve: BreathPoint[];
  // Only user-saved presets carry the rest of the studio state. A preset written before a field
  // was added simply lacks it, and applyFlutePreset() falls back to the studio's shipped default
  // for that control rather than leaving the previous flute's value in place.
  theme?: string;
  opacity?: string;
  drone1Interval?: string;
  drone2Interval?: string;
  tubeShellMode?: string;
  keyworkMode?: string;
  padMaterial?: string;
  keySlap?: string;
  segments?: string;
  printPart?: string;
  jointTol?: string;
  jointLen?: string;
  score?: ScoreNote[];
}
