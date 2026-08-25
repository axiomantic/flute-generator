export const SPEED_OF_SOUND_MM_S = 343200.0;
// Unflanged open-end radiation length correction as a multiple of the bore RADIUS
// (Levine & Schwinger 1948). WaveguideFlutePipe.rebuild() applies this same coefficient at
// the foot and at the fipple window, so one number now serves the drilled tube and the
// synthesised one. The previous CAD figure, 1.6*bore, is 2.6x this for the two ends combined
// and cut every tube short.
export const END_CORR_COEFF = 0.6133;

// ------------------------------------------------------------------------------------------
// Tone hole DIAMETER, solved jointly with position.
//
// Diameter was a derived constant (0.38 * bore, clamped to 5.0..9.5 mm). Two failures traced
// back to that clamp. Holes that vent weakly cannot pull a note far enough from the tube's own
// pitch, so scale degrees near the fipple became unreachable at any position; and the open-hole
// lattice's cutoff fell below the notes being played, so the lattice stopped terminating the
// bore and the jet had upper modes of the whole tube to lock onto.
//
// Widening a hole fixes both and costs both back, because minGap = diameter + 2 mm is what
// keeps two chimney bores from intersecting: every millimetre of diameter takes a millimetre of
// room away from the hole spacing that close scale degrees need. There is no closed form for
// where that trade lands - it depends on the scale's own interval structure - so the diameter
// is searched over a ladder and each candidate is judged by solving the whole lattice at it.
//
// BOUNDS, each a hard physical limit rather than a preference:
//   floor  5.0 mm   The smallest hole a 0.4 mm FDM nozzle prints round without a bridge, and
//                   the existing floor, so nothing that printed before stops printing.
//   finger 10.5 mm  A fingertip pad seals a hole up to roughly 10-11 mm; past that it cannot
//                   dome enough to close the rim. Applied in EVERY keywork mode - see below.
//   bore   0.70*B   The hole removes an arc of the bore's circumference at its own station:
//                   half-angle theta with sin(theta) = D/B. Capping 2*theta at 90 degrees
//                   leaves three quarters of the tube's hoop section intact to carry bending
//                   load, and sin(45 deg) = 0.707.
//   spacing         minGap = D + 2 mm between hole CENTRES, checked on the settled lattice.
//
// KEYWORK MODE DOES NOT MOVE THE CEILING, deliberately. With keys_all/keys_low the holes are
// closed by pads, so the fingertip limit is not physical there and a keyed instrument could
// carry larger holes. It is still refused, because computeFluteGeometry() is the single source
// of truth the CAD, the 3D scene and the audio model all read: making the ceiling depend on
// keywork mode would mean that toggling a mechanical option retunes the instrument and changes
// what it sounds like, so an A/B of "keys on vs keys off" would stop being an A/B of the
// mechanism. The physical argument is weaker than it looks in any case - a pad seals a large
// hole, but a pad also adds a cavity compliance above the hole that this lattice does not
// model, so "keys let the holes grow for free" is a property of the model, not of the flute.
// The cost of the decision is real and is recorded: keyed instruments carry less venting margin
// than their mechanism would allow.
export const HOLE_DIAM_MIN_MM = 5.0;
export const HOLE_DIAM_FINGER_MAX_MM = 10.5;
export const HOLE_DIAM_BORE_FRACTION_MAX = 0.70;
export const HOLE_DIAM_STEP_MM = 0.5;
// Benade tone-hole lattice cutoff. Below it the open lattice reflects and terminates the bore;
// above it the lattice transmits, the whole tube resonates and the jet has upper modes to lock
// onto. Measured over 850 self-oscillated fingerings spanning 4-16 mm holes and five registers,
// the pipe locks to the intended first mode on 83-88% of fingerings below a cutoff ratio of
// 1.25 and on 96-100% above it, with no further gain past about 2.0 and a slow decline beyond
// 9 mm as the wider holes crowd the spacing. 1.25 is therefore the target, and the search takes
// the SMALLEST diameter that reaches it rather than the largest available.
export const VENT_CUTOFF_RATIO_TARGET = 1.25;
