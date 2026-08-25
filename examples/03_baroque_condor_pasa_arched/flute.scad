// Parametric Triple Drone Flute (1:1 OpenSCAD Native Model)
$fn = 24;

wall = 4.0;
spacing = 27.55;
bore_melody = 16.00;
bore_drone1 = 18.00;
bore_drone2 = 14.00;
outer_d = 29.00;

L_melody = 374.46;
L_drone1 = 378.96;
L_drone2 = 251.71;

head_len = 42.00;
win_len = 5.20;
total_L = 450.96;
fipple_z = 408.96;
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

windway_profile = "arched";
tube_shell_mode = "staggered";

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
}

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
                translate([0, 0, 295.69])
                    linear_extrude(height=118.47 + seam_lap)
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
        // Solid self-supporting donut chimney pad embedded 0.5mm into the front wall face
        translate([0, 12.06, 134.90]) rotate([-90, 0, 0]) {
            hull() {
                cylinder(d=18.70, h=0.5, $fn=24);
                translate([0, 0, 2.50]) cylinder(d=13.10, h=0.8, $fn=24);
            }
            translate([0, 0, 3.30]) rotate_extrude($fn=24) translate([4.90, 0]) circle(d=2.64, $fn=16);
        }
        // Solid self-supporting donut chimney pad embedded 0.5mm into the front wall face
        translate([0, 12.06, 161.63]) rotate([-90, 0, 0]) {
            hull() {
                cylinder(d=18.70, h=0.5, $fn=24);
                translate([0, 0, 2.50]) cylinder(d=13.10, h=0.8, $fn=24);
            }
            translate([0, 0, 3.30]) rotate_extrude($fn=24) translate([4.90, 0]) circle(d=2.64, $fn=16);
        }
        // Solid self-supporting donut chimney pad embedded 0.5mm into the front wall face
        translate([0, 12.06, 191.44]) rotate([-90, 0, 0]) {
            hull() {
                cylinder(d=18.70, h=0.5, $fn=24);
                translate([0, 0, 2.50]) cylinder(d=13.10, h=0.8, $fn=24);
            }
            translate([0, 0, 3.30]) rotate_extrude($fn=24) translate([4.90, 0]) circle(d=2.64, $fn=16);
        }
        // Solid self-supporting donut chimney pad embedded 0.5mm into the front wall face
        translate([0, 12.06, 238.84]) rotate([-90, 0, 0]) {
            hull() {
                cylinder(d=18.70, h=0.5, $fn=24);
                translate([0, 0, 2.50]) cylinder(d=13.10, h=0.8, $fn=24);
            }
            translate([0, 0, 3.30]) rotate_extrude($fn=24) translate([4.90, 0]) circle(d=2.64, $fn=16);
        }
        // Solid self-supporting donut chimney pad embedded 0.5mm into the front wall face
        translate([0, 12.06, 253.59]) rotate([-90, 0, 0]) {
            hull() {
                cylinder(d=18.70, h=0.5, $fn=24);
                translate([0, 0, 2.50]) cylinder(d=13.10, h=0.8, $fn=24);
            }
            translate([0, 0, 3.30]) rotate_extrude($fn=24) translate([4.90, 0]) circle(d=2.64, $fn=16);
        }

            // Keywork mounting rails and door-hinge stanchion posts

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
        translate([0, 0, 134.90]) rotate([-90, 0, 0]) cylinder(d=6.50, h=39.60, center=false, $fn=24);
        translate([0, 0, 161.63]) rotate([-90, 0, 0]) cylinder(d=6.50, h=39.60, center=false, $fn=24);
        translate([0, 0, 191.44]) rotate([-90, 0, 0]) cylinder(d=6.50, h=39.60, center=false, $fn=24);
        translate([0, 0, 238.84]) rotate([-90, 0, 0]) cylinder(d=6.50, h=39.60, center=false, $fn=24);
        translate([0, 0, 253.59]) rotate([-90, 0, 0]) cylinder(d=6.50, h=39.60, center=false, $fn=24);
    }
}

// ====================================================================
// Self-Aligning Tenon & Mortise Socket Joint Slicing
// ====================================================================
num_segments = 1;
print_part = "assembled";
joint_tol = 0.18;
joint_len = 14.0;

// Smart Safe Cut Planes (computed in JS with safety clearances away from tone holes & fipple)
z_cut1 = 386.96;
z_cut2 = 450.96;
z_cut3 = 450.96;

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
