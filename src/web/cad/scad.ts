import { computeFluteGeometry } from '../geometry/flute.js';
import { buildKeywork, type KeyworkDisplayGroup } from './keywork-scad.js';
import type { PrintPart, TubeShellMode, KeyworkMode, PadMaterial } from '../types.js';

// The OpenSCAD generator. Authoritative for every output: 3D preview, STL renders, and both
// the .SCAD and ZIP downloads.
export let lastTpuGasketsScad = '';

// The donuts stay fused into complete_flute() so an exported STL is still one printable solid. This
// holds the same chimney source as a standalone program, rendered a second time purely so the viewer
// can give the donuts their own material. The geometry is identical because the source is identical.
export let lastChimneyDisplayScad = '';

// The keywork, as display-only programs generated from the same modules the printed part uses.
// The viewer renders these and parents them to the body mesh with an identity transform; a
// hand-derived placement is what misaligned the last two attempts at this overlay.
export let lastKeyworkDisplayGroups: KeyworkDisplayGroup[] = [];

// Why the emitted program carries a `seam_lap` constant, and why every solid under the mouthpiece
// is written to run past fipple_z + win_len rather than stopping on it.
//
// The mouthpiece beak used to be unioned onto the body across an exactly coplanar interface at
// that plane. Four solids ended there - the three staggered tubes and the webbing extrude, or the
// unified body - and the beak's lower generator began there. The coplanar patches did not cancel.
// Every non-manifold edge ever measured on this model lay in that one plane, and each was carried
// by four faces instead of two: one duplicated patch per solid that landed on the plane exactly.
//
// It looked register-specific, and that was the misleading part. The plane is written four
// independent ways - `fipple_z + win_len`, `fipple_z - L - 8` plus `L + win_len + 8` for each
// tube, and a pair of JS-rounded literals for the webbing - and each is rounded to two decimals
// before it reaches OpenSCAD. Whether the four agree to the last bit is decided by the magnitudes,
// i.e. by the register. At roots 69 and 72 the melody tube came out one ULP high and the interface
// was already a hairline overlap; at root 60 all four agreed exactly and every one of the 28
// configurations was non-manifold. That is a structural defect wearing a register-shaped costume,
// which is why widening the expected counts would have been the wrong fix.
//
// Running the body PAST the plane is a no-op on the point set: the beak's first millimetre is a
// constant hex_profile_2d prism, the same section the body already has immediately below it, and
// only the generator's TOP face at fipple_z + win_len + 1 shapes the taper. Measured across 504
// configurations, the enclosed volume is unchanged to double-rounding and the bounding box is
// unchanged exactly; only the triangulation moves.
//
// Lapping the other way - dropping the BEAK down into the body - was measured and does NOT work.
// It plants the beak's bottom rim part-way along the body's vertical hull-vertex edges, and at the
// larger registers the hull re-derives that rim a few microns off the edge it is meant to sit on,
// leaving a T-junction: 17 of the 28 root-50 configurations went non-manifold that way. The lap
// must also stay clear of the windway cutter's own lower face at fipple_z + win_len - 0.2.
export function generateScadJs(rootMidi: number, scaleKey: string, numHoles: number, profile: string, chimneyDepth = 2.8, rimThickness = 3.3, numSegments = 1, printPart: PrintPart | string = 'assembled', jointTol = 0.18, jointLen = 14.0, drone1Interval = 0, drone2Interval = 7, tubeShellMode: TubeShellMode | string = 'staggered', keyworkMode: KeyworkMode | string = 'none', padMaterial: PadMaterial | string = 'tpu'): string {
  const geom = computeFluteGeometry(rootMidi, scaleKey, numHoles, drone1Interval, drone2Interval, chimneyDepth, rimThickness);
  // The geometry may have dropped duplicate-pitch holes. Keywork posts, gaskets and rod
  // sockets are laid out per hole, so they follow the drilled count, not the requested one.
  numHoles = geom.numHoles;

  const boreM = geom.melody.bore, boreD1 = geom.drone1.bore, boreD2 = geom.drone2.bore;
  const lMel = geom.melody.acousticLength, lD1 = geom.drone1.acousticLength, lD2 = geom.drone2.acousticLength;
  const wall = geom.wall;
  const outerD = geom.outerDiameter;
  const spacing = geom.tubeSpacing;
  const holeDiam = geom.holeDiameter;
  const totalCadLen = geom.totalLength;
  const fippleZ = geom.fippleZ;
  const winLen = geom.windowLength;

  // Full Socket Joint Exclusion Zone, the keywork's own exclusion zones, and the cut planes that
  // fall out of both, are solved by the one function computeSmartJointCuts() also calls.
  const kw = buildKeywork(geom, keyworkMode as KeyworkMode, numSegments, jointLen);
  const zCut1 = kw.cuts.zCut1, zCut2 = kw.cuts.zCut2, zCut3 = kw.cuts.zCut3;

    lastKeyworkDisplayGroups = kw.scad.displayGroups;
    // The soft parts print separately, so the STL exporter needs them outside this template.
    lastTpuGasketsScad = kw.scad.tpu;

    let chimneysScad = [];
  let holesScad = [];

  for (const hole of geom.melody.holes) {
    const absZ = hole.z;

    const outerRim = holeDiam + rimThickness * 2;
    const baseFlange = outerRim + chimneyDepth * 2;

    chimneysScad.push(`        // Solid self-supporting donut chimney pad embedded 0.5mm into the front wall face
        translate([0, ${(outerD * 0.433 - 0.5).toFixed(2)}, ${absZ.toFixed(2)}]) rotate([-90, 0, 0]) {
            hull() {
                cylinder(d=${baseFlange.toFixed(2)}, h=0.5, $fn=24);
                translate([0, 0, ${(chimneyDepth - 0.8 + 0.5).toFixed(2)}]) cylinder(d=${outerRim.toFixed(2)}, h=0.8, $fn=24);
            }
            translate([0, 0, ${(chimneyDepth + 0.5).toFixed(2)}]) rotate_extrude($fn=24) translate([${((holeDiam + rimThickness)/2).toFixed(2)}, 0]) circle(d=${(rimThickness * 0.8).toFixed(2)}, $fn=16);
        }`);

    holesScad.push(`        translate([0, 0, ${absZ.toFixed(2)}]) rotate([-90, 0, 0]) cylinder(d=${holeDiam.toFixed(2)}, h=${(outerD + chimneyDepth * 2 + 5).toFixed(2)}, center=false, $fn=24);`);
  }

  const chimneysStr = chimneysScad.join('\n');
  const holesStr = holesScad.join('\n');

  // The air-column clip on the loose keywork.
  //
  // The stanchions and the moving keywork are unioned AFTER the bore subtraction, because a
  // tone-hole drill run through the union would pierce the stanchion beam - that is why they are
  // loose in the first place. It also leaves them free to stand inside an air column, and the
  // stanchion legs did: they run down to the bore axis (see the leg comment in keywork-scad.ts)
  // and they stand over the drone tubes, so each leg flank filled a slab of the upper half of a
  // drone bore at every stanchion. Measured across the full 1008-configuration product of root x
  // scale x holes x shell mode x keywork mode, 610 configurations carried obstruction, the worst
  // of them 2603 mm^3. That is a real blockage in the printed instrument, and every tuning number
  // this generator ships is solved for an open bore.
  //
  // What is cut is not the bore but the bore GROWN by kw_bore_clear on the radius. A cut placed
  // exactly on the bore surface would leave the leg's new end face coincident with the body's own
  // bore face, which is the defect that seam_lap, the three separated boss diameters and the
  // stanchion leg lap all exist to avoid. Grown, the face lands inside the tube wall, where it is
  // an interior surface of the union and dissolves. Bore and clip are both 24-gons on the same
  // angles, so the clip strictly contains the bore: the clip's apothem exceeds the bore's
  // circumradius by 0.4*cos(7.5) - r*(1-cos(7.5)) mm, which stays above 0.39 mm for every bore
  // this generator produces (the largest is under 25 mm across).
  //
  // The legs still reach exactly as far down as they did. The only material removed stood in an
  // air column, where by definition it touched nothing, so nothing here can begin to float that
  // was not floating already. The journal sleeves need no clip: they are in the FUSED call and
  // the bore subtraction already cuts their webs.
  //
  // The cut itself is keywork_bore_clip(), emitted by keywork-scad.ts from the air columns the
  // layout carries, because the 3D preview needs the same cut and its display programs stand alone
  // with no body and no bore subtraction around them. One definition, two callers.
  //
  // Emitted only when there is keywork, so an unkeyed program is unchanged to the byte.
  const boreClip = kw.scad.looseCall === '' ? '' : `

    // Keywork that a tone-hole drill would otherwise pass straight through, clipped back out of
    // every air column because it missed the bore subtraction above.
    difference() {
        union() {
${kw.scad.looseCall}
        }
        keywork_bore_clip();
    }`;

  lastChimneyDisplayScad = numHoles > 0
    ? `// Tone-hole chimney donuts, display-only render\n$fn = 24;\ndifference() {\n    union() {\n${chimneysStr}\n    }\n${holesStr}\n}\n`
    : '';

  return `// Parametric Triple Drone Flute (1:1 OpenSCAD Native Model)
$fn = 24;

wall = 4.0;
spacing = ${spacing.toFixed(2)};
bore_melody = ${boreM.toFixed(2)};
bore_drone1 = ${boreD1.toFixed(2)};
bore_drone2 = ${boreD2.toFixed(2)};
outer_d = ${outerD.toFixed(2)};

L_melody = ${lMel.toFixed(2)};
L_drone1 = ${lD1.toFixed(2)};
L_drone2 = ${lD2.toFixed(2)};

head_len = ${geom.headLength.toFixed(2)};
win_len = ${winLen.toFixed(2)};
total_L = ${totalCadLen.toFixed(2)};
fipple_z = ${fippleZ.toFixed(2)};
tip_spacing = 10.5;
tip_d = 12.0;
w_h = 1.35;

// How far every solid below the mouthpiece runs PAST fipple_z + win_len, into the beak, so that
// the beak is not unioned onto the body across an exactly coplanar face. Geometrically a no-op.
seam_lap = 0.2;

module hex_profile_2d() {
    hull() {
        translate([-spacing, 0]) circle(d=outer_d, $fn=6);
        translate([spacing, 0]) circle(d=outer_d, $fn=6);
        square([spacing*1.5, outer_d * 0.866], center=true);
    }
}

windway_profile = "${profile}";
tube_shell_mode = "${tubeShellMode}";

module single_windway(w, h, x_start, x_end) {
    entry_h = (windway_profile == "venturi") ? h * 1.6 : h;
    hull() {
        translate([x_start - w/2, bore_melody/2 - h, fipple_z + win_len - 0.2])
            cube([w, h, 1]);
        translate([x_end - w/2, -entry_h/2, total_L - 0.1])
            cube([w, entry_h, 1.2]);
    }
}

module slow_air_chamber() {
    if (windway_profile == "sac") {
        hull() {
            translate([-tip_spacing * 0.8, 0, fipple_z + win_len + 8])
                cylinder(d=5.5, h=1, center=true, $fn=16);
            translate([tip_spacing * 0.8, 0, fipple_z + win_len + 8])
                cylinder(d=5.5, h=1, center=true, $fn=16);
            translate([-tip_spacing * 0.8, 0, total_L - 8])
                cylinder(d=7.0, h=1, center=true, $fn=16);
            translate([tip_spacing * 0.8, 0, total_L - 8])
                cylinder(d=7.0, h=1, center=true, $fn=16);
        }
    }
}

module converging_windways() {
    w_wm = bore_melody * 0.45;
    w_w1 = bore_drone1 * 0.45;
    w_w2 = bore_drone2 * 0.45;

    single_windway(w_wm, w_h, 0, 0);
    single_windway(w_w1, w_h * 0.78, -spacing, -tip_spacing);
    single_windway(w_w2, w_h * 0.78, spacing, tip_spacing);
    slow_air_chamber();
}${kw.scad.modules}

module complete_flute() {
    difference() {
        union() {
            // Independent Acoustic Tube Lengths (Staggered or Unified)
            if (tube_shell_mode == "staggered") {
                // Drone 1 Tube (Left)
                translate([-spacing, 0, fipple_z - L_drone1 - 8])
                    cylinder(d=outer_d, h=L_drone1 + win_len + 8 + seam_lap, $fn=6);

                // Melody Tube (Center)
                translate([0, 0, fipple_z - L_melody - 8])
                    cylinder(d=outer_d, h=L_melody + win_len + 8 + seam_lap, $fn=6);

                // Drone 2 Tube (Right)
                translate([spacing, 0, fipple_z - L_drone2 - 8])
                    cylinder(d=outer_d, h=L_drone2 + win_len + 8 + seam_lap, $fn=6);

                // Upper Bridge & Webbing (JS-evaluated minimum acoustic length)
                translate([0, 0, ${(fippleZ - Math.min(lMel, lD1, lD2) * 0.45).toFixed(2)}])
                    linear_extrude(height=${(Math.min(lMel, lD1, lD2) * 0.45 + winLen).toFixed(2)} + seam_lap)
                        hex_profile_2d();
            } else {
                // Unified Monolithic Hexagonal Body
                linear_extrude(height=fipple_z + win_len + seam_lap) hex_profile_2d();
            }
            
            // Converging Mouthpiece Beak lofting smoothly inward to human lip tip
            hull() {
                translate([0, 0, fipple_z + win_len])
                    linear_extrude(height=1) hex_profile_2d();
                translate([0, 0, total_L - 1])
                    linear_extrude(height=1)
                        hull() {
                            translate([-tip_spacing, 0]) circle(d=tip_d, $fn=6);
                            translate([tip_spacing, 0]) circle(d=tip_d, $fn=6);
                        }
            }

            // Chimneys
${chimneysStr}

            // Keywork mounting rails and door-hinge stanchion posts
${kw.scad.fusedCall}
        }

        // Resonator bores (fipple_z downwards to bottom)
        translate([0, 0, fipple_z - L_melody]) cylinder(d=bore_melody, h=L_melody + 0.1, $fn=24);
        translate([-spacing, 0, fipple_z - L_drone1]) cylinder(d=bore_drone1, h=L_drone1 + 0.1, $fn=24);
        translate([spacing, 0, fipple_z - L_drone2]) cylinder(d=bore_drone2, h=L_drone2 + 0.1, $fn=24);

        // Open bottom exit bores
        translate([0, 0, -1]) cylinder(d=bore_melody, h=fipple_z - L_melody + 1.1, $fn=24);
        translate([-spacing, 0, -1]) cylinder(d=bore_drone1, h=fipple_z - L_drone1 + 1.1, $fn=24);
        translate([spacing, 0, -1]) cylinder(d=bore_drone2, h=fipple_z - L_drone2 + 1.1, $fn=24);

        // Fipple sound windows & labium splitting edges
        translate([0, outer_d/2 - 2, fipple_z]) cube([bore_melody * 0.45, 10, win_len], center=true);
        translate([-spacing, outer_d/2 - 2, fipple_z]) cube([bore_drone1 * 0.45, 10, win_len], center=true);
        translate([spacing, outer_d/2 - 2, fipple_z]) cube([bore_drone2 * 0.45, 10, win_len], center=true);

        // Converging airway windways inside mouthpiece
        converging_windways();

        // Tone holes
${holesStr}
    }${boreClip}
}

// ====================================================================
// Self-Aligning Tenon & Mortise Socket Joint Slicing
// ====================================================================
num_segments = ${numSegments};
print_part = "${printPart}";
joint_tol = ${jointTol.toFixed(2)};
joint_len = ${jointLen.toFixed(1)};

// Smart Safe Cut Planes (computed in JS with safety clearances away from tone holes & fipple)
z_cut1 = ${zCut1.toFixed(2)};
z_cut2 = ${zCut2.toFixed(2)};
z_cut3 = ${zCut3.toFixed(2)};

module top_upward_joint(z_pos) {
    // TOP JOINT (Facing UPWARD):
    // Outer Body = Female Pocket Collar
    // 3 Inner Pipes = Male Spigot Cylinders (grow straight up with zero overhangs)

    // 1. Recessed Outer Body Pocket Shelf
    translate([0, 0, z_pos - joint_len * 0.50])
        difference() {
            linear_extrude(height = joint_len * 0.50 + 0.1)
                offset(r = 1.0) hex_profile_2d();
            linear_extrude(height = joint_len * 0.50 + 0.2)
                offset(r = -(wall * 0.38 - joint_tol/2))
                    hex_profile_2d();
        }

    // 2. Three Internal Cylindrical Male Spigots (Protrude UPWARD by joint_len with 45° lead-in chamfer)
    for (pipe = [[-spacing, bore_drone1], [0, bore_melody], [spacing, bore_drone2]]) {
        xp = pipe[0];
        bd = pipe[1];
        spigot_od = bd + (wall * 0.65 - joint_tol);
        translate([xp, 0, z_pos]) {
            difference() {
                union() {
                    cylinder(d = spigot_od, h = joint_len - 1.2, $fn = 32);
                    // 45° self-aligning lead-in cone tip
                    translate([0, 0, joint_len - 1.2])
                        cylinder(d1 = spigot_od, d2 = spigot_od - 1.8, h = 1.2, $fn = 32);
                }
                translate([0, 0, -1.0]) cylinder(d = bd, h = joint_len + 3.0, $fn = 32);
            }
        }
    }
}

module bottom_downward_socket(z_pos) {
    // BOTTOM JOINT (Facing DOWNWARD):
    // Outer Body = Male Tenon
    // 3 Inner Pipes = Female Counterbores (with 45° self-supporting ceiling tapers)

    // 1. Male Outer Body Tenon (extends down by joint_len * 0.50)
    translate([0, 0, z_pos - joint_len * 0.50])
        difference() {
            linear_extrude(height = joint_len * 0.50 + 0.1)
                offset(r = -(wall * 0.38 + joint_tol/2))
                    hex_profile_2d();
            // Clear through bores
            translate([-spacing, 0, -0.5]) cylinder(d = bore_drone1 + wall * 0.7, h = joint_len + 1.0, $fn = 24);
            translate([0, 0, -0.5]) cylinder(d = bore_melody + wall * 0.7, h = joint_len + 1.0, $fn = 24);
            translate([spacing, 0, -0.5]) cylinder(d = bore_drone2 + wall * 0.7, h = joint_len + 1.0, $fn = 24);
        }

    // 2. Three Internal Female Counterbores (with 45° self-supporting internal roof chamfers)
    for (pipe = [[-spacing, bore_drone1], [0, bore_melody], [spacing, bore_drone2]]) {
        xp = pipe[0];
        bd = pipe[1];
        mortise_od = bd + (wall * 0.65 + joint_tol);
        translate([xp, 0, z_pos]) {
            // Main cylindrical mortise sleeve
            cylinder(d = mortise_od, h = joint_len + 0.1, $fn = 32);
            // 45° self-supporting transition into main bore
            translate([0, 0, joint_len])
                cylinder(d1 = mortise_od, d2 = bd, h = (mortise_od - bd)/2, $fn = 32);
        }
    }
}

module slice_part(z_bottom, z_top, has_bottom_joint, has_top_joint) {
    difference() {
        union() {
            // Main body between [z_bottom, z_top]
            intersection() {
                complete_flute();
                translate([0, 0, (z_bottom + z_top) / 2])
                    cube([outer_d * 6, outer_d * 6, z_top - z_bottom], center = true);
            }
            // Add top upward-growing male cylinder spigots
            if (has_top_joint) {
                top_upward_joint(z_top);
            }
            // Add bottom male outer body tenon
            if (has_bottom_joint) {
                translate([0, 0, z_bottom - joint_len * 0.50])
                    difference() {
                        linear_extrude(height = joint_len * 0.50)
                            offset(r = -(wall * 0.38 + joint_tol/2))
                                hex_profile_2d();
                        // Clear internal bores
                        translate([-spacing, 0, -0.5]) cylinder(d = bore_drone1, h = joint_len + 1.0, $fn = 24);
                        translate([0, 0, -0.5]) cylinder(d = bore_melody, h = joint_len + 1.0, $fn = 24);
                        translate([spacing, 0, -0.5]) cylinder(d = bore_drone2, h = joint_len + 1.0, $fn = 24);
                    }
            }
        }
        // Subtract top female outer body collar shelf
        if (has_top_joint) {
            translate([0, 0, z_top - joint_len * 0.50 - 0.1])
                difference() {
                    linear_extrude(height = joint_len * 0.50 + 0.2)
                        offset(r = 2.0) hex_profile_2d();
                    linear_extrude(height = joint_len * 0.50 + 0.3)
                        offset(r = -(wall * 0.38 - joint_tol/2))
                            hex_profile_2d();
                }
        }
        // Subtract bottom internal female cylindrical counterbores (with 45° self-supporting roofs)
        if (has_bottom_joint) {
            for (pipe = [[-spacing, bore_drone1], [0, bore_melody], [spacing, bore_drone2]]) {
                xp = pipe[0];
                bd = pipe[1];
                mortise_od = bd + (wall * 0.65 + joint_tol);
                translate([xp, 0, z_bottom - 0.1]) {
                    cylinder(d = mortise_od, h = joint_len + 0.2, $fn = 32);
                    translate([0, 0, joint_len + 0.2])
                        cylinder(d1 = mortise_od, d2 = bd, h = (mortise_od - bd)/2, $fn = 32);
                }
            }
        }
    }
}

module joint_seam_groove(z_pos) {
    // Sharp V-groove chamfer cut around the outer body and each individual tube
    translate([0, 0, z_pos]) {
        // Hexagonal body groove
        difference() {
            linear_extrude(height = 0.7, center = true)
                offset(r = 2.0) hex_profile_2d();
            linear_extrude(height = 0.9, center = true)
                offset(r = -0.6) hex_profile_2d();
        }
        // Individual cylindrical tube groove rings
        for (xp = [-spacing, 0, spacing]) {
            translate([xp, 0, 0])
                difference() {
                    cylinder(d = outer_d + 3.0, h = 0.7, center = true, $fn = 32);
                    cylinder(d = outer_d - 1.2, h = 0.9, center = true, $fn = 32);
                }
        }
    }
}

if (num_segments == 1) {
    complete_flute();
} else if (print_part == "assembled") {
    // Render true assembled segments showing visible mechanical joint seam lines
    difference() {
        complete_flute();
        if (num_segments >= 2) joint_seam_groove(z_cut1);
        if (num_segments >= 3) joint_seam_groove(z_cut2);
        if (num_segments >= 4) joint_seam_groove(z_cut3);
    }
} else if (num_segments == 2) {
    if (print_part == "part_1" || print_part == "head") {
        slice_part(z_cut1, total_L, true, false); // Bottom joint into lower piece
    } else {
        slice_part(0, z_cut1, false, true);       // Top joint receives upper piece
    }
} else if (num_segments == 3) {
    if (print_part == "part_1" || print_part == "head") {
        slice_part(z_cut2, total_L, true, false);
    } else if (print_part == "part_2" || print_part == "mid") {
        slice_part(z_cut1, z_cut2, true, true);
    } else {
        slice_part(0, z_cut1, false, true);
    }
} else if (num_segments == 4) {
    if (print_part == "part_1") {
        slice_part(z_cut3, total_L, true, false);
    } else if (print_part == "part_2") {
        slice_part(z_cut2, z_cut3, true, true);
    } else if (print_part == "part_3") {
        slice_part(z_cut1, z_cut2, true, true);
    } else {
        slice_part(0, z_cut1, false, true);
    }
}
`;
}
