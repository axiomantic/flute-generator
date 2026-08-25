import type { SolverReport, FullLatticeSolution, SolverLatticeHole, LatticeSolveOptions, LatticeSolution, HoleGeometrySolution, DiameterCandidate, BracketResult, SolverResidual } from '../types.js';
import { SPEED_OF_SOUND_MM_S, END_CORR_COEFF, HOLE_DIAM_MIN_MM, HOLE_DIAM_FINGER_MAX_MM, HOLE_DIAM_BORE_FRACTION_MAX, HOLE_DIAM_STEP_MM, VENT_CUTOFF_RATIO_TARGET } from './constants.js';
import { WaveguideFlutePipe } from './waveguide.js';

// Root of fn on [lo, hi] nearest `prefer`. The grid is scanned for sign changes, and only the
// few brackets closest to `prefer` are actually bisected.
// Picking by proximity rather than by "first" is what keeps the tone-hole solver on one
// physical branch: a lattice with weakly venting holes has several positions that produce the
// same sounding pitch, and taking whichever came first made successive sweeps jump between
// branches and never settle. Bisecting only the nearest few also bounds the work - an
// oscillatory span can otherwise present dozens of crossings and one configuration took over
// five minutes to solve.
// If no root exists in the bracket the target is unreachable there, so the position that
// minimises |fn| is returned instead, flagged exact:false. The caller reports the residual.
export function solveBracketed(fn: (x: number) => number, lo: number, hi: number, prefer: number, steps: number, iters: number): BracketResult | null {
  if (!(hi > lo)) return null;
  const MAX_BISECTIONS = 3;
  const dx = (hi - lo) / steps;
  const brackets: [number, number, number][] = [];
  let bestX = lo, bestAbs = Math.abs(fn(lo));
  let xa = lo, ya = fn(lo);
  for (let s = 1; s <= steps; s++) {
    const xb = lo + dx * s, yb = fn(xb);
    const ab = Math.abs(yb);
    if (ab < bestAbs) { bestAbs = ab; bestX = xb; }
    if ((ya < 0) !== (yb < 0)) brackets.push([xa, xb, ya]);
    xa = xb; ya = yb;
  }
  if (brackets.length > 0) {
    brackets.sort((p, q) => Math.abs(0.5 * (p[0] + p[1]) - prefer) - Math.abs(0.5 * (q[0] + q[1]) - prefer));
    let best: number | null = null, bestD = Infinity;
    for (let i = 0; i < Math.min(MAX_BISECTIONS, brackets.length); i++) {
      let a = brackets[i][0], b = brackets[i][1], fa = brackets[i][2];
      for (let k = 0; k < iters; k++) {
        const m = 0.5 * (a + b), fm = fn(m);
        if ((fa < 0) !== (fm < 0)) b = m; else { a = m; fa = fm; }
      }
      const r = 0.5 * (a + b), d = Math.abs(r - prefer);
      if (d < bestD) { bestD = d; best = r; }
    }
    return { x: best, exact: true };
  }
  // Refine the grid minimum by golden section, so an unreachable target still lands on the
  // closest position the geometry can actually offer rather than on a grid point.
  let a = Math.max(lo, bestX - dx), b = Math.min(hi, bestX + dx);
  const gr = 0.6180339887;
  let c1 = b - gr * (b - a), d1 = a + gr * (b - a);
  let fc = Math.abs(fn(c1)), fd = Math.abs(fn(d1));
  for (let i = 0; i < iters; i++) {
    if (fc < fd) { b = d1; d1 = c1; fd = fc; c1 = b - gr * (b - a); fc = Math.abs(fn(c1)); }
    else { a = c1; c1 = d1; fc = fd; d1 = a + gr * (b - a); fd = Math.abs(fn(d1)); }
  }
  return { x: 0.5 * (a + b), exact: false };
}

// Solve the whole tone-hole lattice against the waveguide's own acoustics.
//
// Holes interact in both directions: a note's open holes below it form a lattice that shifts
// where the air column actually ends, and the closed holes above it add stub compliance
// inside its sounding length. Solving one hole in isolation therefore does not produce a
// consistent scale, so this iterates the whole set - melody tube length included - to a fixed
// point. Each sweep re-solves the tube for the all-closed root, then every hole from the foot
// upward for the pitch its own fingering must produce, each one continued from its previous
// position so the sweep stays on one branch.
//
// The unknown is solved against the fingering's FUNDAMENTAL, not against "the target is some
// resonance of the lattice". A lattice has many resonances, and an earlier attempt that
// bisected the raw input pressure locked several holes onto an upper mode.
//
// Guards: each hole is bracketed inside the gap left by its two neighbours, so it can never
// cross another hole or leave the tube; the sweep count is capped; an unreachable target
// falls back to the closest achievable position and is recorded in `unreachable`; and the
// residual every note ACTUALLY lands on is re-measured on the settled lattice and returned.
// `opts` lowers the fidelity for the ranking pass of the diameter search only. The chosen
// diameter is always re-solved at full fidelity before anything is drilled, so a coarse rank
// can pick the wrong candidate but can never ship a coarse lattice.
export function solveToneHoleLattice(bore: number, wall: number, targets: number[], holeDiam: number, chimneyDepth: number, minGap: number, opts?: LatticeSolveOptions): LatticeSolution {
  const c = SPEED_OF_SOUND_MM_S;
  const corr = END_CORR_COEFF * bore * 0.5;
  const fRoot = targets[0];
  const fLo = fRoot * 0.30, fHi = fRoot * 12.0;
  // lat runs foot-to-fipple, i.e. ascending distanceFromFipple, the reverse of scale-degree
  // order. WaveguideFlutePipe.latticeFundamental() takes exactly this shape.
  const lat: SolverLatticeHole[] = [];
  for (let d = targets.length - 1; d >= 1; d--) {
    lat.push({ degree: d, target: targets[d], diameter: holeDiam, chimneyDepth: chimneyDepth, wall: wall,
               distanceFromFipple: Math.max(15.0, c / (2.0 * targets[d]) - 2.0 * corr) });
  }
  const n = lat.length;
  let acousticLength = c / (2.0 * fRoot) - 2.0 * corr;
  const allClosed = new Array(n).fill(false);
  const openTo: boolean[][] = [];
  for (let i = 0; i < n; i++) {
    const f: boolean[] = new Array(n);
    for (let j = 0; j < n; j++) f[j] = (j >= i);
    openTo.push(f);
  }

  const fund = (L: number, isOpen: boolean[]) => WaveguideFlutePipe.latticeFundamental(bore, L, lat, isOpen, wall, fLo, fHi);
  // A fundamental above the search ceiling is reported as null. That only happens when the
  // unknown is far too short, which is unambiguously "sharp", so it takes a large positive
  // residual rather than aborting the bracket.
  const errOf = (f: number | null, target: number) => (f === null ? 1.0e4 : 1200.0 * Math.log2(f / target));

  const o = opts || {};
  const MAX_SWEEPS = o.maxSweeps || 14, TOL_MM = 5.0e-3;
  const POS_STEPS = o.posSteps || 48, FREQ_ITERS = o.freqIters || 30;
  let sweeps = 0, maxDelta = Infinity;
  let unreachable: string[] = [];

  for (sweeps = 1; sweeps <= MAX_SWEEPS; sweeps++) {
    maxDelta = 0.0;
    unreachable = [];

    const footMost = n > 0 ? lat[n - 1].distanceFromFipple : 0.0;
    // Negated because moving a boundary away from the fipple lowers the pitch, and bisection
    // wants an increasing function.
    const solvedL = solveBracketed((L: number) => -errOf(fund(L, allClosed), fRoot),
      Math.max(footMost + minGap, 20.0), c / (2.0 * fRoot) + 60.0, acousticLength, POS_STEPS, FREQ_ITERS);
    if (solvedL) {
      if (!solvedL.exact) unreachable.push('acousticLength');
      // Number() is the same coercion the arithmetic below already applied to a null x.
      const solvedLx = Number(solvedL.x);
      maxDelta = Math.max(maxDelta, Math.abs(solvedLx - acousticLength));
      acousticLength = solvedLx;
    } else unreachable.push('acousticLength');

    for (let i = n - 1; i >= 0; i--) {
      const lo = (i > 0) ? lat[i - 1].distanceFromFipple + minGap : 15.0;
      const hi = (i < n - 1) ? lat[i + 1].distanceFromFipple - minGap : acousticLength - minGap;
      const prev = lat[i].distanceFromFipple;
      const solved = (hi > lo) ? solveBracketed((x: number) => {
        lat[i].distanceFromFipple = x;
        return -errOf(fund(acousticLength, openTo[i]), lat[i].target);
      }, lo, hi, prev, POS_STEPS, FREQ_ITERS) : null;
      if (!solved) {
        lat[i].distanceFromFipple = prev;
        unreachable.push('degree' + lat[i].degree);
      } else {
        if (!solved.exact) unreachable.push('degree' + lat[i].degree);
        const solvedX = Number(solved.x);
        lat[i].distanceFromFipple = solvedX;
        maxDelta = Math.max(maxDelta, Math.abs(solvedX - prev));
      }
    }
    if (maxDelta < TOL_MM) break;
  }
  if (sweeps > MAX_SWEEPS) sweeps = MAX_SWEEPS;

  // Residual is measured on the settled lattice, never assumed from the last bisection.
  const residuals = [{ degree: 0, cents: errOf(fund(acousticLength, allClosed), fRoot) }];
  for (let i = n - 1; i >= 0; i--) {
    residuals.push({ degree: lat[i].degree, cents: errOf(fund(acousticLength, openTo[i]), lat[i].target) });
  }
  let maxResidualCents = 0.0;
  for (const r of residuals) if (isFinite(r.cents)) maxResidualCents = Math.max(maxResidualCents, Math.abs(r.cents));

  // Printability is checked on the settled lattice rather than assumed from the brackets.
  // When a hole's bracket comes out empty (hi <= lo) the hole is left where it was, and where
  // it was can be closer to its neighbour than minGap - so two chimney bores could intersect
  // while every note still reported a residual. The measured minimum centre spacing is
  // returned and the diameter search rejects any candidate that fails it.
  let minCentreGapMM = Infinity;
  for (let i = 1; i < n; i++) minCentreGapMM = Math.min(minCentreGapMM, lat[i].distanceFromFipple - lat[i - 1].distanceFromFipple);
  if (n > 0) minCentreGapMM = Math.min(minCentreGapMM, acousticLength - lat[n - 1].distanceFromFipple);
  const spacingOK = n < 2 ? true : minCentreGapMM >= minGap - 1.0e-6;

  const byDegree: Record<number, number> = {};
  for (const h of lat) byDegree[h.degree] = h.distanceFromFipple;
  return {
    acousticLength: acousticLength,
    distanceByDegree: byDegree,
    solver: { sweeps: sweeps, maxDeltaMM: maxDelta, unreachable: unreachable, residuals: residuals,
              maxResidualCents: maxResidualCents,
              minCentreGapMM: minCentreGapMM, minGapMM: minGap, spacingOK: spacingOK,
              converged: maxDelta < TOL_MM && unreachable.length === 0 && maxResidualCents < 5.0 && spacingOK }
  };
}


// f_c = (c / 2pi) * sqrt( S_hole / (S_bore * t_e * s) ), with the same t_e the lattice and the
// waveguide junction both use, and s the spacing of the OPEN lattice for this fingering.
export function latticeCutoffHz(bore: number, holeDiam: number, effectiveHeight: number, spacingMM: number): number {
  const a = Math.max(0.5, bore * 0.5), sB = Math.PI * a * a;
  const rh = Math.max(0.25, holeDiam * 0.5), sH = Math.PI * rh * rh;
  return (SPEED_OF_SOUND_MM_S / (2.0 * Math.PI)) * Math.sqrt(sH / (sB * effectiveHeight * Math.max(1.0, spacingMM)));
}

// Worst cutoff ratio over every fingering the instrument can play. `positions` is indexed by
// scale degree 1..n; degree d opens holes 1..d, the ones toward the foot.
export function worstVentRatio(bore: number, wall: number, chimneyDepth: number, holeDiam: number, positions: Record<number, number>, targets: number[], acousticLength: number): number {
  const te = chimneyDepth + wall + 0.85 * Math.max(0.25, holeDiam * 0.5);
  let worst = Infinity;
  const n = targets.length - 1;
  for (let d = 1; d <= n; d++) {
    const open: number[] = [];
    for (let k = 1; k <= d; k++) if (positions[k] !== undefined) open.push(positions[k]);
    if (open.length === 0) continue;
    open.sort((p, q) => p - q);
    let s: number;
    if (open.length === 1) s = Math.max(1.0, acousticLength - open[0]);
    else {
      let sum = 0.0;
      for (let i = 1; i < open.length; i++) sum += open[i] - open[i - 1];
      s = sum / (open.length - 1);
    }
    worst = Math.min(worst, latticeCutoffHz(bore, holeDiam, te, s) / targets[d]);
  }
  return isFinite(worst) ? worst : Infinity;
}

// Rank candidate diameters lexicographically.
//   1. spacing        a lattice whose chimney bores intersect is not an instrument at all.
//   2. worst residual how far the worst note in the scale lands from its target, in 1-cent
//                     buckets so that a hundredth of a cent cannot outvote venting. This is
//                     the primary tuning term, NOT the count of degrees flagged unreachable:
//                     "unreachable" only means the exact target has no root in the bracket,
//                     and ranking by that count picked a piccolo hijaz lattice with four
//                     flagged degrees at 91 cents over one with five flagged at 68. What a
//                     player hears is the cents, so the cents decide.
//   3. venting        among candidates that tune equally well, take one that keeps the open
//                     lattice's cutoff above the notes being played.
//   4. rms residual   separates candidates whose worst note ties but whose scale as a whole
//                     does not.
//   5. smallest       a hole no larger than the acoustics need is easier to seal, removes
//                     less of the tube, leaves more room for the next hole, and stretches the
//                     closed-stub octave less.
export function scoreDiameterCandidate(cand: DiameterCandidate): number[] {
  return [
    cand.spacingOK ? 0 : 1,
    Math.round(cand.maxResidualCents),
    cand.ventRatio >= VENT_CUTOFF_RATIO_TARGET ? 0 : 1,
    Math.round(cand.rmsResidualCents * 4.0),
    cand.diameter
  ];
}
export function candidateIsBetter(a: DiameterCandidate, b: DiameterCandidate): boolean {
  const sa = scoreDiameterCandidate(a), sb = scoreDiameterCandidate(b);
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] < sb[i];
  return false;
}

// Joint solve. The ladder is ranked with a reduced-fidelity lattice solve, then the winner is
// re-solved at full fidelity - so the search costs a fraction of one full solve per candidate
// and what is finally drilled is always a full-fidelity result.
// Guards: the ladder is finite and bounded at both ends; every candidate is a completed lattice
// solve, never an extrapolation; if no candidate is spacing-feasible the least-bad one is still
// returned and `spacingOK` on it stays false so the caller can see it; and the fallback when the
// ladder is empty is the floor diameter, solved normally.
export function solveHoleGeometry(bore: number, wall: number, targets: number[], chimneyDepth: number): HoleGeometrySolution {
  const dMax = Math.max(HOLE_DIAM_MIN_MM, Math.min(HOLE_DIAM_FINGER_MAX_MM, bore * HOLE_DIAM_BORE_FRACTION_MAX));
  const RANK = { maxSweeps: 5, posSteps: 28, freqIters: 20 };
  const evaluate = (d: number, opts?: LatticeSolveOptions): DiameterCandidate => {
    const minGap = d + 2.0;
    const hit = solveToneHoleLattice(bore, wall, targets, d, chimneyDepth, minGap, opts);
    const s = hit.solver;
    let sq = 0.0;
    for (const r of s.residuals) if (isFinite(r.cents)) sq += r.cents * r.cents;
    return {
      diameter: d, minGap: minGap, hit: hit,
      spacingOK: s.spacingOK, unreachCount: s.unreachable.length, maxResidualCents: s.maxResidualCents,
      rmsResidualCents: Math.sqrt(sq / Math.max(1, s.residuals.length)),
      ventRatio: worstVentRatio(bore, wall, chimneyDepth, d, hit.distanceByDegree, targets, hit.acousticLength)
    };
  };

  let best: DiameterCandidate | null = null, ranked = 0;
  const ladder: number[] = [];
  for (let d = HOLE_DIAM_MIN_MM; d <= dMax + 1.0e-9; d += HOLE_DIAM_STEP_MM) ladder.push(Math.round(d * 100) / 100);
  if (ladder.length === 0) ladder.push(HOLE_DIAM_MIN_MM);
  for (const d of ladder) {
    const cand = evaluate(d, RANK);
    ranked++;
    if (best === null || candidateIsBetter(cand, best)) best = cand;
    // The ladder ascends and the last tie-break prefers the smallest diameter, so a candidate
    // that is already perfect on every earlier term cannot be beaten by anything above it.
    if (best.spacingOK && best.maxResidualCents < 0.5 && best.ventRatio >= VENT_CUTOFF_RATIO_TARGET) break;
  }

  if (best === null) throw new Error('diameter ladder produced no candidate');
  const chosen = evaluate(best.diameter, undefined);
  // The diameter verdict is folded onto the lattice report in place, which is what turns a
  // LatticeSolverReport into the SolverReport the geometry and the UI read.
  const report: SolverReport = Object.assign(chosen.hit.solver, {
    diameter: chosen.diameter,
    diameterLadder: { min: ladder[0], max: ladder[ladder.length - 1], step: HOLE_DIAM_STEP_MM, count: ladder.length, ranked: ranked },
    diameterLimit: (dMax <= HOLE_DIAM_FINGER_MAX_MM + 1.0e-9 && dMax < HOLE_DIAM_FINGER_MAX_MM)
      ? 'bore ' + HOLE_DIAM_BORE_FRACTION_MAX.toFixed(2) + 'x' : 'fingertip ' + HOLE_DIAM_FINGER_MAX_MM + 'mm',
    ventRatio: chosen.ventRatio,
    ventTarget: VENT_CUTOFF_RATIO_TARGET,
    ventShortfall: chosen.ventRatio < VENT_CUTOFF_RATIO_TARGET
  });
  const solved: FullLatticeSolution = Object.assign(chosen.hit, { solver: report });
  return { diameter: chosen.diameter, minGap: chosen.minGap, solved: solved };
}

// The solve is deterministic in its inputs and runs on every geometry change, ahead of a WASM
// recompile, so its result is memoised on the inputs that can move a hole.
const _latticeSolveCache = new Map<string, HoleGeometrySolution>();
export function solveHoleGeometryCached(bore: number, wall: number, targets: number[], chimneyDepth: number): HoleGeometrySolution {
  const key = bore + '|' + wall + '|' + chimneyDepth + '|' + targets.join(',');
  let hit = _latticeSolveCache.get(key);
  if (!hit) {
    hit = solveHoleGeometry(bore, wall, targets, chimneyDepth);
    if (_latticeSolveCache.size > 64) _latticeSolveCache.clear();
    _latticeSolveCache.set(key, hit);
  }
  return hit;
}
