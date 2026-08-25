import type { LatticeHole, ToneHole, PadOpenness, PadTarget } from '../types.js';

export class WaveguideFlutePipe {
  // Geometry and excitation state. Everything not set in the constructor is set by
  // rebuild(), which the constructor calls.
  sr: number;
  c: number;
  bore: number;
  acousticLength: number;
  holes: ToneHole[];
  wallThickness: number;

  sacPressure: number;
  airNoise: number;
  keySlapGain: number;
  keySlapImpact: number;
  registerRatio: number;
  jetDelay: Float32Array;
  writeJet: number;
  dcX: number; dcY: number;
  aaY1: number; aaY2: number; aaX1: number; aaX2: number;
  radHpX: number; radHpY: number;
  /**
   * Seeded generator for reproducible renders; null means Math.random(). The offline render
   * sets it (see createSeededRandom in ../acoustics/random.ts) so the gallery's .wav bytes are
   * a function of the settings alone. Live playback leaves it null.
   */
  rng: (() => number) | null;
  padTravelSec: number;
  extIn: number;
  jetRatio: number;

  // Built by rebuild().
  order: ToneHole[];
  nSeg: number;
  os: number;
  osr: number;
  sBore: number;
  endCorr: number;
  fippleCorr: number;
  radB: number; radY: number; radLoss: number;
  fipB: number; fipY: number; fipLoss: number;
  segSamp: Float64Array;
  segGain: Float64Array;
  dn: Float64Array[];
  up: Float64Array[];
  dnW: Int32Array;
  upW: Int32Array;
  /** Instantaneous pad position, 0 closed .. 1 open. Travels toward jTarget. */
  jOpen: PadOpenness;
  /** Commanded pad position. Written only by setFingering(). */
  jTarget: PadTarget;
  jVel: Float64Array;
  jb0: Float64Array; jb2: Float64Array; ja1: Float64Array; ja2: Float64Array;
  jx1: Float64Array; jx2: Float64Array; jy1: Float64Array; jy2: Float64Array;
  padTravelSamples: number;
  outScale: number;
  aab0: number; aab1: number; aab2: number; aaa1: number; aaa2: number;
  geomLength: number;
  geomFreq: number;
  pendingSlap: number;
  slapAt: number;
  slapEnergy: number;
  slapTimer: number;
  slapLen: number;
  _aDn?: Float64Array;
  _aUp?: Float64Array;

  constructor(sampleRate: number, boreDiameter = 19.0, acousticLength = 390.0, holes: ToneHole[] = []) {
    this.sr = sampleRate;
    this.c = 343200.0;
    this.bore = boreDiameter;
    this.acousticLength = acousticLength;
    this.holes = Array.isArray(holes) ? holes : [];

    this.sacPressure = 0.0;
    this.airNoise = 0.0;
    this.keySlapGain = 0.65;
    this.keySlapImpact = 0.0;
    this.registerRatio = 1.0;
    this.jetDelay = new Float32Array(Math.max(64, Math.floor(sampleRate * 0.08)));
    this.writeJet = 0;
    this.dcX = 0.0; this.dcY = 0.0;
    this.aaY1 = 0.0; this.aaY2 = 0.0; this.aaX1 = 0.0; this.aaX2 = 0.0;
    this.radHpX = 0.0; this.radHpY = 0.0;
    this.rng = null;
    this.padTravelSec = 0.014;
    this.extIn = 0.0;
    // Jet transit across the window, as a fraction of the sounding period. Half a period
    // is the Coltman/Fletcher jet-drive condition for first-mode operation; measured over
    // six bores it locks the fundamental to within 0.4 cents of the passive resonance.
    // Higher registers need no separate value: geomFreq already carries registerRatio,
    // so the transit shortens automatically to select mode n.
    this.jetRatio = 0.50;

    this.rebuild();
  }

  noise(): number {
    if (this.rng) return this.rng() * 2.0 - 1.0;
    return Math.random() * 2.0 - 1.0;
  }

  rebuild(): void {
    const c = this.c;
    const a = Math.max(0.5, this.bore * 0.5);
    const sBore = Math.PI * a * a;

    // Unflanged open-pipe radiation length correction (Levine & Schwinger 1948): 0.6133*a.
    // Applied at the foot and, as a first approximation, at the fipple window end.
    // computeFluteGeometry() instead subtracts 1.6*bore (= 3.2*a) for BOTH ends combined.
    // That discrepancy is deliberately left uncorrected so it shows up as a measurable
    // tuning error rather than being hidden inside the synthesis.
    this.endCorr = 0.6133 * a;
    this.fippleCorr = 0.6133 * a;

    const hs = (this.holes || []).slice().sort((p, q) => p.distanceFromFipple - q.distanceFromFipple);
    this.order = hs;
    const n = hs.length;
    this.nSeg = n + 1;

    const bounds = [];
    for (let i = 0; i < n; i++) bounds.push(hs[i].distanceFromFipple);
    bounds.push(Math.max(bounds.length ? bounds[bounds.length - 1] + 2.0 : 10.0, this.acousticLength));

    const mm = new Float64Array(this.nSeg);
    let prev = 0.0;
    let minMM = Infinity;
    for (let k = 0; k < this.nSeg; k++) {
      let d = bounds[k] - prev;
      prev = bounds[k];
      if (d < 0.05) d = 0.05;
      if (k === 0) d += this.fippleCorr;
      if (k === this.nSeg - 1) d += this.endCorr;
      mm[k] = d;
      if (d < minMM) minMM = d;
    }

    // Oversample so the shortest bore segment still spans >= 2 delay samples. A piccolo's
    // upper tone holes sit only a few mm apart, which is under one sample at 48 kHz.
    const mmPerSample = c / this.sr;
    let os = Math.ceil((2.0 * mmPerSample) / Math.max(0.05, minMM));
    if (!isFinite(os) || os < 1) os = 1;
    if (os > 8) os = 8;
    this.os = os;
    this.osr = this.sr * os;

    // Terminating filters are built before the delay lines because their group delay is part
    // of the round trip and has to come back out of the delay-line lengths. Without this the
    // pipe sounds flat by a fixed number of samples per round trip, which is a large error on
    // a short (high-pitched) bore and a small one on a long bore.
    const fRad = Math.min(this.osr * 0.45, c / (2.0 * Math.PI * a));
    this.radB = Math.exp(-2.0 * Math.PI * fRad / this.osr);
    this.radY = 0.0;
    this.radLoss = 0.995;
    this.fipB = Math.exp(-2.0 * Math.PI * Math.min(this.osr * 0.45, c / (1.6 * Math.PI * a)) / this.osr);
    this.fipY = 0.0;
    this.fipLoss = 0.965;
    // Low-frequency group delay of y[n] = b*y[n-1] + (1-b)*x[n] is b/(1-b) samples.
    const radGD = this.radB / (1.0 - this.radB);
    const fipGD = this.fipB / (1.0 - this.fipB);

    this.segSamp = new Float64Array(this.nSeg);
    this.dn = []; this.up = [];
    this.dnW = new Int32Array(this.nSeg);
    this.upW = new Int32Array(this.nSeg);
    this.segGain = new Float64Array(this.nSeg);
    for (let k = 0; k < this.nSeg; k++) {
      let d = mm[k] / c * this.osr;
      // Each segment is traversed twice per round trip, so half of each end filter's group
      // delay is removed from the segment that terminates in it.
      if (k === 0) d -= 0.5 * fipGD;
      if (k === this.nSeg - 1) d -= 0.5 * radGD;
      d = Math.max(1.0, d);
      this.segSamp[k] = d;
      const cap = Math.max(4, Math.ceil(d) + 4);
      this.dn.push(new Float64Array(cap));
      this.up.push(new Float64Array(cap));
      // Distributed visco-thermal wall loss, lumped per segment.
      // Kirchhoff/Benade: alpha ~ 3.0e-5*sqrt(f)/a  per mm, evaluated at 1 kHz.
      const alphaPerMM = 3.0e-5 * Math.sqrt(1000.0) / a;
      this.segGain[k] = Math.exp(-alphaPerMM * mm[k]);
    }

    // Tone hole junction biquads (alpha filters) and pad-motion state.
    this.jOpen = new Float64Array(n) as unknown as PadOpenness;      // current pad openness 0..1
    this.jTarget = new Float64Array(n) as unknown as PadTarget;    // commanded openness
    this.jVel = new Float64Array(n);
    this.jb0 = new Float64Array(n); this.jb2 = new Float64Array(n);
    this.ja1 = new Float64Array(n); this.ja2 = new Float64Array(n);
    this.jx1 = new Float64Array(n); this.jx2 = new Float64Array(n);
    this.jy1 = new Float64Array(n); this.jy2 = new Float64Array(n);
    this.sBore = sBore;
    for (let i = 0; i < n; i++) {
      this.jOpen[i] = 0.0; this.jTarget[i] = 0.0;
      this.updateJunction(i);
    }

    // Decimation anti-alias: 2nd-order Butterworth at 0.42*sr, run at the oversampled rate.
    this.buildAA(Math.min(this.osr * 0.45, this.sr * 0.42));

    this.padTravelSamples = Math.max(1, Math.floor(this.padTravelSec * this.osr));
    // Level match against the modal engine, which is the A/B reference and must swap in
    // without also being a volume change. Two separate effects are corrected here.
    // sqrt(nSeg): `radiated` sums escaping flow over every port, so its level grows with the
    // number of tone holes; normalising keeps a 7-hole alto and a 5-hole contrabass level.
    // The pitch term: this engine radiates the TIME DERIVATIVE of the escaping flow, a tilt
    // the modal engine's biquad bank does not have, which left a contrabass about 8 dB below
    // a piccolo on the same passage. The exponent is under 1 because the bore's visco-thermal
    // loss cancels part of the tilt at the long-tube end - it is fitted to measured RMS over
    // five registers, not derived.
    const fBase = c / (2.0 * (this.acousticLength + this.endCorr + this.fippleCorr));
    this.outScale = 0.0964 / Math.sqrt(this.nSeg) * Math.pow(440.0 / Math.max(20.0, fBase), 0.44);
    this.updateGeomFreq();
  }

  buildAA(fc: number): void {
    const w = Math.tan(Math.PI * fc / this.osr);
    const k = Math.SQRT2 * w, w2 = w * w;
    const d = 1.0 + k + w2;
    this.aab0 = w2 / d; this.aab1 = 2.0 * w2 / d; this.aab2 = w2 / d;
    this.aaa1 = (2.0 * (w2 - 1.0)) / d; this.aaa2 = (1.0 - k + w2) / d;
  }

  // Three-port parallel (Kelly-Lochbaum) tone hole junction.
  //   Y0 = S_bore/(rho*c)                  bore characteristic admittance
  //   Yh = 1/(s*M) + s*C                   shunt: open-part inertance || closed-part compliance
  //     M = rho*t_e/S_open,  t_e = wall+chimney + 0.85*r_hole   (Keefe open-hole inertance)
  //     C = S_closed*t_c/(rho*c^2)         (closed stub compliance)
  //   alpha(s) = 2*Y0/(2*Y0+Yh) = s*K / (s^2*M*C + s*K + 1),  K = 2*Y0*M
  // rho cancels: K = 2*S_bore*t_e/(c*S_open),  M*C = t_e*t_c*S_closed/(S_open*c^2).
  // Limits: openness->0 gives the one-pole low-pass (transparent at low f, alpha->1);
  //         openness->1 gives the one-pole high-pass (alpha->0 at low f = pressure release).
  // All analog coefficients are non-negative, so the bilinear-transformed biquad is
  // unconditionally stable for every openness.
  // Refs: Keefe, JASA 72(3) 1982; Scavone, CCRMA PhD thesis 1997 ch.5;
  //       Valimaki, Scavone & Cook, "Modeling of woodwind bores with finger holes", ICMC 1993.
  updateJunction(i: number): void {
    const h = this.order[i];
    const c = this.c;
    const rh = Math.max(0.25, (h.diameter || 7.0) * 0.5);
    const sh = Math.PI * rh * rh;
    const tc = Math.max(0.4, (h.chimneyDepth || 2.8) + (h.wall !== undefined ? h.wall : (this.wallThickness || 5.5)));
    const te = tc + 0.85 * rh;

    const openness = Math.min(1.0, Math.max(0.0, this.jOpen[i]));
    const sOpen = Math.max(sh * 1.0e-3, sh * openness);
    const sClosed = Math.max(0.0, sh * (1.0 - openness));

    const K = 2.0 * this.sBore * te / (c * sOpen);
    const MC = te * tc * sClosed / (sOpen * c * c);

    const g = 2.0 * this.osr;
    const Ag2 = MC * g * g, Bg = K * g;
    const a0 = Ag2 + Bg + 1.0;
    this.jb0[i] = Bg / a0;
    this.jb2[i] = -Bg / a0;
    this.ja1[i] = (2.0 - 2.0 * Ag2) / a0;
    this.ja2[i] = (Ag2 - Bg + 1.0) / a0;
  }

  // Sounding pitch of the CURRENT fingering, taken from the lattice's own lowest resonance.
  // It sets the jet transit time, which is what selects the mode the jet drives, so an
  // estimate that disagrees with the lattice makes the pipe overblow a note it should not.
  // The lumped Benade open-hole correction that used to stand here is a single-hole
  // approximation and drifted far enough on multi-hole fingerings to do exactly that.
  // The COMMANDED fingering (jTarget) is what the estimate is taken from, not the pads'
  // instantaneous position (jOpen). setFingering() writes jTarget and then calls this, so
  // reading jOpen sampled the pads BEFORE any of them had moved - which is always the
  // previous fingering, and on the first note of a session is always all-closed. The jet
  // transit was therefore aimed at the all-closed root for every fingering in the
  // instrument, and nothing ever re-aimed it once the pads finished travelling. On any
  // fingering whose own pitch is well above the root the transit was then a whole period
  // or more instead of half of one, and the jet drove an upper mode. A player re-aims at
  // the note being fingered, not at the note just left, so jTarget is also the physically
  // right quantity to read.
  updateGeomFreq(): number {
    const n = this.order.length;
    const isOpen = new Array(n);
    for (let i = 0; i < n; i++) isOpen[i] = (this.jTarget ? this.jTarget[i] : this.jOpen[i]) > 0.5;
    const fBase = this.c / (2.0 * (this.acousticLength + this.endCorr + this.fippleCorr));
    const f = WaveguideFlutePipe.latticeFundamental(
      this.bore, this.acousticLength, this.order, isOpen, this.wallThickness || 5.5,
      fBase * 0.7, fBase * 8.0);
    const fSound = (f === null || !(f > 0.0)) ? fBase : f;
    this.geomLength = this.c / (2.0 * fSound);
    this.geomFreq = Math.max(20.0, fSound) * this.registerRatio;
    return this.geomFreq;
  }

  // ---------------------------------------------------------------------------------------
  // Lattice statics. These are the passive, continuous-time twin of the scattering loop
  // below: same 0.6133*a end corrections, same Keefe open-hole inertance
  // (t_e = wall + chimney + 0.85*r_hole) and same closed-stub compliance. They live on the
  // class so that the tone-hole position solver in computeFluteGeometry(), this pipe's own
  // mode selection, and the stringified worklet copy all read ONE description of the
  // acoustics. Drilled geometry and synthesised pitch then agree by construction.
  // The speed of sound and the end-correction coefficient are written out as literals rather
  // than read from SPEED_OF_SOUND_MM_S / END_CORR_COEFF: buildFluteWorkletSource() ships this
  // class through toString(), and a module-level constant does not exist inside the worklet.
  // Refs: Keefe, JASA 72(3) 1982; Benade, "Fundamentals of Musical Acoustics" ch.21;
  //       Levine & Schwinger, Phys. Rev. 73 1948.
  // ---------------------------------------------------------------------------------------

  // Pressure at the foot's radiating plane, driven at f against a pressure release at the
  // fipple plane. A zero means f is a resonance of this fingering.
  // State is carried as (p, v) with v = U/j; every coefficient is real because the model is
  // lossless. rho divides out of the characteristic admittance and of both hole reactances
  // alike and is therefore set to 1.
  // `lat` must be sorted by ascending distanceFromFipple, and `isOpen` indexed to match.
  static latticeFootPressure(f: number, bore: number, acousticLength: number, lat: LatticeHole[], isOpen: boolean[], wallThickness: number): number {
    const c = 343200.0;
    const a = Math.max(0.5, bore * 0.5);
    const corr = 0.6133 * a;
    const y0 = (Math.PI * a * a) / c;
    const w = 2.0 * Math.PI * f;
    const k = w / c;
    const xFoot = acousticLength + corr * 2.0;
    let p = 0.0, v = 1.0, x = 0.0;
    for (let i = 0; i < lat.length; i++) {
      const xh = corr + lat[i].distanceFromFipple;
      if (!(xh > x) || xh >= xFoot) continue;
      const kl = k * (xh - x), cs = Math.cos(kl), sn = Math.sin(kl);
      const np = cs * p + sn * v / y0;
      v = -y0 * sn * p + cs * v;
      p = np;
      x = xh;
      const rh = Math.max(0.25, (lat[i].diameter || 7.0) * 0.5);
      const sh = Math.PI * rh * rh;
      const holeWall = lat[i].wall;
      const tc = Math.max(0.4, (lat[i].chimneyDepth || 2.8) + (holeWall !== undefined ? holeWall : wallThickness));
      if (isOpen[i]) v += p * sh / (w * (tc + 0.85 * rh));
      else v -= p * w * sh * tc / (c * c);
    }
    const klEnd = k * (xFoot - x);
    return Math.cos(klEnd) * p + Math.sin(klEnd) * v / y0;
  }

  // Lowest resonance in [fLo, fHi], or null if there is none. The grid is swept upward and
  // the first sign change is bisected, so the answer is the fundamental rather than whichever
  // mode a plain root-find happened to land on.
  static latticeFundamental(bore: number, acousticLength: number, lat: LatticeHole[], isOpen: boolean[], wallThickness: number, fLo: number, fHi: number): number | null {
    if (!(fHi > fLo) || !(acousticLength > 0.0)) return null;
    const STEPS = 84, ITERS = 26;
    const g = (f: number) => WaveguideFlutePipe.latticeFootPressure(f, bore, acousticLength, lat, isOpen, wallThickness);
    // Geometric grid: the fundamental sits at the bottom of a span that can cover four
    // octaves, and a linear grid spends nearly all its points above it.
    const ratio = Math.pow(fHi / fLo, 1.0 / STEPS);
    let xa = fLo, ya = g(fLo);
    for (let s = 1; s <= STEPS; s++) {
      const xb = fLo * Math.pow(ratio, s), yb = g(xb);
      if (yb === 0.0) return xb;
      if ((ya < 0) !== (yb < 0)) {
        let a = xa, b = xb, fa = ya;
        for (let i = 0; i < ITERS; i++) {
          const m = 0.5 * (a + b), fm = g(m);
          if ((fa < 0) !== (fm < 0)) b = m; else { a = m; fa = fm; }
        }
        return 0.5 * (a + b);
      }
      xa = xb; ya = yb;
    }
    return null;
  }

  setGeometry(boreDiameter: number, acousticLength: number, holes: ToneHole[], wallThickness: number): void {
    let dirty = false;
    if (typeof boreDiameter === 'number' && !isNaN(boreDiameter) && boreDiameter > 0.0 && boreDiameter !== this.bore) { this.bore = boreDiameter; dirty = true; }
    if (typeof acousticLength === 'number' && !isNaN(acousticLength) && acousticLength > 0.0 && acousticLength !== this.acousticLength) { this.acousticLength = acousticLength; dirty = true; }
    if (typeof wallThickness === 'number' && !isNaN(wallThickness) && wallThickness > 0.0 && wallThickness !== this.wallThickness) { this.wallThickness = wallThickness; dirty = true; }
    if (Array.isArray(holes)) {
      const same = this.holes.length === holes.length && this.holes.every((h, i) =>
        h.distanceFromFipple === holes[i].distanceFromFipple && h.diameter === holes[i].diameter && h.chimneyDepth === holes[i].chimneyDepth);
      if (!same) { this.holes = holes; dirty = true; }
    }
    if (dirty) {
      const prevOpen = this.jOpen ? Array.from(this.jOpen) : null;
      const prevTgt = this.jTarget ? Array.from(this.jTarget) : null;
      this.rebuild();
      // jOpen and jTarget are allocated together in rebuild(), so they are both present or
      // both absent; the pair is tested so the target array is never indexed through a null.
      if (prevOpen && prevTgt) for (let i = 0; i < Math.min(prevOpen.length, this.jOpen.length); i++) { this.jOpen[i] = prevOpen[i]; this.jTarget[i] = prevTgt[i]; this.updateJunction(i); }
      this.updateGeomFreq();
    }
  }

  // Fingering. covered[i] follows midiToHoles(): index 0 is the hole nearest the foot,
  // true means the pad is down. Pads travel over padTravelSec instead of stepping, so the
  // boundary condition genuinely moves and the bore is excited by the motion itself.
  setFingering(covered: boolean[]): void {
    if (!Array.isArray(covered) || this.order.length === 0) return;
    for (let i = 0; i < this.order.length; i++) {
      const srcIdx = this.order[i].index;
      const isCovered = (srcIdx < covered.length) ? !!covered[srcIdx] : true;
      this.jTarget[i] = isCovered ? 0.0 : 1.0;
    }
    this.updateGeomFreq();
  }

  setRegister(ratio: number): void {
    if (typeof ratio === 'number' && !isNaN(ratio) && ratio > 0.0) {
      this.registerRatio = Math.max(0.5, Math.min(4.0, ratio));
      this.updateGeomFreq();
    }
  }

  // Retained for engine parity. In the waveguide the slap is not a synthesised transient:
  // it scales the mechanical impulse that pad motion injects AT the hole's own junction,
  // so the bore filters it and the spectrum follows the instrument.
  triggerKeySlap(impact = 1.0): void {
    this.keySlapImpact = Math.max(0.0, Math.min(1.0, impact));
    this.pendingSlap = this.keySlapImpact;
  }

  readSeg(buf: Float64Array, w: number, d: number): number {
    const cap = buf.length;
    const di = Math.floor(d);
    const fr = d - di;
    let i0 = w - di; while (i0 < 0) i0 += cap;
    let i1 = i0 - 1; if (i1 < 0) i1 += cap;
    return buf[i0] * (1.0 - fr) + buf[i1] * fr;
  }

  // One oversampled waveguide tick. Returns radiated pressure.
  tick(P: number): number {
    const n = this.order.length, nSeg = this.nSeg;

    // --- pad motion -------------------------------------------------------
    const step = 1.0 / this.padTravelSamples;
    for (let i = 0; i < n; i++) {
      const t = this.jTarget[i], o = this.jOpen[i];
      if (o !== t) {
        const dir = t > o ? 1.0 : -1.0;
        let no = o + dir * step;
        if ((dir > 0 && no >= t) || (dir < 0 && no <= t)) {
          no = t;
          // Pad seating/lifting impulse, injected at this junction below.
          this.slapAt = i;
          this.slapEnergy = (dir < 0 ? 1.0 : 0.45) * this.keySlapGain * Math.max(0.25, this.keySlapImpact || 0.6);
          this.slapTimer = Math.max(2, Math.floor(this.osr * 0.0007));
          this.slapLen = this.slapTimer;
        }
        this.jVel[i] = dir * step;
        this.jOpen[i] = no;
        this.updateJunction(i);
      } else if (this.jVel[i] !== 0.0) {
        this.jVel[i] = 0.0;
      }
    }

    // --- gather segment arrivals -----------------------------------------
    const aDn = this._aDn || (this._aDn = new Float64Array(nSeg));
    const aUp = this._aUp || (this._aUp = new Float64Array(nSeg));
    for (let k = 0; k < nSeg; k++) {
      aDn[k] = this.readSeg(this.dn[k], this.dnW[k], this.segSamp[k]) * this.segGain[k];
      aUp[k] = this.readSeg(this.up[k], this.upW[k], this.segSamp[k]) * this.segGain[k];
    }

    let radiated = 0.0;

    // --- foot: radiation reflection --------------------------------------
    const xEnd = aDn[nSeg - 1];
    this.radY = this.radB * this.radY + (1.0 - this.radB) * xEnd;
    const upEnd = -this.radLoss * this.radY;
    radiated += (xEnd - upEnd);
    this.up[nSeg - 1][this.upW[nSeg - 1]] = upEnd;

    // --- tone hole junctions ---------------------------------------------
    for (let i = 0; i < n; i++) {
      const p1 = aDn[i], p2 = aUp[i + 1];
      const sum = p1 + p2;
      // alpha biquad: pJ = alpha(z) * sum
      let y = this.jb0[i] * sum + this.jb2[i] * this.jx2[i] - this.ja1[i] * this.jy1[i] - this.ja2[i] * this.jy2[i];
      if (!(y > -1e30 && y < 1e30)) y = 0.0;
      if (y > -1e-30 && y < 1e-30) y = 0.0;
      this.jx2[i] = this.jx1[i]; this.jx1[i] = sum;
      this.jy2[i] = this.jy1[i]; this.jy1[i] = y;
      const pJ = y;
      let outLeft = pJ - p1;
      let outRight = pJ - p2;
      // Volume flow escaping through the hole is the radiated share at this junction.
      radiated += 2.0 * (sum - pJ);
      // Pad impulse enters the bore HERE, splitting both ways.
      if (this.slapTimer > 0 && this.slapAt === i) {
        const env = this.slapTimer / this.slapLen;
        const imp = this.noise() * env * env * this.slapEnergy * 0.5;
        outLeft += imp; outRight += imp;
      }
      this.up[i][this.upW[i]] = outLeft;
      this.dn[i + 1][this.dnW[i + 1]] = outRight;
    }
    if (this.slapTimer > 0) this.slapTimer--;

    // --- fipple: pressure-release reflection + Fletcher jet ---------------
    const xFip = aUp[0];
    this.fipY = this.fipB * this.fipY + (1.0 - this.fipB) * xFip;
    const refl = -this.fipLoss * this.fipY;

    const jetVelocity = Math.sqrt(Math.max(0.0, P));
    const white = this.noise();
    this.airNoise = this.airNoise * 0.75 + white * 0.25;
    const labiumTurbulence = this.airNoise * 0.012 * jetVelocity;

    const jetTransit = Math.max(2.0, (this.osr / Math.max(20.0, this.geomFreq)) * this.jetRatio);
    this.jetDelay[this.writeJet] = xFip * 0.48 + labiumTurbulence;
    this.writeJet = (this.writeJet + 1) % this.jetDelay.length;
    const jd = Math.floor(jetTransit);
    let ri = this.writeJet - 1 - jd; while (ri < 0) ri += this.jetDelay.length;
    const delayedJetDeflection = this.jetDelay[ri];

    const eta = delayedJetDeflection * 1.4 + labiumTurbulence;
    const flowInjection = jetVelocity * Math.tanh(eta);

    // DC blocker: the tanh jet has a DC term and the tone hole alpha filters have a zero
    // at DC, so unblocked DC would accumulate in the loop.
    const dcIn = flowInjection;
    this.dcY = dcIn - this.dcX + 0.9995 * this.dcY;
    this.dcX = dcIn;

    this.dn[0][this.dnW[0]] = refl + this.dcY * 0.9 + this.extIn;
    this.extIn = 0.0;

    for (let k = 0; k < nSeg; k++) {
      this.dnW[k] = (this.dnW[k] + 1) % this.dn[k].length;
      this.upW[k] = (this.upW[k] + 1) % this.up[k].length;
    }

    // Radiation is proportional to the time derivative of the escaping flow.
    const hp = 0.996 * (this.radHpY + radiated - this.radHpX);
    this.radHpX = radiated; this.radHpY = hp;
    return hp * this.outScale + labiumTurbulence * 0.35;
  }

  process(breathP: number): number {
    if (isNaN(breathP)) breathP = 0.0;
    this.sacPressure += (breathP - this.sacPressure) * 0.08;
    const P = this.sacPressure;

    let out = 0.0;
    for (let s = 0; s < this.os; s++) {
      const v = this.tick(P);
      // Anti-alias low-pass before decimation (runs at the oversampled rate).
      const y = this.aab0 * v + this.aab1 * this.aaX1 + this.aab2 * this.aaX2 - this.aaa1 * this.aaY1 - this.aaa2 * this.aaY2;
      this.aaX2 = this.aaX1; this.aaX1 = v;
      this.aaY2 = this.aaY1; this.aaY1 = y;
      out = y;
    }
    if (!(out > -1e30 && out < 1e30)) { out = 0.0; this.panic(); }
    return out;
  }

  panic(): void {
    for (let k = 0; k < this.nSeg; k++) { this.dn[k].fill(0); this.up[k].fill(0); }
    this.jx1.fill(0); this.jx2.fill(0); this.jy1.fill(0); this.jy2.fill(0);
    this.radY = 0; this.fipY = 0; this.dcX = 0; this.dcY = 0;
    this.aaX1 = this.aaX2 = this.aaY1 = this.aaY2 = 0;
    this.radHpX = this.radHpY = 0;
    this.jetDelay.fill(0);
  }
}
