// OpenSCAD emission for the v2 articulated keywork.
//
// Every number in the emitted program is a literal computed by computeKeyworkLayout(); nothing
// here re-derives geometry, and the SCAD contains no keywork arithmetic of its own. That is what
// keeps the printed part, the 3D overlay and the warnings describing one mechanism.
//
// Every feature except the pad cup is an XY profile extruded along +Z, which has zero overhang
// when the flute prints upright (DESIGN_v2 s.11).

import { solveJointCuts } from '../geometry/flute.js';
import { applyCutPlanes, computeKeyworkLayout, keyworkCutZones, type CutVerdict, type KeyworkKey, type KeyworkLayout } from '../geometry/keywork.js';
import type { FluteGeometry, JointCuts, KeyworkMode, PartKey } from '../types.js';

const f = (v: number): string => v.toFixed(3);
// The body constants generateScadJs() writes - spacing, the three bores, fipple_z - are rounded to
// two places. The clip below is built from the same quantities and has to agree with them to the
// bit, or the shipped solid moves; so it, and only it, is written at the body's precision.
const f2 = (v: number): string => v.toFixed(2);

/** A display-only program for the 3D viewer, rendered from this same source. */
export interface KeyworkDisplayGroup {
  /** Which palette entry the viewer paints the default of this group with. */
  part: PartKey;
  name: string;
  scad: string;
}

export interface KeyworkScad {
  /** Module definitions, emitted at top level before complete_flute(). */
  modules: string;
  /** Call placed inside complete_flute()'s union, before the bore and tone-hole subtractions. */
  fusedCall: string;
  /**
   * Calls placed after those subtractions, for parts a tone-hole drill would otherwise pierce.
   * generateScadJs() unions these under its own air-column clip; missing the bore subtraction is
   * exactly why they need one.
   */
  looseCall: string;
  /** Flat-on-the-bed TPU parts for the separate soft-material STL. */
  tpu: string;
  displayGroups: KeyworkDisplayGroup[];
}

/**
 * The solid a stacked sleeve's web can actually stand on: the highest sleeve BELOW this one that
 * shares its rod axis in X and overlaps it in Z. Same side and same column modulo columnCount is
 * the same armX and the same sign, so that pair is exactly the pair whose cylinders are coaxial in
 * X; the test is written on rodX itself because that is the quantity the web's placement uses.
 *
 * Columns that are not equal never interact: they are one rodPitch = sleeveOd + 1.5 apart, and a
 * web reaches at most webW/2 off its own axis against a sleeve radius of sleeveOd/2, leaving
 * sleeveOd/2 + 1.5 - webW/2 between them. That is smallest at the 4 mm rod floor, where it is
 * 4.85 mm - still far larger than any lap or embed here - and it only grows with the rod.
 *
 * Null means nothing is under this sleeve over its own Z range.
 */
function webSupport(L: KeyworkLayout, k: KeyworkKey): KeyworkKey | null {
  const below = L.keys.filter((j) => j !== k && j.tier < k.tier
    && Math.abs(j.rodX - k.rodX) < 0.01
    && Math.min(j.sleeveZ1, k.sleeveZ1) - Math.max(j.sleeveZ0, k.sleeveZ0) > 0);
  if (below.length === 0) return null;
  return below.reduce((best, j) => (j.tier > best.tier ? j : best), below[0]);
}

function sleeveBody(L: KeyworkLayout, k: KeyworkKey): string {
  const p = L.params;
  const z0 = k.sleeveZ0, z1 = k.sleeveZ1, len = z1 - z0;
  // Where the web stops on its way down. A tier-0 web runs to the bore axis; what a STACKED one
  // does depends on whether anything is under it, and the two cases used to be conflated.
  //
  // The rule was a fixed drop of one tier, k.rodY - (sleeveOd + 2.0), on the assumption that the
  // sleeve one tier down at this rod axis is always there and always spans the same Z. Neither
  // holds. Tier is floor(column / columnCount), so two sleeves sharing a rod axis on different
  // tiers are in different columns, and the column search's disjoint-Z constraint (a) applies only
  // WITHIN a column - it says nothing across tiers. Both halves of the assumption fail on the
  // solver-placed lattice, in opposite directions and with a different defect each:
  //
  //   nothing below   the web stopped in mid-air one tier up, holding a pad rod on a sleeve joined
  //                   to the instrument by nothing at all. 142 sleeves over the 672 keyed
  //                   configurations; hole 3 of 69/major/7/keys_all is one, its web ending at
  //                   y = 19.003 with the facet at y = 12.557 and the only tier-0 sleeve on that
  //                   axis 1.3 mm away in Z.
  //   something below the drop lands on the lower sleeve's AXIS, so the web filled the upper half
  //                   of a journal bore over the whole Z overlap - 76 mm of a 9.36 mm bore blocked
  //                   by a 2.19 mm slab at 60/major/7/keys_all. That rod cannot turn, and on that
  //                   instrument it cannot even be threaded in.
  //
  // So the drop is measured against the supporting sleeve rather than assumed, and it stops in
  // that sleeve's WALL instead of its bore. Landing on the crown exactly is what the fixed drop
  // was avoiding - tangent solids share a surface and do not union - so the web laps `webEmbed`
  // past the crown into the annulus between the relieved bore and the sleeve OD. That annulus is
  // sleeveWall - landRelief thick, at least 0.8 mm at the 4 mm rod floor, and the lap takes half
  // of it and never more than 0.6 mm, so the web's end face is an interior surface of the union
  // and the journal is untouched. The same lens-shaped bite is what a stanchion leg makes on a
  // sleeve it lands on.
  //
  // With nothing below, the web runs to y = 0 - not to the facet. The front "facet" is flat only
  // over the middle of each tube, so in staggered shell mode a web stopping 0.5 mm under the
  // nominal facet height hangs up to 6 mm clear of the sloping hexagon face at these rod offsets.
  // That is the same reason the tier-0 web and the stanchion legs run to the axis, and it makes
  // the two cases one shape: below the shell surface the web is buried in the tube wall, and what
  // it adds inside an air column is removed again by the bore subtraction it is unioned before.
  const support = k.tier === 0 ? null : webSupport(L, k);
  const webEmbed = Math.min(0.6, (L.sleeveWall - p.landRelief) * 0.5);
  const yb = support === null ? 0 : support.rodY + L.sleeveOd / 2 - webEmbed;
  const webW = Math.max(2.0, L.rodOd * 0.35);

  // Reaching y = 0 grounds a web only where the shell HAS a tube at this rod axis. In staggered
  // mode the three tubes carry independent Z ranges, so the region outboard of the melody hex is
  // solid only from the point that side's drone tube starts; a journal landing before it descends
  // its whole height through open air and touches nothing at any Y. Hole 1 of
  // 36/hijaz/6/staggered/keys_all is the case: rod axis x = 38.51, past the melody hex's 33.12 mm
  // half width, over a drone tube that does not begin until z = 888.59, with the journal at
  // z = [849.39, 880.62]. 51 of the 672 keyed configurations carry one, every one of them
  // staggered and tier 0 - so this is not the stacking defect above wearing another costume.
  //
  // The cure is to reach INBOARD as well as down, to the melody tube, which carries the tone holes
  // and so is always under the keyed span. The keel is half the facet height, well clear of the
  // facet plane itself: an exactly coplanar face there is the defect seam_lap exists for. The bore
  // subtraction takes the part inside the air column and leaves the rest buried in the tube wall.
  //
  // Web and keel are emitted as ONE extruded profile rather than two solids, for the reason the
  // pad arm and bridge lug are: both are constant sections over the same Z range, and a prism of
  // (A union B) is the same solid as (prism of A) union (prism of B) - but the union happens in 2D,
  // where it cannot leave the pair of coincident faces the two prisms would share along y = 0.
  //
  // The keel is emitted only where the shell leaves a journal nothing to reach, so a journal that
  // already had a tube under it keeps the plain web it had. A sleeve carried by a lower one needs
  // no keel either: the sleeve below it gets whatever grounding it needs on its own account.
  const needsKeel = support === null && !k.overTube;
  const keelTop = L.frontY * 0.5;
  const web = needsKeel
    ? `                translate([0, 0, ${f(z0)}]) linear_extrude(height=${f(len)}) {
                    translate([${f(k.rodX)}, ${f((yb + k.rodY) / 2)}])
                        square([${f(webW)}, ${f(k.rodY - yb)}], center=true);
                    translate([${f(k.rodX / 2)}, ${f(keelTop / 2)}])
                        square([${f(Math.abs(k.rodX))}, ${f(keelTop)}], center=true);
                }`
    : `                translate([${f(k.rodX)}, ${f((yb + k.rodY) / 2)}, ${f(z0 + len / 2)}])
                    cube([${f(webW)}, ${f(k.rodY - yb)}, ${f(len)}], center=true);`;
  // The bearing land closes the relieved bore back down onto the rod. Its outer wall stops
  // inside the sleeve wall rather than on it, so the union overlaps solid material instead of
  // sharing a surface with it.
  //
  // A land is only ever as long as the journal it sits in. The window a journal gets is each end
  // clamped to the body independently, so on a short instrument BOTH ends can land on the same
  // limit and the journal comes out with no length at all: at 86/hijaz/4 hole 3's window is
  // [160.30, 160.30], where fippleZ - winLen - 2 caps both. The sleeve cylinder is then empty and
  // the web with it, but the lands were still emitted at their full 6 mm, and the placement
  // formula runs BACKWARDS once len drops under landLen + 2 - the second land was put 8 mm below
  // the first, outside a sleeve that did not exist. Two free rings in the body solid, touching
  // nothing, in 22 of the 672 keyed configurations, every one of them at root 86.
  //
  // Shortening the land to the window keeps every land inside its own sleeve: at len >= landLen+2
  // nothing changes at all, and below that the spread term collapses to zero so the lands stack at
  // the near end instead of walking out of the tube. A window too short to hold any land gets
  // none, and a window with no length gets no journal hardware whatsoever. That is not a mechanism
  // this repairs - a rod with no journal is broken, and KW-BEARING already says so in those words.
  // What it stops is the broken mechanism also shedding loose parts into the printed body.
  const landLen = Math.min(p.landLen, len - 2);
  const landOd = Math.min(L.sleeveOd - 0.4, L.sleeveId + 2 * p.landRelief + 0.4);
  const nLand = Math.max(2, Math.floor(len / p.landPitch) + 1);
  const lands: string[] = [];
  for (let i = 0; landLen > 0 && i < nLand; i++) {
    const lz = z0 + 1 + i * (len - 2 - landLen) / Math.max(1, nLand - 1);
    lands.push(`        difference() {
            translate([${f(k.rodX)}, ${f(k.rodY)}, ${f(lz)}]) cylinder(d=${f(landOd)}, h=${f(landLen)}, $fn=40);
            translate([${f(k.rodX)}, ${f(k.rodY)}, ${f(lz - 1)}]) cylinder(d=${f(L.sleeveId)}, h=${f(landLen + 2)}, $fn=40);
        }`);
  }
  if (len <= 0) {
    return `        // journal sleeve for hole ${k.holeIndex}: window clipped to no length at all`
      + ` (see KW-BEARING), so this rod gets no journal rather than a set of loose bearing rings`;
  }
  return `        // journal sleeve for hole ${k.holeIndex}, ${f(len)} mm${k.inlineJournal ? '' : ' (far-side journal: the rod is too short for an inline one)'}
        difference() {
            union() {
                translate([${f(k.rodX)}, ${f(k.rodY)}, ${f(z0)}]) cylinder(d=${f(L.sleeveOd)}, h=${f(len)}, $fn=40);
${web}
            }
            translate([${f(k.rodX)}, ${f(k.rodY)}, ${f(z0 - 1)}])
                cylinder(d=${f(L.sleeveId + 2 * p.landRelief)}, h=${f(len + 2)}, $fn=40);
        }
${lands.join('\n')}`;
}

function stanchion(L: KeyworkLayout, i: number): string {
  const p = L.params;
  const z = L.postZ[i];
  // Stanchion i carries the leaf that springs key i; the last one carries none.
  const key = i < L.keys.length ? L.keys[i] : null;
  const railX = key ? -key.side * key.ledgeRadius : 0;
  const rail = key
    ? `                    translate([${f(railX)}, ${f(L.yBeam1 + p.dovetail / 2)}])
                        square([${f(p.leafW + 5)}, ${f(p.dovetail + 0.02)}], center=true);\n`
    : '';
  const dovetailCut = key
    ? `            translate([${f(railX)}, ${f(L.yBeam1 + p.dovetail / 2)}, ${f(z)}])
                linear_extrude(height=${f(p.postT + 6)}, center=true)
                    polygon([[${f(-p.leafW / 2 + 0.4)}, ${f(p.dovetail / 2)}], [${f(-p.leafW / 2 - 1.2)}, ${f(-p.dovetail / 2)}],
                             [${f(p.leafW / 2 + 1.2)}, ${f(-p.dovetail / 2)}], [${f(p.leafW / 2 - 0.4)}, ${f(p.dovetail / 2)}]]);\n`
    : '';
  // A leg flank is a vertical plane x = legX -/+ legW/2, and the legs stand over the drone tubes,
  // so both flanks cut through a drone bore. The bore is a 24-gon, and legX - legW/2 is built out
  // of the same round numbers the bore is (a C4 flute lands the flank on spacing - bore/4 to the
  // last bit), so a flank plane can contain a bore-polygon vertex EDGE for the whole length of the
  // tube. That is the coincident-surface case again, and it is the worst form of it: the resolver
  // splits that one edge at every stanchion plane and leaves a nanometre-wide crack at each, ten
  // bad edges from three stanchions. Crossing the bore wall is fine; landing exactly on one of its
  // vertices is not. The flanks are free surfaces - nothing mates to them and legX still keeps the
  // leg inside faceHalfW - so each one laps 0.03 mm past nominal, far above the resolver's
  // tolerance and far below any dimension that matters.
  const legLap = 0.06;
  // The legs run all the way down to y = 0, the bore axis, for the same reason the tier-0 sleeve
  // web does: the front "facet" is flat only over the middle of each tube, so in staggered shell
  // mode a leg that stopped at the nominal facet height would hang up to 6 mm clear of the
  // sloping hexagon face at x = +/-legX. What is below the shell surface is buried in the tube
  // wall - except for the part inside the air column, which generateScadJs() cuts back out. The
  // legs stand over the drone tubes, so without that cut each flank fills a slab of a drone bore.
  return `        // spindle stanchion ${i}
        difference() {
            translate([0, 0, ${f(z - p.postT / 2)}]) linear_extrude(height=${f(p.postT)}) difference() {
                union() {
                    for (sx = [-1, 1])
                        translate([sx * ${f(L.legX)}, ${f((L.yHub + 3) / 2)}])
                            square([${f(p.legW + legLap)}, ${f(L.yHub + 3)}], center=true);
                    translate([0, ${f((L.yBeam0 + L.yBeam1) / 2)}])
                        square([${f(2 * L.legX + p.legW)}, ${f(L.yBeam1 - L.yBeam0)}], center=true);
${rail}                }
                translate([0, ${f(L.yHub)}]) circle(d=${f(L.spindleOd + 2 * p.sleeveTol)}, $fn=32);
            }
${dovetailCut}        }`;
}

function rodAssembly(L: KeyworkLayout, k: KeyworkKey): string {
  const p = L.params;
  const cupBackY = L.cupY0 + L.cupH;
  const barY = L.yContact + p.barLift + p.barT / 2;
  // The arm and lug bosses are deliberately NOT the same diameter as the retention collars. A
  // collar whose Z range reaches into the lug shares a cylindrical surface with the boss when
  // the two diameters agree, and a union across a shared surface is not a manifold: that pairing
  // put ten bad edges into a piccolo before the diameters were separated.
  // Three coaxial bosses on one rod, and no two of them may share a radius: the pad arm and the
  // lug overlap in Z whenever a bridge station lands on its own hole, and a retention collar
  // reaches into the lug on a short rod. Equal radii there put nine to twelve bad edges into the
  // mesh; separating them is what makes a keyed body watertight.
  const collarD = L.rodOd + 3.0;
  const bossD = L.rodOd + 3.6;
  const lugBossD = L.rodOd + 4.2;
  // The pad arm and the bridge lug are both prisms standing on the rod axis. Whenever a bridge
  // station lands on the key's own hole, bridgeZ equals holeZ and - since armZ and bridgeT are
  // both 6 mm - the two prisms occupy exactly the same Z range. Unioning them then joins two
  // solids across a pair of exactly coincident end planes, which is the same defect the collar
  // and boss diameters above are separated to avoid: the resolver builds the shared plane twice
  // and leaves a pair of vertices a nanometre apart, so the rod's outer and bore surfaces carry a
  // hairline crack and zero-area slivers instead of one closed skin. Four bad edges per key.
  // Emitting one extrusion of the combined profile removes the union without moving a single
  // number: a prism of (A union B) is the same solid as (prism of A) union (prism of B). The test
  // is on the ROUNDED text because that is what OpenSCAD reads.
  const armZ0 = f(k.holeZ - p.armZ / 2), armH = f(p.armZ);
  const lugZ0 = f(k.bridgeZ - p.bridgeT / 2), lugH = f(p.bridgeT);
  const armProfile = `            hull() {
                translate([${f(k.rodX)}, ${f(k.rodY)}]) circle(d=${f(bossD)}, $fn=24);
                translate([0, ${f(cupBackY - 1.2)}]) circle(d=${f(L.cupD * 0.55)}, $fn=24);
            }`;
  const lugProfile = `            hull() {
                translate([${f(k.rodX)}, ${f(k.rodY)}]) circle(d=${f(lugBossD)}, $fn=24);
                translate([${f(k.rodX)}, ${f(barY)}]) circle(d=${f(lugBossD)}, $fn=24);
            }
            translate([${f((k.rodX + k.side * k.footArm) / 2)}, ${f(barY)}])
                square([${f(Math.abs(k.armX - k.footArm))}, ${f(p.barT)}], center=true);
            translate([${f(k.side * k.footArm)}, ${f(L.yContact + p.contactW / 2)}])
                circle(d=${f(p.contactW)}, $fn=28);`;
  const cup = `        translate([0, ${f(L.cupY0)}, ${f(k.holeZ)}]) rotate([-90, 0, 0]) rotate([0, 0, 30]) difference() {
            cylinder(d=${f(L.cupD * 1.22)}, h=${f(L.cupH)}, $fn=${p.cupFacets});
            translate([0, 0, -0.010]) cylinder(d=${f(L.cupD - 2.4)}, h=1.600, $fn=32);
        }`;
  const armAndLug = armZ0 === lugZ0 && armH === lugH
    ? `        // pad arm and bridge lug share this station's Z range: one prism, not a union of two
        translate([0, 0, ${armZ0}]) linear_extrude(height=${armH}) {
${armProfile}
${lugProfile}
        }
${cup}`
    : `        translate([0, 0, ${armZ0}]) linear_extrude(height=${armH})
${armProfile}
${cup}
        translate([0, 0, ${lugZ0}]) linear_extrude(height=${lugH}) {
${lugProfile}
        }`;
  return `        // pad rod for hole ${k.holeIndex}: hollow tube, pad arm, cup, bridge lug${k.crossedByCut ? ' (a cut plane crosses it: print separately and thread it down the assembled sleeve)' : ''}
        difference() {
            translate([${f(k.rodX)}, ${f(k.rodY)}, ${f(k.rodZ0)}]) cylinder(d=${f(L.rodOd)}, h=${f(k.rodZ1 - k.rodZ0)}, $fn=28);
            translate([${f(k.rodX)}, ${f(k.rodY)}, ${f(k.rodZ0 - 1)}]) cylinder(d=${f(L.rodId)}, h=${f(k.rodZ1 - k.rodZ0 + 2)}, $fn=28);
        }
        translate([${f(k.rodX)}, ${f(k.rodY)}, ${f(k.sleeveZ0 - 3.2)}]) cylinder(d=${f(collarD)}, h=2.400, $fn=28);
        translate([${f(k.rodX)}, ${f(k.rodY)}, ${f(k.sleeveZ1 + 0.8)}]) cylinder(d=${f(collarD)}, h=2.400, $fn=28);
${armAndLug}`;
}

function touchKey(L: KeyworkLayout, k: KeyworkKey): string {
  const p = L.params;
  const hubLen = L.buttonPitch - p.postT - 1.2;
  const footTop = L.yContact + p.bridgePre - p.regT;
  const plateLen = L.buttonPitch - 5;
  // The bore is cut from the WHOLE key, not only from the hinge tube. The foot and the plate arm
  // both start as solid discs on the hub axis, so subtracting it last is what keeps the spindle
  // free to turn; cutting only the tube leaves the bore plugged over the foot's 6 mm and fuses
  // the key to the spindle it is supposed to pivot on.
  return `        // touch key for hole ${k.holeIndex}: hinge tube, bridge foot, plate arm, spring ledge
        difference() {
            union() {
                translate([0, ${f(L.yHub)}, ${f(k.bridgeZ - hubLen / 2)}]) cylinder(d=${f(L.hubOd)}, h=${f(hubLen)}, $fn=32);
                translate([0, 0, ${f(k.bridgeZ - p.bridgeT / 2)}]) linear_extrude(height=${f(p.bridgeT)})
                    hull() {
                        translate([0, ${f(L.yHub)}]) circle(d=${f(L.hubOd)}, $fn=32);
                        translate([${f(k.side * (k.footArm - p.contactW / 2))}, ${f(footTop - p.footT / 2)}]) circle(d=${f(p.footT)}, $fn=20);
                        translate([${f(k.side * (k.footArm + p.contactW / 2))}, ${f(footTop - p.footT / 2)}]) circle(d=${f(p.footT)}, $fn=20);
                    }
                translate([0, 0, ${f(k.bridgeZ - plateLen / 2)}]) linear_extrude(height=${f(plateLen)}) {
                    hull() {
                        translate([0, ${f(L.yHub)}]) circle(d=${f(L.hubOd * 0.85)}, $fn=32);
                        translate([${f(-k.side * p.touchArm)}, ${f(L.yContact + p.plateUp - p.plateT)}]) circle(d=4, $fn=20);
                    }
                    translate([${f(-k.side * p.touchArm)}, ${f(L.yContact + p.plateUp - p.plateT / 2)}])
                        square([${f(p.plateW)}, ${f(p.plateT)}], center=true);
                    translate([${f(-k.side * k.ledgeRadius)}, ${f(L.yLedge + 1.5)}])
                        square([${f(p.contactW + 2)}, 3.000], center=true);
                }
            }
            translate([0, ${f(L.yHub)}, ${f(k.bridgeZ - plateLen / 2 - 1)}])
                cylinder(d=${f(L.hubId)}, h=${f(plateLen + 2)}, $fn=32);
        }`;
}

function tpuInPlace(L: KeyworkLayout, k: KeyworkKey): string {
  const p = L.params;
  const footTop = L.yContact + p.bridgePre - p.regT;
  const leafT = k.leafThickness;
  const railX = -k.side * k.ledgeRadius;
  const postZ = L.postZ[k.slot];
  return `        // TPU for hole ${k.holeIndex}: pad disc, regulation bumper, leaf spring
        translate([0, ${f(L.cupY0 + 1.6 - p.padT)}, ${f(k.holeZ)}]) rotate([-90, 0, 0])
            cylinder(d=${f(L.cupD - 2.4 - 0.2)}, h=${f(p.padT)}, $fn=32);
        translate([${f(k.side * k.footArm)}, ${f(footTop + p.regT / 2)}, ${f(k.bridgeZ)}])
            cube([${f(p.contactW + 2)}, ${f(p.regT)}, ${f(p.bridgeT + 1.0)}], center=true);
        translate([${f(railX)}, ${f(L.yBeam1 + p.dovetail / 2)}, ${f(postZ)}])
            linear_extrude(height=${f(p.postT + 4)}, center=true)
                polygon([[${f(-p.leafW / 2 + 0.5)}, ${f(p.dovetail / 2)}], [${f(-p.leafW / 2 - 0.9)}, ${f(-p.dovetail / 2)}],
                         [${f(p.leafW / 2 + 0.9)}, ${f(-p.dovetail / 2)}], [${f(p.leafW / 2 - 0.5)}, ${f(p.dovetail / 2)}]]);
        hull() {
            translate([${f(railX)}, ${f(L.yBeam1 + p.dovetail / 2 - leafT / 2 + 1.0)}, ${f(postZ + p.postT / 2)}])
                cube([${f(p.leafW)}, ${f(leafT)}, 2.000], center=true);
            translate([${f(railX)}, ${f(L.yLedge - leafT / 2)}, ${f(k.bridgeZ)}])
                cube([${f(p.leafW)}, ${f(leafT)}, 3.000], center=true);
        }`;
}

/**
 * The soft parts, laid flat on the bed for their own STL: one pad disc per key, and the two
 * ladders DESIGN_v2 s.2.2 and s.7 call for - three bumper heights covering +/-0.3 mm of build
 * error at the bridge, and three leaf thicknesses spanning 0.6x-1.7x nominal force.
 */
function tpuFlat(L: KeyworkLayout): string {
  const p = L.params;
  const out: string[] = [];
  const pitch = Math.max(L.cupD + 4, p.leafW + 6, p.contactW + 8);
  const leafLen = Math.max(p.leafLmin, L.buttonPitch / 2) + p.postT / 2;
  L.keys.forEach((k, i) => {
    const x = i * pitch;
    out.push(`    // pad disc, hole ${k.holeIndex}
    translate([${f(x)}, 0, 0]) cylinder(d=${f(L.cupD - 2.4 - 0.2)}, h=${f(p.padT)}, $fn=32);`);
    [0.8, 1.0, 1.2].forEach((s, j) => {
      out.push(`    // regulation bumper, hole ${k.holeIndex}, ${f(p.regT * s)} mm shim
    translate([${f(x)}, ${f(pitch * (1 + j * 0.6))}, 0])
        cube([${f(p.contactW + 2)}, ${f(p.bridgeT + 1.0)}, ${f(p.regT * s)}], center=false);`);
    });
    [0.85, 1.0, 1.2].forEach((s, j) => {
      out.push(`    // leaf spring, hole ${k.holeIndex}, ${f(k.leafThickness * s)} mm tuning rung
    translate([${f(x)}, ${f(pitch * (3 + j * 0.9))}, 0]) {
        cube([${f(p.leafW)}, ${f(leafLen)}, ${f(k.leafThickness * s)}], center=false);
        translate([${f(-1.2)}, 0, 0]) cube([${f(p.leafW + 2.4)}, ${f(p.postT + 4)}, ${f(p.dovetail)}], center=false);
    }`);
    });
  });
  return out.join('\n');
}

function echoLines(L: KeyworkLayout): string {
  const lines: string[] = [];
  const list = (v: number[]): string => `[${v.join(', ')}]`;
  lines.push(`echo("== KEYWORK mode=${L.mode} keys=${list(L.keys.map((k) => k.holeIndex))}`
    + ` rod_od=${f(L.rodOd)} sleeve_od=${f(L.sleeveOd)} kw_sleeve_tol=${L.params.sleeveTol}`
    + ` pitch=${f(L.buttonPitch)} cluster=[${f(L.clusterLoZ)}, ${f(L.clusterHiZ)}] standoff=${f(L.standOff)}");`);
  for (const w of L.warnings) {
    lines.push(`echo("!! WARN ${w.code}: ${w.message.replace(/"/g, "'")}");`);
  }
  if (L.warnings.length === 0) lines.push('echo("== KEYWORK WARN none");');
  return lines.join('\n');
}

/** What a rendered solid turned out to be, and how the viewer should paint and move it. */
export interface KeyworkPartRole {
  part: PartKey;
  /** Present only on the parts that rotate. Both are in the SCAD frame the STL is already in. */
  pivot?: { x: number; y: number };
  /** Rotation about +Z at the pivot when the key is fully pressed, radians. */
  openAngle?: number;
  /** The hole whose fingering drives it. */
  holeIndex?: number;
}

const RAD = Math.PI / 180;

/**
 * Identifies one solid out of the keywork display render. The rules read the layout's own
 * numbers rather than the emitter's text, so the worst a misjudgement can do is paint a part the
 * wrong colour: position comes from the STL, which is already in the body's coordinate frame.
 */
export function classifyKeyworkPart(L: KeyworkLayout, min: readonly number[], max: readonly number[]): KeyworkPartRole {
  const span = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const centreZ = (min[2] + max[2]) / 2;
  const nearest = <T>(items: T[], cost: (t: T) => number): T =>
    items.reduce((best, t) => (cost(t) < cost(best) ? t : best), items[0]);

  // The spindle is the only part that is thin in both X and Y and long in Z.
  if (span[0] < L.spindleOd * 1.6 && span[1] < L.spindleOd * 1.6) return { part: 'axlePin' };

  // Anything reaching down to the front facet is stationary hardware. A stanchion is one post
  // thick in Z and reaches out to both legs; a journal sleeve is long in Z and on one side only.
  if (min[1] <= L.frontY + 0.5) {
    if (span[2] <= L.params.postT * 2 && span[0] > L.legX) return { part: 'hingeBoss' };
    return { part: 'hingeStanch' };
  }

  // Above the hub and never reaching the chimney: a touch key.
  if (min[1] > L.yHub - L.hubOd) {
    const k = nearest(L.keys, (q) => Math.abs(q.bridgeZ - centreZ));
    return { part: 'touchPad', pivot: { x: 0, y: L.yHub }, openAngle: k.side * k.betaDeg * RAD, holeIndex: k.holeIndex };
  }

  // Everything left carries a pad cup, which is what reaches down to the chimney.
  const outerX = Math.abs(min[0]) > Math.abs(max[0]) ? min[0] : max[0];
  const k = nearest(L.keys, (q) => Math.abs(q.rodX - outerX) + 0.05 * Math.abs((q.rodZ0 + q.rodZ1) / 2 - centreZ));
  return { part: 'keyCup', pivot: { x: k.rodX, y: k.rodY }, openAngle: -k.side * k.alphaDeg * RAD, holeIndex: k.holeIndex };
}

export interface KeyworkBuild {
  layout: KeyworkLayout | null;
  cuts: JointCuts;
  verdict: CutVerdict;
  scad: KeyworkScad;
}

/**
 * The whole keywork pipeline in the one order it can run: lay the mechanism out, hand its
 * exclusion zones to the cut search, feed the resulting planes back so a rod knows whether it
 * can print in place, then emit. generateScadJs() and the studio's 3D scene both call this, so
 * the preview cannot show a mechanism the exported program does not contain.
 */
export function buildKeywork(geom: FluteGeometry, mode: KeyworkMode, numSegments: number, jointLen: number): KeyworkBuild {
  const layout = computeKeyworkLayout(geom, mode);
  const solved = solveJointCuts(geom, numSegments, jointLen, layout ? keyworkCutZones(layout) : []);
  if (layout) applyCutPlanes(layout, solved.verdict);
  return { layout, cuts: solved.cuts, verdict: solved.verdict, scad: generateKeyworkScad(layout) };
}

export function generateKeyworkScad(layout: KeyworkLayout | null): KeyworkScad {
  if (!layout || layout.keys.length === 0) {
    return { modules: '', fusedCall: '', looseCall: '', tpu: '', displayGroups: [] };
  }
  const L = layout;
  const sleeves = L.keys.map((k) => sleeveBody(L, k)).join('\n');
  const stanchions = L.postZ.map((_, i) => stanchion(L, i)).join('\n');
  const spindle = `        translate([0, ${f(L.yHub)}, ${f(L.spindleZ0)}])
            cylinder(d=${f(L.spindleOd)}, h=${f(L.spindleZ1 - L.spindleZ0)}, $fn=28);`;
  const rods = L.keys.map((k) => rodAssembly(L, k)).join('\n');
  const touchKeys = L.keys.map((k) => touchKey(L, k)).join('\n');
  const tpuParts = L.keys.map((k) => tpuInPlace(L, k)).join('\n');

  const modules = `

// ====================================================================
// Articulated keywork v2 (scratch/keywork/DESIGN_v2.md)
// One hollow pad rod per keyed hole turning in its own journal sleeve; touch keys on one
// stationary spindle drive them through a push-only sax bridge. Normally closed, press to open.
// Every profile below is extruded along +Z: zero overhang with the flute printed upright.
// ====================================================================
${echoLines(L)}

// Radial clearance between a bore and the air-column clip generateScadJs() applies to the loose
// keywork. See the boreClip comment in scad.ts for why the clip is grown rather than exact.
kw_bore_clear = 0.4;

// The air-column clip itself, defined ONCE and called by everything that needs it: the shipped
// program's cut on the loose keywork, and both display programs.
//
// It used to be written out inside generateScadJs() alone, which left the 3D preview with no clip
// at all - the display programs are standalone, with no body around them and so no bore
// subtraction to inherit. The stanchion legs and the sleeve webs run to the bore axis by design,
// so the preview drew them as solid slabs standing in the air columns: 3,500 mm^3 at
// 69/hijaz/6/keys_all and 16,988 mm^3 at 36/natural_minor/7/keys_all. At low body transparency
// they are visible, as coloured blocks inside the bore - measured at 114 to 1083 pixels of a
// 940x700 viewport across six viewpoints, against a camera-drift control of exactly 0.
//
// One definition rather than two is the point. A second copy of this cut, kept in step by hand, is
// the shape of drift this file's header already warns about.
module keywork_bore_clip() {
    for (pipe = [${layout.airColumns.map((c) => `[${f2(c.x)}, ${f2(c.bore)}]`).join(', ')}])
        translate([pipe[0], 0, -2])
            cylinder(d=pipe[1] + 2*kw_bore_clear, h=${f2(layout.airColumnTopZ)} + 2, $fn=24);
}

module keywork_sleeves() {
${sleeves}
}

module keywork_stanchions() {
${stanchions}
${spindle}
}

module keywork_rods() {
${rods}
}

module keywork_touch_keys() {
${touchKeys}
}

// Soft parts, shown in place. They print separately in TPU and are NOT part of the body solid.
module keywork_tpu() {
${tpuParts}
}

module keywork_moving() {
    keywork_rods();
    keywork_touch_keys();
}
`;

  const displayPreamble = `// Keywork display render, generated from the same source as the printed part.\n$fn = 24;\n${modules}\n`;
  // The SLEEVES are clipped here as well, though the shipped program cuts them with the body's own
  // bore rather than with this clip. In the printed part they are unioned before that subtraction
  // and their webs - which run to the bore axis, and on an ungrounded journal reach inboard as far
  // as the melody tube - are cut by it. The display program has no body and so no subtraction, and
  // without this they stand in the air column exactly as the stanchion legs did. The clip is 0.4 mm
  // wider in the radius than the bore, so the preview trims a hair more off a web than the printed
  // part does; that is well under a pixel at any framing and it keeps the trimmed face off the
  // body's bore wall, where it would z-fight.
  const displayGroups: KeyworkDisplayGroup[] = [
    // One render for every rigid part: sleeves, stanchions and spindle are stationary, rods and
    // touch keys move. They are all disjoint solids at rest, so the viewer separates them into
    // per-part meshes by connected component rather than paying for a render each.
    { part: 'hingeStanch', name: 'rigid', scad: displayPreamble + 'difference() {\n    union() {\n        keywork_sleeves();\n        keywork_stanchions();\n        keywork_moving();\n    }\n    keywork_bore_clip();\n}\n' },
    { part: 'padGasket', name: 'tpu', scad: displayPreamble + 'keywork_tpu();\n' }
  ];

  return {
    modules,
    fusedCall: '        keywork_sleeves();',
    looseCall: '            keywork_stanchions();\n            keywork_moving();',
    tpu: tpuFlat(L),
    displayGroups
  };
}
