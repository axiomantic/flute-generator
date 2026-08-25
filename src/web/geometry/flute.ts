import { SCALES, midiToFreq } from '../data/scales.js';
import { END_CORR_COEFF } from '../acoustics/constants.js';
import { solveHoleGeometryCached } from '../acoustics/solver.js';
import { computeKeyworkLayout, keyworkCutZones, type CutVerdict, type CutZone } from './keywork.js';
import type { FluteGeometry, JointCuts, KeyworkMode, ToneHole, DroppedHole } from '../types.js';

// Latches so an identical notice is logged once, not on every rebuild.
let _lastHoleNotice = '';
let _lastTuningNotice = '';

// Single source of truth for the instrument's physical dimensions. The CAD generator, the 3D
// keywork placement and the audio model all read this one object, so a register change can no
// longer move the printed bore while leaving the synthesised bore behind.
// The hole lattice is returned in full (not just the two numbers the modal synth uses today)
// because the planned digital-waveguide core needs every junction position.
export function computeFluteGeometry(rootMidi: number, scaleKey: string, numHoles: number, drone1Interval = 0, drone2Interval = 7, chimneyDepth = 2.8, rimThickness = 3.3): FluteGeometry {
  let boreM = 19.0, boreD1 = 22.0, boreD2 = 16.0;
  if (rootMidi >= 74) { boreM = 12.0; boreD1 = 14.0; boreD2 = 10.0; }
  else if (rootMidi >= 67) { boreM = 16.0; boreD1 = 18.0; boreD2 = 14.0; }
  else if (rootMidi >= 58) { boreM = 19.0; boreD1 = 22.0; boreD2 = 16.0; }
  else if (rootMidi >= 46) { boreM = 28.0; boreD1 = 32.0; boreD2 = 24.0; }
  else { boreM = 40.0; boreD1 = 46.0; boreD2 = 34.0; }

  const fMel = midiToFreq(rootMidi);
  const fD1 = midiToFreq(rootMidi + drone1Interval);
  const fD2 = midiToFreq(rootMidi + drone2Interval);

  // The drones carry no tone holes, so their length is exact in closed form.
  const lD1 = (343200.0 / (2.0 * fD1)) - 2.0 * END_CORR_COEFF * boreD1 * 0.5;
  const lD2 = (343200.0 / (2.0 * fD2)) - 2.0 * END_CORR_COEFF * boreD2 * 0.5;

  const maxBore = Math.max(boreM, boreD1, boreD2);
  // Auto-calibrated robust wall thickness (minimum 5.5mm on large bores so socket mortise never breaches outer wall)
  const wall = Math.max(5.5, maxBore * 0.22);
  const outerD = maxBore + wall * 2;
  const spacing = Math.max(outerD * 0.95, boreM * 1.45);

  const scaleIntervals = SCALES[scaleKey] || SCALES.minor_pentatonic;

  // A scale supplies a finite number of usable degrees. Asking for more holes than that fell
  // through to a fallback that re-derived an interval the scale already had - two holes landed
  // on the same z, one of them unreachable by midiToHoles() and both collected by the keywork
  // rod layout - and that could also emit an interval BELOW the previous one, which breaks the
  // fingering contract outright: midiToHoles() opens holes 0..k-1 by degree, which is only the
  // same set as "every hole below this one" while the degrees rise monotonically toward the
  // fipple. Intervals are therefore required to be strictly increasing; anything else is
  // dropped rather than silently drilled, and the drop is reported.
  const intervals: number[] = [];
  const droppedHoles: DroppedHole[] = [];
  for (let hIdx = 0; hIdx < numHoles; hIdx++) {
    const interval = scaleIntervals[hIdx + 1] !== undefined ? scaleIntervals[hIdx + 1] : Math.round(12 * (hIdx + 1) / (numHoles + 1));
    if (intervals.length > 0 && interval <= intervals[intervals.length - 1]) {
      droppedHoles.push({ requestedIndex: hIdx, interval: interval });
      continue;
    }
    intervals.push(interval);
  }
  const effHoles = intervals.length;
  let holeNotice = '';
  if (droppedHoles.length > 0) {
    holeNotice = `${scaleKey} supplies only ${effHoles} rising tone-hole degrees; ${droppedHoles.length} of the ${numHoles} requested hole(s) repeated or fell below an existing pitch and were dropped.`;
    if (_lastHoleNotice !== holeNotice) { _lastHoleNotice = holeNotice; console.warn('[flute] ' + holeNotice); }
  }

  // The waveguide's own lattice acoustics decide how WIDE the holes are, where they go and how
  // long the melody tube is - one joint solve, because the three are not separable. Placing
  // holes from the plain-tube half-wavelength ignored the open holes' large inertance and put
  // every opened-hole note flat by tens to hundreds of cents; deriving the diameter from the
  // bore and clamping it then left some scale degrees unreachable at ANY position.
  // Hard geometric floor only: two bores must not intersect, and 2 mm of wall is left between
  // them. The chimney rim donuts may touch at this spacing - they are already hull()ed into
  // one another - and holding them apart instead cost up to 43 cents on close scale degrees.
  const targets = [fMel].concat(intervals.map((iv) => midiToFreq(rootMidi + iv)));
  const geomSolve = solveHoleGeometryCached(boreM, wall, targets, chimneyDepth);
  const holeDiam = geomSolve.diameter;
  const minGap = geomSolve.minGap;
  const solved = geomSolve.solved;
  const lMel = solved.acousticLength;

  // The solve can end on a lattice it could not fully satisfy, and that has to reach the person
  // about to print it rather than staying in a returned object nobody reads. Two ways it can:
  // a target with no root inside the room its neighbours leave (the note lands off pitch by the
  // residual reported here), and an open lattice whose cutoff sits below the notes it has to
  // play (the fingering is more likely to sound an octave high). Both are stated in cents and
  // in plain words, and the console line repeats only when the text changes.
  const sv = solved.solver;
  const tuningParts: string[] = [];
  if (sv.unreachable.length > 0) {
    tuningParts.push(`${sv.unreachable.length} of ${targets.length} target pitches are out of reach at any hole position; worst ${sv.maxResidualCents.toFixed(1)} cents off`);
  }
  if (sv.ventShortfall) {
    tuningParts.push(`tone hole venting is below the ${sv.ventTarget.toFixed(2)}x cutoff margin (worst ${sv.ventRatio.toFixed(2)}x) - upper-register fingerings may overblow`);
  }
  if (!sv.spacingOK) {
    tuningParts.push(`hole spacing falls below the ${sv.minGapMM.toFixed(1)} mm minimum (worst ${sv.minCentreGapMM.toFixed(2)} mm) - chimney bores may intersect`);
  }
  const tuningNotice = tuningParts.length > 0
    ? `${holeDiam.toFixed(1)} mm holes: ` + tuningParts.join('; ') + '.' : '';
  if (tuningNotice && _lastTuningNotice !== tuningNotice) { _lastTuningNotice = tuningNotice; console.warn('[flute] ' + tuningNotice); }

  const headLen = 42.0;
  const totalBodyLen = Math.max(lMel, lD1, lD2) + 30.0;
  const totalCadLen = totalBodyLen + headLen;
  const fippleZ = totalCadLen - headLen;
  const winLen = 5.2;

  const holes: ToneHole[] = [];
  for (let hIdx = 0; hIdx < effHoles; hIdx++) {
    const interval = intervals[hIdx];
    const hFreq = midiToFreq(rootMidi + interval);
    const hDist = solved.distanceByDegree[hIdx + 1];
    holes.push({
      index: hIdx,
      interval: interval,
      midi: rootMidi + interval,
      frequency: hFreq,
      distanceFromFipple: hDist,
      z: fippleZ - hDist,
      diameter: holeDiam,
      chimneyDepth: chimneyDepth,
      rimThickness: rimThickness,
      // Carried so the audio junction model reads the same wall the CAD drilled through. The
      // worklet used to assign wallThickness after the junctions were already built.
      wall: wall
    });
  }

  return {
    rootMidi: rootMidi,
    scaleKey: scaleKey,
    numHoles: effHoles,
    requestedHoles: numHoles,
    droppedHoles: droppedHoles,
    holeNotice: holeNotice,
    tuningNotice: tuningNotice,
    tuningSolver: solved.solver,
    drone1Interval: drone1Interval,
    drone2Interval: drone2Interval,
    scaleIntervals: scaleIntervals,
    speedOfSound: 343200.0,
    wall: wall,
    outerDiameter: outerD,
    tubeSpacing: spacing,
    holeDiameter: holeDiam,
    chimneyDepth: chimneyDepth,
    rimThickness: rimThickness,
    headLength: headLen,
    bodyLength: totalBodyLen,
    totalLength: totalCadLen,
    fippleZ: fippleZ,
    windowLength: winLen,
    melody: { bore: boreM, acousticLength: lMel, frequency: fMel, holes: holes },
    drone1: { bore: boreD1, acousticLength: lD1, frequency: fD1, holes: [] },
    drone2: { bore: boreD2, acousticLength: lD2, frequency: fD2, holes: [] }
  };
}

// The cut planes the 3D keywork rod collars sit on. This used to re-derive the whole geometry
// from scratch and had already drifted from generateScadJs(): it sized the body from the melody
// tube alone (lMel + 30) where the SCAD body uses max(lMel, lD1, lD2) + 30, so any configuration
// whose drone tube is longer than its melody tube - drone1Interval below 0, or drone2Interval
// below 0 - placed the rod collars on planes the body was never cut at. It now reads the one
// geometry object, and takes drone intervals so it can.
export function computeSmartJointCuts(rootMidi: number, scaleKey: string, numHoles: number, numSegments: number, jointLen: number, drone1Interval = 0, drone2Interval = 7, chimneyDepth = 2.8, rimThickness = 3.3, keyworkMode: KeyworkMode = 'none'): JointCuts {
  const geom = computeFluteGeometry(rootMidi, scaleKey, numHoles, drone1Interval, drone2Interval, chimneyDepth, rimThickness);
  const layout = computeKeyworkLayout(geom, keyworkMode);
  return solveJointCuts(geom, numSegments, jointLen, layout ? keyworkCutZones(layout) : []).cuts;
}

/**
 * The one cut-plane search. generateScadJs() and computeSmartJointCuts() both call this, so the
 * planes the body is sliced at and the planes the rest of the studio reasons about cannot drift
 * apart; they were two independent derivations once and disagreed whenever a drone tube was
 * longer than the melody tube.
 *
 * With keywork on, `extraZones` carries the cluster and the sleeve ends, and the search runs to a
 * fixed point: one sweep can push a plane out of a late zone and back into an early one it had
 * already cleared. Without keywork the sweep runs once, which is what the unkeyed body has always
 * done and what its checked-in output records.
 */
export function solveJointCuts(geom: FluteGeometry, numSegments: number, jointLen: number, extraZones: CutZone[] = []): { cuts: JointCuts; verdict: CutVerdict } {
  const fippleZ = geom.fippleZ;
  const totalCadLen = geom.totalLength;
  const holeDiam = geom.holeDiameter;
  const winLen = geom.windowLength;

  const forbiddenCutZones: CutZone[] = [
    { min: fippleZ - winLen - jointLen - 6, max: fippleZ + winLen + 8 }
  ];
  for (const hole of geom.melody.holes) {
    const fullJointClearance = jointLen + holeDiam / 2 + geom.chimneyDepth + 4.0;
    forbiddenCutZones.push({ min: hole.z - fullJointClearance, max: hole.z + fullJointClearance });
  }
  for (const z of extraZones) forbiddenCutZones.push(z);
  const passes = extraZones.length > 0 ? 8 : 1;

  function sweep(z: number): number {
    let safeZ = z;
    for (const r of forbiddenCutZones) {
      if (safeZ >= r.min && safeZ <= r.max) {
        if (Math.abs(safeZ - r.min) < Math.abs(safeZ - r.max)) safeZ = r.min - 1.5;
        else safeZ = r.max + 1.5;
      }
    }
    return safeZ;
  }
  function findSafeCutZ(targetZ: number): number {
    let safeZ = targetZ;
    for (let i = 0; i < passes; i++) safeZ = sweep(safeZ);
    return Math.max(jointLen + 4, Math.min(fippleZ - jointLen - 8, safeZ));
  }
  const inForbidden = (z: number): boolean => forbiddenCutZones.some((r) => z > r.min && z < r.max);

  const zCut1 = findSafeCutZ(totalCadLen * (1.0 / numSegments));
  const zCut2 = (numSegments >= 3) ? findSafeCutZ(totalCadLen * (2.0 / numSegments)) : totalCadLen;
  const zCut3 = (numSegments >= 4) ? findSafeCutZ(totalCadLen * (3.0 / numSegments)) : totalCadLen;

  const planes: number[] = [];
  if (numSegments >= 2) planes.push(zCut1);
  if (numSegments >= 3) planes.push(zCut2);
  if (numSegments >= 4) planes.push(zCut3);
  const bounds = [0, ...planes, totalCadLen];
  const lengths: number[] = [];
  for (let i = 1; i < bounds.length; i++) lengths.push(bounds[i] - bounds[i - 1]);

  return {
    cuts: { zCut1, zCut2, zCut3 },
    verdict: {
      planes,
      legal: planes.map((z) => !inForbidden(z)),
      longestSegment: Math.max(...lengths),
      shortestSegment: Math.min(...lengths),
      totalLength: totalCadLen
    }
  };
}
