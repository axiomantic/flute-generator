// Articulated saxophone-style keywork, v2.
//
// One hollow pad rod per keyed hole, parallel to the flute axis, turning in its own journal
// sleeve fused to the flat front facet. Touch keys are hinge tubes on a single stationary
// spindle at x = 0, held by N+1 stanchions. Each pad rod carries a lug whose rounded nose comes
// down onto the touch key's foot through a TPU regulation bumper - push-only, sax-style. One TPU
// leaf spring per key drives the whole train closed. Normally closed; pressing opens the hole.
//
// Every dimension here is derived from the FluteGeometry object computeFluteGeometry() returns.
// The design study (scratch/keywork/keywork_v2.scad) re-derived the hole lattice in OpenSCAD so
// it could stand alone; that reimplementation is deliberately NOT carried over, because two
// copies of the same physics is exactly how this codebase has drifted before.
//
// Reference: scratch/keywork/DESIGN_v2.md. Section numbers below point into it.

import type { FluteGeometry, KeyworkMode, ToneHole } from '../types.js';

/** Every tunable the mechanism has. One object so a caller can sweep one number in a test. */
export interface KeyworkParams {
  /** RADIAL running clearance, rod->sleeve and spindle->hinge tube. Never derived from jointTol. */
  sleeveTol: number;
  padForce: number;
  liftFrac: number;
  /** Torsional modulus of Z-printed PLA, MPa. Chosen low on purpose. */
  gPla: number;
  thetaMaxDeg: number;
  windupFrac: number;
  sleeveWall: number;
  webH: number;
  landPitch: number;
  landLen: number;
  landRelief: number;
  armZ: number;
  rodOver: number;
  pitchMin: number;
  pitchMax: number;
  touchArm: number;
  plateW: number;
  plateT: number;
  plateUp: number;
  btnTravel: number;
  postT: number;
  beamT: number;
  bridgeT: number;
  bridgeClear: number;
  barT: number;
  barLift: number;
  ledgeFrac: number;
  footT: number;
  regT: number;
  bridgePre: number;
  contactW: number;
  leafW: number;
  leafLmin: number;
  leafPre: number;
  tpuE: number;
  dovetail: number;
  legW: number;
  leafGap: number;
  maxBuildZ: number;
  minPitchWarn: number;
  sealPreload: number;
  cupFacets: number;
  padT: number;
  ePla: number;
}

export const DEFAULT_KEYWORK_PARAMS: KeyworkParams = {
  sleeveTol: 0.35,
  padForce: 1.2,
  liftFrac: 0.28,
  gPla: 600,
  thetaMaxDeg: 2.5,
  windupFrac: 0.60,
  sleeveWall: 2.0,
  webH: 1.5,
  landPitch: 55,
  landLen: 6,
  landRelief: 1.2,
  armZ: 6.0,
  rodOver: 4.0,
  pitchMin: 13,
  pitchMax: 22,
  touchArm: 12.0,
  plateW: 16.0,
  plateT: 2.8,
  plateUp: 14.0,
  btnTravel: 2.6,
  postT: 4.5,
  beamT: 5.0,
  bridgeT: 6.0,
  bridgeClear: 2.0,
  barT: 3.0,
  barLift: 3.0,
  ledgeFrac: 0.62,
  footT: 3.0,
  regT: 1.5,
  bridgePre: 0.4,
  contactW: 7.0,
  leafW: 8.0,
  leafLmin: 6.0,
  leafPre: 2.0,
  tpuE: 25.0,
  dovetail: 3.0,
  legW: 7.0,
  leafGap: 6.0,
  maxBuildZ: 250,
  minPitchWarn: 15,
  sealPreload: 0.3,
  cupFacets: 6,
  padT: 2.2,
  ePla: 2500
};

/** One keyed hole's complete chain: pad rod, journal, bridge, touch key and its leaf. */
export interface KeyworkKey {
  /** Index into geom.melody.holes. Never renumbered; a dropped duplicate leaves a gap. */
  holeIndex: number;
  /** Position in the touch cluster, 0..n-1. */
  slot: number;
  /** -1 = left of the bore, +1 = right. Alternates with hole index (DESIGN_v2 s.2.1). */
  side: -1 | 1;
  holeZ: number;
  holeDiameter: number;
  /** Z of the bridge station, i.e. of this key's hinge tube on the spindle. */
  bridgeZ: number;
  /** +1 when the rod runs from its hole toward the fipple. */
  rodDir: 1 | -1;
  rodLength: number;
  /** Lateral column from the constrained column search (DESIGN_v2 s.4, corrected below). */
  column: number;
  tier: number;
  /** Signed rod axis X. */
  rodX: number;
  /** |rodX|, which is the torque arm. */
  armX: number;
  rodY: number;
  rodZ0: number;
  rodZ1: number;
  sleeveZ0: number;
  sleeveZ1: number;
  /** False when the journal had to move to the far side of the hole (DESIGN_v2 s.8). */
  inlineJournal: boolean;
  /** Useful rod rotation, degrees. */
  alphaDeg: number;
  /** Wind-up (lost motion) at pad force, degrees. */
  windupDeg: number;
  footArm: number;
  lugArm: number;
  bridgeRatio: number;
  betaDeg: number;
  plateTravel: number;
  fingerForce: number;
  contactForce: number;
  /** Foot outboard edge to the lug riser. KW-FOOTGAP warns below 1.0 mm. */
  footGap: number;
  ledgeRadius: number;
  leafForce: number;
  leafThickness: number;
  leafDeflection: number;
  leafStrain: number;
  /** True when a segment cut plane passes through the rod, so it cannot print in place. */
  crossedByCut: boolean;
  /**
   * True when some tube of the shell lies under this journal's rod axis over the journal's own Z
   * range, so a web dropped from it reaches material. False means the sleeve is over open air for
   * its whole length and a web alone cannot ground it, however far down it runs.
   *
   * Read against the STAGGERED shell, which is the weaker of the two: there the three tubes have
   * independent Z ranges and the webbing plate covers only the upper 45 % of the shortest tube, so
   * the region outboard of the melody hex is solid only where that side's drone tube has already
   * started. The unified hull spans the whole cluster at every Z and can never fail this test. The
   * shell mode is not an argument to this function, and reading the weaker shell is what keeps it
   * from having to be: a sleeve that clears the staggered test clears both.
   */
  overTube: boolean;
}

export interface KeyworkWarning {
  /** 'KW-DUP', 'KW-NOCUT', ... */
  code: string;
  message: string;
}

/** The six 2.5-D interference lists of DESIGN_v2 s.16. Every entry is a hole index. */
export interface KeyworkCollisions {
  padArm: number[][];
  lug: number[][];
  foot: number[][];
  sleeveChimney: number[][];
  postChimney: number[][];
  columnClash: number[][];
}

export interface KeyworkLayout {
  params: KeyworkParams;
  mode: KeyworkMode;
  keys: KeyworkKey[];
  /** Hole indices selected by the mode but dropped as duplicates. */
  droppedDuplicates: number[];
  /** Hole indices the mode did not select at all. Not a fault, not warned about. */
  unkeyedHoles: number[];
  rodOd: number;
  rodId: number;
  rodJ: number;
  sleeveId: number;
  sleeveOd: number;
  sleeveWall: number;
  rodPitch: number;
  xInner: number;
  xCap: number;
  columnCount: number;
  sleeveTop: number;
  spindleOd: number;
  hubId: number;
  hubOd: number;
  yHub: number;
  yContact: number;
  yLedge: number;
  yBeam0: number;
  yBeam1: number;
  legX: number;
  postZ: number[];
  spindleZ0: number;
  spindleZ1: number;
  buttonPitch: number;
  clusterLoZ: number;
  clusterHiZ: number;
  clusterWidth: number;
  bodyWidth: number;
  standOff: number;
  frontY: number;
  faceHalfW: number;
  baseFlange: number;
  outerRim: number;
  padSealY: number;
  cupD: number;
  cupY0: number;
  cupH: number;
  lift: number;
  collisions: KeyworkCollisions;
  warnings: KeyworkWarning[];
  /**
   * The air columns any keywork that missed the body's bore subtraction has to be cut back out of:
   * one entry per tube, its X offset and its bore diameter, and the Z the columns stop at.
   *
   * These are COPIED from the FluteGeometry, not derived - the emitter is required to re-derive no
   * geometry, and carrying the numbers here is what lets it keep that promise while emitting a
   * clip. Two consumers need them and must agree: the shipped program's clip on the loose keywork,
   * and the display-only programs, which have no body around them and so no bore subtraction at
   * all.
   */
  airColumns: { x: number; bore: number }[];
  airColumnTopZ: number;
}

const DEG = 180 / Math.PI;

function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

function overlaps(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

/** Holes this mode asks for, before duplicate rejection. `keys_low` keys the lower half. */
function selectedHoles(holes: ToneHole[], mode: KeyworkMode): ToneHole[] {
  if (mode === 'none') return [];
  if (mode === 'keys_low') {
    const cut = Math.floor(holes.length / 2);
    return holes.filter((h) => h.index >= cut);
  }
  return holes.slice();
}

/** Per-rod quantities that depend on the rod OD, recomputed inside the fixed-point solve. */
interface OdPass {
  sleeveOd: number;
  sleeveId: number;
  sleeveWall: number;
  pitch: number;
  xInner: number;
  xCap: number;
  columnCount: number;
  bearMin: number;
  perKey: { column: number; tier: number; armX: number; rodZ0: number; rodZ1: number; sleeveZ0: number; sleeveZ1: number; inline: boolean }[];
}

/**
 * The v2 mechanism for one instrument. Returns null for `keywork_mode: none`, so a caller that
 * forgets to branch produces no hardware rather than a default-shaped one.
 *
 * Cut-plane-dependent facts (which rods a segment plane crosses, and the three segment warnings)
 * are filled in afterwards by applyCutPlanes(); the cut search needs this layout's exclusion
 * zones, so it cannot run first.
 */
export function computeKeyworkLayout(geom: FluteGeometry, mode: KeyworkMode, params: KeyworkParams = DEFAULT_KEYWORK_PARAMS): KeyworkLayout | null {
  if (mode === 'none') return null;
  const holes = geom.melody.holes;
  if (holes.length === 0) return null;

  const p = params;
  const selected = selectedHoles(holes, mode);
  if (selected.length === 0) return null;

  // DESIGN_v2 s.13: a hole within 1.0 mm of an earlier hole gets NO key. Two rods on one chimney
  // is a guaranteed solid interference and the second key would move nothing anyway. The hole
  // itself is never renumbered and never moved - that would change the note.
  const kept: ToneHole[] = [];
  const droppedDuplicates: number[] = [];
  for (const h of selected) {
    if (kept.some((q) => Math.abs(q.z - h.z) < 1.0)) droppedDuplicates.push(h.index);
    else kept.push(h);
  }
  if (kept.length === 0) return null;

  const holeD = geom.holeDiameter;
  const rimT = geom.rimThickness;
  const chimD = geom.chimneyDepth;
  const outerD = geom.outerDiameter;
  const spacing = geom.tubeSpacing;

  const frontY = outerD * 0.433;
  const faceHalfW = spacing + outerD / 4;
  const outerRim = holeD + rimT * 2;
  const baseFlange = outerRim + chimD * 2;
  const padSealY = frontY + chimD + rimT * 0.4;
  const lift = holeD * p.liftFrac;

  // ---- cluster placement: centred on the KEYED hole span (operator decision 2) -------------
  const zs = kept.map((h) => h.z);
  const zLo = Math.min(...zs);
  const zHi = Math.max(...zs);
  const holeSpan = zHi - zLo;
  const n = kept.length;
  const buttonPitch = clamp(holeSpan / Math.max(1, n - 1), p.pitchMin, p.pitchMax);
  const btnSpan = (n - 1) * buttonPitch;
  const clusterLoZ = (zLo + zHi) / 2 - btnSpan / 2;
  const clusterHiZ = clusterLoZ + btnSpan;

  const bridgeZ = kept.map((_, i) => clusterLoZ + i * buttonPitch);
  const rodDir: (1 | -1)[] = kept.map((h, i) => (bridgeZ[i] >= h.z ? 1 : -1));
  const rodLength = kept.map((h, i) => Math.abs(bridgeZ[i] - h.z) + 2 * p.rodOver);
  const side: (1 | -1)[] = kept.map((h) => (h.index % 2 === 0 ? -1 : 1));

  const padBlock = baseFlange / 2 + 4;
  const bridgeBlock = p.bridgeT / 2 + 2;

  // ---- rod OD from torsion, solved to a fixed point -----------------------------------------
  // The lateral layout depends on the OD (sleeve diameter sets the column pitch) and the OD on
  // the layout (the torque arm is the rod's own X), so the solve iterates. Three passes, as in
  // the design study; the fourth pass moves the OD by under a micron at every size tested.
  const passFor = (od: number): OdPass => {
    const sleeveWall = Math.max(p.sleeveWall, od * 0.28);
    const sleeveId = od + 2 * p.sleeveTol;
    const sleeveOd = sleeveId + 2 * sleeveWall;
    const pitch = sleeveOd + 1.5;
    const xInner = baseFlange / 2 + sleeveOd / 2 + 1.5;
    const xCap = faceHalfW - sleeveOd / 2 - 1.0;
    const columnCount = Math.max(1, Math.floor((xCap - xInner) / pitch) + 1);
    const bearMin = Math.max(12, 3 * od);

    // The journal goes between the pad-arm block and the bridge block when the rod is long
    // enough. When it is not, it moves to the far side of the hole (DESIGN_v2 s.8) - but only as
    // far as the body reaches: on a piccolo the topmost rod's far side runs off the end of the
    // instrument and the sleeve would hang over the fipple window. Both candidate windows are
    // therefore clipped to the body and the longer one wins, which can leave a journal shorter
    // than three rod diameters. That is what KW-BEARING is for.
    const bodyLo = 2;
    const bodyHi = geom.fippleZ - geom.windowLength - 2;
    const clip = (a: number, b: number): [number, number] =>
      [Math.max(bodyLo, Math.min(bodyHi, a)), Math.max(bodyLo, Math.min(bodyHi, b))];
    const windows = kept.map((h, i) => {
      const up = rodDir[i] > 0;
      const inlineWin = clip(up ? h.z + padBlock : bridgeZ[i] + bridgeBlock,
        up ? bridgeZ[i] - bridgeBlock : h.z - padBlock);
      const farWin = clip(up ? h.z - padBlock - bearMin : h.z + padBlock,
        up ? h.z - padBlock : h.z + padBlock + bearMin);
      const inlineLen = inlineWin[1] - inlineWin[0];
      const useInline = inlineLen >= bearMin || inlineLen >= farWin[1] - farWin[0];
      return { win: useInline ? inlineWin : farWin, inline: useInline };
    });
    const inline = windows.map((w) => w.inline);
    const sleeveZ0 = windows.map((w) => w.win[0]);
    const sleeveZ1 = windows.map((w) => w.win[1]);
    const rodZ0 = kept.map((h, i) => Math.min(h.z - p.armZ / 2, bridgeZ[i] - p.bridgeT / 2, sleeveZ0[i]) - p.rodOver);
    const rodZ1 = kept.map((h, i) => Math.max(h.z + p.armZ / 2, bridgeZ[i] + p.bridgeT / 2, sleeveZ1[i]) + p.rodOver);

    // Lateral column placement, per side. Two hard constraints, both tested BEFORE a column is
    // accepted rather than reported afterwards:
    //
    //   (a) two rods in one column share one tube axis, so they must be disjoint in Z;
    //   (b) key k's pad arm sweeps from its rod at |x| = armX(k) inboard and DOWN to the hole at
    //       x = 0. Any same-side rod at a smaller |x|, on k's Y tier or below it, whose Z span
    //       covers k's hole is inside that sweep. So a rod that crosses another key's pad band
    //       must be placed OUTBOARD of that key, or on a tier above it - never inboard below.
    //
    // DESIGN_v2 s.4 colours for (a) alone. It writes even that as "the number of same-side rods
    // that start earlier and are still open", which is NOT a colouring: three rods A(0), B(1), C
    // where C overlaps only B counts one and lands in B's own column. What is implemented here
    // for (a) is the algorithm s.4 names - smallest column no overlapping neighbour holds.
    //
    // Constraint (b) is what v1 got for free from its ordering rule ("|X| decreases with hole
    // index, longest rod outermost"). v2 dropped that rule assuming rods would not overlap, and
    // on a solver-placed lattice they do: at root 36 the cluster pitch clamps to 22 mm while the
    // hole span is far wider, so the outermost rods run a long way inboard over their
    // neighbours' holes. Rod 0 then sits in column 0, inboard of key 2, and spans key 2's hole.
    // Reinstating an ordering rule outright would break (a); instead both constraints are tested
    // together and the column search obeys whichever binds.
    const padBand = kept.map((h) => [h.z - p.armZ / 2, h.z + p.armZ / 2] as const);
    const armOf = (c: number): number => xInner + (c % columnCount) * pitch;
    const tierOf = (c: number): number => Math.floor(c / columnCount);

    /** True when key `i` may take column `c` given that key `j` already holds column `cj`. */
    const compatible = (i: number, c: number, j: number, cj: number): boolean => {
      if (c === cj) return !overlaps(rodZ0[j], rodZ1[j], rodZ0[i], rodZ1[i]);
      const ai = armOf(c);
      const aj = armOf(cj);
      // The arm descends from its own tier to the hole, so it sweeps every tier at or below its
      // own. A rod ABOVE it at a smaller |x| is passed under, not through.
      if (ai > aj + 0.01 && tierOf(cj) <= tierOf(c)) return !overlaps(rodZ0[j], rodZ1[j], padBand[i][0], padBand[i][1]);
      if (aj > ai + 0.01 && tierOf(c) <= tierOf(cj)) return !overlaps(rodZ0[i], rodZ1[i], padBand[j][0], padBand[j][1]);
      return true;
    };

    // The two sides never interact, so each is solved on its own for the FEWEST columns that
    // satisfy both constraints. Fewest columns is the right objective because tier is
    // floor(column / columnCount): every column saved is a chance not to stack a second Y tier
    // and add its height to the standoff. A greedy smallest-free-column pass is not enough here
    // - constraint (b) is an ordering, so a column that is free can still be the wrong one - so
    // this is an exact search, widened one column at a time until it succeeds. The instrument
    // has at most seven keys and at most four per side, and the search stops at the first width
    // that works, so the exhaustive step is over a handful of assignments.
    //
    // It always terminates: giving each of the m rods on a side column j*columnCount puts every
    // one of them on its own Y tier, which satisfies both constraints, and that assignment lies
    // inside the widest search tried.
    const crossings = kept.map((_, i) => kept.reduce((s, _q, j) => s + (
      j !== i && side[j] === side[i] && overlaps(rodZ0[i], rodZ1[i], padBand[j][0], padBand[j][1]) ? 1 : 0), 0));
    const colour = new Array<number>(kept.length).fill(0);
    for (const s of [-1, 1] as const) {
      // Most-constrained rod first: one that crosses many pad bands is forced far outboard and
      // fails fast in the wrong column. Ties break on the rod's left endpoint, which is the
      // order the plain interval colouring used, so an instrument with no pad-band crossing at
      // all gets exactly the columns it got before.
      const group = kept.map((_, i) => i).filter((i) => side[i] === s)
        .sort((a, b) => (crossings[b] - crossings[a]) || (rodZ0[a] - rodZ0[b]) || (kept[a].index - kept[b].index));
      if (group.length === 0) continue;
      const held: number[] = [];
      const search = (idx: number, width: number): boolean => {
        if (idx === group.length) return true;
        const i = group[idx];
        for (let c = 0; c < width; c++) {
          if (!held.every((j) => compatible(i, c, j, colour[j]))) continue;
          colour[i] = c;
          held.push(i);
          if (search(idx + 1, width)) return true;
          held.pop();
        }
        return false;
      };
      for (let width = 1; width <= group.length * columnCount; width++) {
        held.length = 0;
        if (search(0, width)) break;
      }
    }

    const perKey = kept.map((_, i) => {
      const col = colour[i];
      return {
        column: col,
        tier: Math.floor(col / columnCount),
        armX: xInner + (col % columnCount) * pitch,
        rodZ0: rodZ0[i], rodZ1: rodZ1[i],
        sleeveZ0: sleeveZ0[i], sleeveZ1: sleeveZ1[i],
        inline: inline[i]
      };
    });
    return { sleeveOd, sleeveId, sleeveWall, pitch, xInner, xCap, columnCount, bearMin, perKey };
  };

  const odFrom = (od: number): number => {
    const pass = passFor(od);
    let worst = 0;
    pass.perKey.forEach((k, i) => {
      const alpha = lift / k.armX;                                  // rad
      const theta = Math.min(p.thetaMaxDeg / DEG, p.windupFrac * alpha);
      const jReq = p.padForce * k.armX * rodLength[i] / (p.gPla * theta);
      worst = Math.max(worst, Math.pow(jReq / 0.08917, 0.25));
    });
    return clamp(worst, 4.0, 14.0);
  };

  const odSeed = clamp(0.28 * outerD, 4.0, 12.0);
  const odWanted = odFrom(odFrom(odFrom(odSeed)));
  const rodOd = odWanted;
  const odClamped = rodOd >= 13.999;
  const rodId = rodOd * 0.55;
  const rodJ = 0.08917 * Math.pow(rodOd, 4);
  const pass = passFor(rodOd);

  const armX = pass.perKey.map((k) => k.armX);
  const tier = pass.perKey.map((k) => k.tier);
  const rodY = tier.map((t) => frontY + pass.sleeveOd / 2 + p.webH + t * (pass.sleeveOd + 2.0));
  const sleeveTop = Math.max(...rodY.map((y) => y + pass.sleeveOd / 2));
  const xOuter = Math.max(...armX);

  // ---- spindle, hubs, contact plane ---------------------------------------------------------
  const spindleOd = Math.max(3.0, rodOd * 0.50);
  const hubId = spindleOd + 2 * p.sleeveTol;
  const hubOd = hubId + 2 * Math.max(1.8, spindleOd * 0.35);
  const hubR = hubOd / 2;
  const yHub = sleeveTop + p.bridgeClear + hubR;
  // The contact plane sits ABOVE the hub so the lug's nose reaches inboard past the hinge tube
  // without touching it. The first v2 draft put the contact at hub height and the lug bar drove
  // straight through the hub (renders_v2/13_bridge_axial.png).
  const yContact = yHub + hubR + p.bridgeClear;
  const yLedge = yContact + p.leafGap;
  const yBeam0 = yHub - hubR - 1.5;
  const yBeam1 = yHub + hubR + 1.5;

  // ---- bridge ratio, travel, forces, springs -------------------------------------------------
  const bMin = spindleOd / 2 + p.contactW / 2 + 1.5;

  // The solids a journal web can land on, as [centre X, half width at y = 0, zLo, zHi]. The first
  // three are the staggered shell's tubes, each a hexagon of circumradius outerD/2 about its own
  // axis and each running from fippleZ - its own acoustic length - 8 to the top of the window; the
  // fourth is the webbing plate, a hull of the same three profiles that starts 45 % of the way up
  // the SHORTEST tube. Half width is read at y = 0 because that is where a hexagon is widest and
  // the web passes through every height from the rod down to the axis, so clearing it there is
  // clearing it at all.
  const tubeTopZ = geom.fippleZ + geom.windowLength + 0.2;
  const hexR = outerD / 2;
  const shortestL = Math.min(geom.melody.acousticLength, geom.drone1.acousticLength, geom.drone2.acousticLength);
  const tubes: readonly (readonly [number, number, number, number])[] = [
    [0, hexR, geom.fippleZ - geom.melody.acousticLength - 8, tubeTopZ],
    [-spacing, hexR, geom.fippleZ - geom.drone1.acousticLength - 8, tubeTopZ],
    [spacing, hexR, geom.fippleZ - geom.drone2.acousticLength - 8, tubeTopZ],
    [0, spacing * 0.75 + hexR, geom.fippleZ - shortestL * 0.45, tubeTopZ]
  ];

  const keys: KeyworkKey[] = kept.map((h, i) => {
    const x = armX[i];
    const alphaRad = lift / x;
    const rWant = lift * p.touchArm / (p.btnTravel * x);
    const bRaw = x * rWant / (1 + rWant);
    const bCap = x - rodOd / 2 - 1.5 - 1.5 - p.contactW / 2;
    const footArm = Math.max(bMin, Math.min(bCap, bRaw));
    const lugArm = x - footArm;
    const ratio = footArm / lugArm;
    const alphaDeg = alphaRad * DEG;
    const betaDeg = alphaDeg / ratio;
    const contactForce = p.padForce * x / lugArm;
    const ledgeRadius = p.ledgeFrac * p.touchArm;
    const leafForce = p.padForce * x * ratio / ledgeRadius;
    const leafL = Math.max(p.leafLmin, buttonPitch / 2);
    const leafI = (leafForce / p.leafPre) * Math.pow(leafL, 3) / (3 * p.tpuE);
    const leafThickness = Math.pow(12 * leafI / p.leafW, 1 / 3);
    const leafDeflection = p.leafPre + ledgeRadius * betaDeg / DEG;
    return {
      holeIndex: h.index,
      slot: i,
      side: side[i],
      holeZ: h.z,
      holeDiameter: h.diameter,
      bridgeZ: bridgeZ[i],
      rodDir: rodDir[i],
      rodLength: rodLength[i],
      column: pass.perKey[i].column,
      tier: tier[i],
      rodX: side[i] * x,
      armX: x,
      rodY: rodY[i],
      rodZ0: pass.perKey[i].rodZ0,
      rodZ1: pass.perKey[i].rodZ1,
      sleeveZ0: pass.perKey[i].sleeveZ0,
      sleeveZ1: pass.perKey[i].sleeveZ1,
      inlineJournal: pass.perKey[i].inline,
      alphaDeg,
      windupDeg: p.padForce * x * rodLength[i] / (p.gPla * rodJ) * DEG,
      footArm,
      lugArm,
      bridgeRatio: ratio,
      betaDeg,
      plateTravel: betaDeg / DEG * p.touchArm,
      fingerForce: contactForce * footArm / p.touchArm,
      contactForce,
      footGap: (x - rodOd / 2 - 1.5) - (footArm + p.contactW / 2),
      ledgeRadius,
      leafForce,
      leafThickness,
      leafDeflection,
      leafStrain: 3 * leafThickness * leafDeflection / (2 * leafL * leafL),
      crossedByCut: false,
      overTube: tubes.some(([xc, halfW, zLo, zHi]) =>
        Math.abs(side[i] * x - xc) < halfW && overlaps(zLo, zHi, pass.perKey[i].sleeveZ0, pass.perKey[i].sleeveZ1))
    };
  });

  // ---- stanchions ----------------------------------------------------------------------------
  const nPost = n + 1;
  const postZ: number[] = [];
  for (let i = 0; i < nPost; i++) postZ.push(clusterLoZ - buttonPitch / 2 + i * buttonPitch);
  const legWanted = xOuter + pass.sleeveOd / 2 + 1.5 + p.legW / 2;
  const legCap = faceHalfW - p.legW / 2 - 1.0;
  const legX = Math.min(legCap, legWanted);
  const spindleZ0 = postZ[0] - p.postT / 2 - 1;
  const spindleZ1 = postZ[nPost - 1] + p.postT / 2 + 1;

  const clusterWidth = 2 * p.touchArm + p.plateW;
  const bodyWidth = 2 * faceHalfW;
  const standOff = yContact + p.plateUp + p.plateT - frontY;

  const cupD = holeD + rimT * 2 + 2.0;
  const cupH = 2.8;
  const cupY0 = padSealY + 0.6 - p.sealPreload;

  // ---- 2.5-D interference checks (DESIGN_v2 s.16) --------------------------------------------
  const chimneyZ = (h: ToneHole): [number, number] => [h.z - baseFlange / 2, h.z + baseFlange / 2];
  const collisions: KeyworkCollisions = {
    padArm: keys.map((k) => keys.filter((j) => j !== k && j.side === k.side && j.armX < k.armX - 0.01
      && j.tier === k.tier
      && overlaps(k.holeZ - p.armZ / 2, k.holeZ + p.armZ / 2, j.rodZ0, j.rodZ1)).map((j) => j.holeIndex)),
    lug: keys.map((k) => keys.filter((j) => j !== k && j.armX * j.side * k.side > k.footArm && j.armX < k.armX
      && j.rodY + pass.sleeveOd / 2 + p.bridgeClear > yContact
      && overlaps(k.bridgeZ - p.bridgeT / 2, k.bridgeZ + p.bridgeT / 2, j.rodZ0, j.rodZ1)).map((j) => j.holeIndex)),
    foot: keys.map((k) => keys.filter((j) => j.armX < k.footArm
      && j.rodY + pass.sleeveOd / 2 + p.bridgeClear > yContact - p.regT - p.footT
      && overlaps(k.bridgeZ - p.bridgeT / 2, k.bridgeZ + p.bridgeT / 2, j.rodZ0, j.rodZ1)).map((j) => j.holeIndex)),
    sleeveChimney: keys.map((k) => holes.filter((m) => m.index !== k.holeIndex
      && k.armX - pass.sleeveOd / 2 < baseFlange / 2 && k.tier === 0
      && overlaps(k.sleeveZ0, k.sleeveZ1, chimneyZ(m)[0], chimneyZ(m)[1])).map((m) => m.index)),
    postChimney: postZ.map((z) => holes.filter((m) => legX - 6 < baseFlange / 2
      && overlaps(z - p.postT / 2, z + p.postT / 2, chimneyZ(m)[0], chimneyZ(m)[1])).map((m) => m.index)),
    columnClash: keys.map((k) => keys.filter((j) => j !== k && j.side === k.side && j.column === k.column
      && overlaps(j.rodZ0, j.rodZ1, k.rodZ0, k.rodZ1)).map((j) => j.holeIndex))
  };

  const beamOverHole = postZ.map((z) => holes.filter((m) =>
    overlaps(z - p.postT / 2, z + p.postT / 2, m.z - holeD / 2, m.z + holeD / 2)).map((m) => m.index));
  const bridgeOnChimney = keys.map((k) => holes.filter((m) =>
    overlaps(k.bridgeZ - p.bridgeT / 2, k.bridgeZ + p.bridgeT / 2, chimneyZ(m)[0], chimneyZ(m)[1])).map((m) => m.index));

  const layout: KeyworkLayout = {
    params: p,
    mode,
    keys,
    droppedDuplicates,
    unkeyedHoles: holes.filter((h) => !kept.some((k) => k.index === h.index) && !droppedDuplicates.includes(h.index)).map((h) => h.index),
    rodOd, rodId, rodJ,
    sleeveId: pass.sleeveId,
    sleeveOd: pass.sleeveOd,
    sleeveWall: pass.sleeveWall,
    rodPitch: pass.pitch,
    xInner: pass.xInner,
    xCap: pass.xCap,
    columnCount: pass.columnCount,
    sleeveTop,
    spindleOd, hubId, hubOd,
    yHub, yContact, yLedge, yBeam0, yBeam1,
    legX, postZ, spindleZ0, spindleZ1,
    buttonPitch, clusterLoZ, clusterHiZ, clusterWidth, bodyWidth, standOff,
    frontY, faceHalfW, baseFlange, outerRim, padSealY,
    cupD, cupY0, cupH, lift,
    collisions,
    warnings: [],
    airColumns: [
      { x: -spacing, bore: geom.drone1.bore },
      { x: 0, bore: geom.melody.bore },
      { x: spacing, bore: geom.drone2.bore }
    ],
    airColumnTopZ: geom.fippleZ
  };

  layout.warnings = layoutWarnings(layout, geom, {
    odClamped, bearMin: pass.bearMin, legWanted, legCap, beamOverHole, bridgeOnChimney
  });
  return layout;
}

interface WarningInputs {
  odClamped: boolean;
  bearMin: number;
  legWanted: number;
  legCap: number;
  beamOverHole: number[][];
  bridgeOnChimney: number[][];
}

const r1 = (v: number): string => (Math.round(v * 10) / 10).toString();
const r2 = (v: number): string => (Math.round(v * 100) / 100).toString();
const r0 = (v: number): string => Math.round(v).toString();

/**
 * The warnings that depend only on the mechanism. DESIGN_v2 s.12 lists nineteen conditions;
 * the three that need the segment cut planes (KW-NOCUT, KW-BUILDZ, KW-TINYSEG) are appended by
 * applyCutPlanes(). Nothing here gates: a piccolo generates, and then says in seven specific
 * sentences why you should not print it.
 */
function layoutWarnings(L: KeyworkLayout, geom: FluteGeometry, w: WarningInputs): KeyworkWarning[] {
  const out: KeyworkWarning[] = [];
  const p = L.params;
  const n = L.keys.length;
  const add = (code: string, message: string): void => { out.push({ code, message }); };

  if (L.droppedDuplicates.length > 0) {
    add('KW-DUP', `holes [${L.droppedDuplicates.join(',')}] duplicate an earlier hole position and get NO key. `
      + 'The scale array is shorter than numHoles, so generateScadJs() places two holes at the same z. '
      + 'Fix the scale/hole-count combination or those notes will be unplayable.');
  }

  const tiered = L.keys.filter((k) => k.tier > 0);
  if (tiered.length > 0) {
    const maxTier = Math.max(...L.keys.map((k) => k.tier));
    add('KW-TIER', `${tiered.length} of ${n} rods do not fit in one row on the ${r0(L.bodyWidth)} mm front facet `
      + `and are stacked on Y tier ${maxTier}. Mechanism now stands ${r0(L.standOff)} mm off the facet. `
      + 'Reduce numHoles, raise kw_theta_max (thinner rods), or accept the height.');
  }

  if (L.buttonPitch < p.minPitchWarn) {
    const span = Math.max(...L.keys.map((k) => k.holeZ)) - Math.min(...L.keys.map((k) => k.holeZ));
    add('KW-PITCH', `key pitch is ${r1(L.buttonPitch)} mm, below the ${p.minPitchWarn} mm finger minimum. `
      + `The hole span (${r0(span)} mm) is too short for ${n} keys. Keys will be hard to play individually.`);
  }

  const worstRatio = Math.max(...L.keys.map((k) => k.windupDeg / k.alphaDeg));
  if (worstRatio > p.windupFrac + 0.01) {
    add('KW-WINDUP', `worst rod wind-up is ${r0(worstRatio * 100)}% of the useful rotation `
      + `(budget ${r0(p.windupFrac * 100)}%). Lost motion at the touch plate will be ${r0(worstRatio * 100)}% `
      + 'of its travel and the key will feel spongy. Lower kw_pad_force or raise kw_theta_max.');
  }

  if (w.odClamped) {
    add('KW-ODCLAMP', 'the torsion solve wanted a rod thicker than the 14 mm cap. Wind-up will exceed the budget. '
      + 'Shorten the hole span, reduce numHoles, or lower kw_pad_force.');
  }

  const minBearing = Math.min(...L.keys.map((k) => k.sleeveZ1 - k.sleeveZ0));
  if (minBearing < w.bearMin - 0.01) {
    add('KW-BEARING', `shortest journal is ${r0(minBearing)} mm against a ${r0(w.bearMin)} mm minimum (3 x rod OD). `
      + 'That rod will cock in its sleeve and the pad will not seat flat.');
  }

  if (L.clusterWidth > L.bodyWidth) {
    add('KW-CLUSTER', `touch cluster is ${r0(L.clusterWidth)} mm wide on a ${r0(L.bodyWidth)} mm body: `
      + `the touch plates overhang the body edge by ${r0((L.clusterWidth - L.bodyWidth) / 2)} mm per side. `
      + 'Reduce kw_touch_arm or kw_plate_w.');
  }

  if (w.legWanted > w.legCap) {
    add('KW-STANCHION', `the spindle stanchion legs are clamped to the body edge at x=+/-${r1(L.legX)} mm `
      + 'and now land ON the outermost sleeve instead of on the facet. '
      + "The cluster is only as rigid as that sleeve's web.");
  }

  const nBeamOver = w.beamOverHole.filter((l) => l.length > 0).length;
  if (nBeamOver > 0) {
    add('KW-OVERHOLE', `${nBeamOver} spindle stanchion beam(s) pass directly over an open tone hole, `
      + `${r1(L.yBeam0 - L.padSealY)} mm above the rim. Nothing touches, but a solid bar that close above a `
      + `${r1(geom.holeDiameter)} mm hole raises its open-hole end correction and will flatten that note. `
      + 'The tuning model does not account for it. Shift the cluster or accept the detune.');
  }

  const maxStrain = Math.max(...L.keys.map((k) => k.leafStrain));
  if (maxStrain > 0.15) {
    const leafL = Math.max(p.leafLmin, L.buttonPitch / 2);
    add('KW-LEAFSTRAIN', `peak leaf surface strain is ${r1(maxStrain * 100)} %, over the 15 % fatigue guideline. `
      + `The cantilever is only ${r1(leafL)} mm long because the key pitch is ${r1(L.buttonPitch)} mm. `
      + 'Expect the springs to be consumables. Lower kw_leaf_pre or widen the key pitch.');
  }

  const minFootGap = Math.min(...L.keys.map((k) => k.footGap));
  if (minFootGap < 1.0) {
    add('KW-FOOTGAP', `only ${r2(minFootGap)} mm between the bridge foot and the pad-rod riser (want 1.0 mm). `
      + 'The hinge tube is too fat for the rod offset. Reduce kw_spindle_od or kw_contact_w, '
      + 'or move the rods outboard.');
  }

  const shortTravel = L.keys.filter((k) => k.plateTravel < 1.6);
  if (shortTravel.length > 0) {
    const bMin = L.spindleOd / 2 + p.contactW / 2 + 1.5;
    add('KW-TRAVEL', `${shortTravel.length} key(s) have less than 1.6 mm of plate travel because the bridge foot `
      + `hit its minimum arm (${r1(bMin)} mm). Those keys will feel dead. `
      + 'Reduce kw_spindle_od or raise kw_touch_arm.');
  }

  const onChimney = L.keys.filter((k, i) => w.bridgeOnChimney[i].length > 0);
  if (onChimney.length > 0) {
    const footprints = L.keys.map((k, i) => w.bridgeOnChimney[i]).filter((l) => l.length > 0);
    const shortRods = L.keys.filter((k) => !k.inlineJournal).map((k) => k.holeIndex);
    add('KW-BRIDGEHOLE', `bridge stations [${onChimney.map((k) => k.holeIndex).join(',')}] sit inside a chimney `
      + `footprint (their own hole or a neighbour's: [${footprints.map((l) => `[${l.join(',')}]`).join(',')}]). `
      + `The bridge clears it in Y -- the contact plane is ${r0(L.yContact - L.padSealY)} mm above the rim crown -- `
      + `but rods [${shortRods.join(',')}] are too short for an inline journal and are bearing-supported on the `
      + 'far side of their hole instead.');
  }

  const c = L.collisions;
  const count = (lists: number[][]): number => lists.filter((l) => l.length > 0).length;
  const nColl = count(c.padArm) + count(c.lug) + count(c.foot) + count(c.sleeveChimney)
    + count(c.postChimney) + count(c.columnClash);
  if (nColl > 0) {
    add('KW-COLLIDE', `the 2.5-D interference check reported ${count(c.padArm)} pad-arm, ${count(c.lug)} lug, `
      + `${count(c.foot)} foot, ${count(c.sleeveChimney)} sleeve/chimney, ${count(c.postChimney)} stanchion/chimney `
      + `and ${count(c.columnClash)} shared-column conflicts. See == COLLISION.`);
  }

  if (L.standOff > geom.outerDiameter * 1.25) {
    add('KW-STANDOFF', `the mechanism stands ${r0(L.standOff)} mm off a body only ${r0(geom.outerDiameter)} mm across, `
      + 'so the keywork is wider than the flute. Expect it to be fragile and to dominate the print. '
      + 'Lower kw_plate_up, kw_bridge_clear or numHoles.');
  }

  if (n >= 2) {
    let minPitch = Infinity;
    for (let i = 1; i < L.keys.length; i++) minPitch = Math.min(minPitch, Math.abs(L.keys[i].holeZ - L.keys[i - 1].holeZ));
    if (minPitch < 32) {
      add('KW-UNNEEDED', `the closest two keyed holes are ${r0(minPitch)} mm apart, inside a normal finger pitch. `
        + 'This instrument can be played with bare fingers and does not need keys. '
        + `Keywork here adds ${r0(L.standOff)} mm of hardware and ${n * 3} extra parts for no reach benefit.`);
    }
  }

  return out;
}

/** A forbidden interval for the segment cut search. */
export interface CutZone { min: number; max: number }

/**
 * The zones a segment plane may not land in, on top of the fipple and tone-hole zones the body
 * already has: the whole cluster, which cannot be rejoined once a stanchion, hub or spindle is
 * cut through, and a 9 mm band at each sleeve end, where a cut would leave a collar too short to
 * key. The MIDDLE of a sleeve is deliberately not excluded - a cut there produces two half
 * sleeves the body's own tenon/mortise realigns.
 */
export function keyworkCutZones(layout: KeyworkLayout): CutZone[] {
  const zones: CutZone[] = [
    { min: layout.clusterLoZ - layout.buttonPitch / 2 - 10, max: layout.clusterHiZ + layout.buttonPitch / 2 + 10 }
  ];
  for (const k of layout.keys) {
    zones.push({ min: k.sleeveZ0 - 9, max: k.sleeveZ0 + 9 });
    zones.push({ min: k.sleeveZ1 - 9, max: k.sleeveZ1 + 9 });
  }
  return zones;
}

export interface CutVerdict {
  /** The cut planes actually in use: one for two segments, two for three, three for four. */
  planes: number[];
  /** Per plane: false when the fixed-point search could not get it out of every zone. */
  legal: boolean[];
  longestSegment: number;
  shortestSegment: number;
  totalLength: number;
}

/**
 * Records which rods a cut plane crosses (those cannot print in place and are exported as
 * separate one-piece rods) and appends the three segment warnings. Mutates `layout`, which is
 * the object the caller is about to emit from.
 */
export function applyCutPlanes(layout: KeyworkLayout, verdict: CutVerdict): void {
  const p = layout.params;
  for (const k of layout.keys) {
    k.crossedByCut = verdict.planes.some((z) => z > k.rodZ0 && z < k.rodZ1);
  }
  if (verdict.legal.some((ok) => !ok)) {
    layout.warnings.push({
      code: 'KW-NOCUT',
      message: `no legal segment plane exists at ${verdict.planes.length + 1} segments. `
        + 'The keywork exclusion zones cover the whole body. Print this instrument in ONE piece '
        + `(needs ${r0(verdict.totalLength)} mm of Z), reduce numSegments, or turn keywork off.`
    });
  }
  if (verdict.longestSegment > p.maxBuildZ) {
    layout.warnings.push({
      code: 'KW-BUILDZ',
      message: `longest printed segment is ${r0(verdict.longestSegment)} mm, over the ${p.maxBuildZ} mm build height. `
        + 'Increase numSegments or the instrument will not fit the printer.'
    });
  }
  if (verdict.planes.length > 0 && verdict.shortestSegment < 40) {
    layout.warnings.push({
      code: 'KW-TINYSEG',
      message: `the shortest printed segment is ${r0(verdict.shortestSegment)} mm. `
        + 'The keywork exclusion zones have squeezed the cut planes together. '
        + 'That segment is mostly tenon and will be weak. Reduce numSegments.'
    });
  }
}
