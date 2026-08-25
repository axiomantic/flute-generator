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

windway_profile = "sac";
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

// ====================================================================
// Articulated keywork v2 (scratch/keywork/DESIGN_v2.md)
// One hollow pad rod per keyed hole turning in its own journal sleeve; touch keys on one
// stationary spindle drive them through a push-only sax bridge. Normally closed, press to open.
// Every profile below is extruded along +Z: zero overhang with the flute printed upright.
// ====================================================================
echo("== KEYWORK mode=keys_low keys=[2, 3, 4] rod_od=4.000 sleeve_od=8.700 kw_sleeve_tol=0.35 pitch=22.000 cluster=[200.517, 244.517] standoff=38.300");
echo("!! WARN KW-OVERHOLE: 3 spindle stanchion beam(s) pass directly over an open tone hole, 6.6 mm above the rim. Nothing touches, but a solid bar that close above a 6.5 mm hole raises its open-hole end correction and will flatten that note. The tuning model does not account for it. Shift the cluster or accept the detune.");
echo("!! WARN KW-BRIDGEHOLE: bridge stations [2,4] sit inside a chimney footprint (their own hole or a neighbour's: [[2],[3,4]]). The bridge clears it in Y -- the contact plane is 17 mm above the rim crown -- but rods [2,3,4] are too short for an inline journal and are bearing-supported on the far side of their hole instead.");
echo("!! WARN KW-STANDOFF: the mechanism stands 38 mm off a body only 29 mm across, so the keywork is wider than the flute. Expect it to be fragile and to dominate the print. Lower kw_plate_up, kw_bridge_clear or numHoles.");
echo("!! WARN KW-UNNEEDED: the closest two keyed holes are 15 mm apart, inside a normal finger pitch. This instrument can be played with bare fingers and does not need keys. Keywork here adds 38 mm of hardware and 9 extra parts for no reach benefit.");
echo("!! WARN KW-BUILDZ: longest printed segment is 451 mm, over the 250 mm build height. Increase numSegments or the instrument will not fit the printer.");

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
    for (pipe = [[-27.55, 18.00], [0.00, 16.00], [27.55, 14.00]])
        translate([pipe[0], 0, -2])
            cylinder(d=pipe[1] + 2*kw_bore_clear, h=408.96 + 2, $fn=24);
}

module keywork_sleeves() {
        // journal sleeve for hole 2, 12.000 mm (far-side journal: the rod is too short for an inline one)
        difference() {
            union() {
                translate([-15.200, 18.407, 166.092]) cylinder(d=8.700, h=12.000, $fn=40);
                translate([-15.200, 9.204, 172.092])
                    cube([2.000, 18.407, 12.000], center=true);
            }
            translate([-15.200, 18.407, 165.092])
                cylinder(d=7.100, h=14.000, $fn=40);
        }
        difference() {
            translate([-15.200, 18.407, 167.092]) cylinder(d=7.500, h=6.000, $fn=40);
            translate([-15.200, 18.407, 166.092]) cylinder(d=4.700, h=8.000, $fn=40);
        }
        difference() {
            translate([-15.200, 18.407, 171.092]) cylinder(d=7.500, h=6.000, $fn=40);
            translate([-15.200, 18.407, 170.092]) cylinder(d=4.700, h=8.000, $fn=40);
        }
        // journal sleeve for hole 3, 12.000 mm (far-side journal: the rod is too short for an inline one)
        difference() {
            union() {
                translate([15.200, 18.407, 252.185]) cylinder(d=8.700, h=12.000, $fn=40);
                translate([15.200, 9.204, 258.185])
                    cube([2.000, 18.407, 12.000], center=true);
            }
            translate([15.200, 18.407, 251.185])
                cylinder(d=7.100, h=14.000, $fn=40);
        }
        difference() {
            translate([15.200, 18.407, 253.185]) cylinder(d=7.500, h=6.000, $fn=40);
            translate([15.200, 18.407, 252.185]) cylinder(d=4.700, h=8.000, $fn=40);
        }
        difference() {
            translate([15.200, 18.407, 257.185]) cylinder(d=7.500, h=6.000, $fn=40);
            translate([15.200, 18.407, 256.185]) cylinder(d=4.700, h=8.000, $fn=40);
        }
        // journal sleeve for hole 4, 12.000 mm (far-side journal: the rod is too short for an inline one)
        difference() {
            union() {
                translate([-15.200, 18.407, 266.942]) cylinder(d=8.700, h=12.000, $fn=40);
                translate([-15.200, 9.204, 272.942])
                    cube([2.000, 18.407, 12.000], center=true);
            }
            translate([-15.200, 18.407, 265.942])
                cylinder(d=7.100, h=14.000, $fn=40);
        }
        difference() {
            translate([-15.200, 18.407, 267.942]) cylinder(d=7.500, h=6.000, $fn=40);
            translate([-15.200, 18.407, 266.942]) cylinder(d=4.700, h=8.000, $fn=40);
        }
        difference() {
            translate([-15.200, 18.407, 271.942]) cylinder(d=7.500, h=6.000, $fn=40);
            translate([-15.200, 18.407, 270.942]) cylinder(d=4.700, h=8.000, $fn=40);
        }
}

module keywork_stanchions() {
        // spindle stanchion 0
        difference() {
            translate([0, 0, 187.267]) linear_extrude(height=4.500) difference() {
                union() {
                    for (sx = [-1, 1])
                        translate([sx * 24.550, 15.703])
                            square([7.060, 31.407], center=true);
                    translate([0, 28.407])
                        square([56.100, 10.300], center=true);
                    translate([7.440, 35.057])
                        square([13.000, 3.020], center=true);
                }
                translate([0, 28.407]) circle(d=3.700, $fn=32);
            }
            translate([7.440, 35.057, 189.517])
                linear_extrude(height=10.500, center=true)
                    polygon([[-3.600, 1.500], [-5.200, -1.500],
                             [5.200, -1.500], [3.600, 1.500]]);
        }
        // spindle stanchion 1
        difference() {
            translate([0, 0, 209.267]) linear_extrude(height=4.500) difference() {
                union() {
                    for (sx = [-1, 1])
                        translate([sx * 24.550, 15.703])
                            square([7.060, 31.407], center=true);
                    translate([0, 28.407])
                        square([56.100, 10.300], center=true);
                    translate([-7.440, 35.057])
                        square([13.000, 3.020], center=true);
                }
                translate([0, 28.407]) circle(d=3.700, $fn=32);
            }
            translate([-7.440, 35.057, 211.517])
                linear_extrude(height=10.500, center=true)
                    polygon([[-3.600, 1.500], [-5.200, -1.500],
                             [5.200, -1.500], [3.600, 1.500]]);
        }
        // spindle stanchion 2
        difference() {
            translate([0, 0, 231.267]) linear_extrude(height=4.500) difference() {
                union() {
                    for (sx = [-1, 1])
                        translate([sx * 24.550, 15.703])
                            square([7.060, 31.407], center=true);
                    translate([0, 28.407])
                        square([56.100, 10.300], center=true);
                    translate([7.440, 35.057])
                        square([13.000, 3.020], center=true);
                }
                translate([0, 28.407]) circle(d=3.700, $fn=32);
            }
            translate([7.440, 35.057, 233.517])
                linear_extrude(height=10.500, center=true)
                    polygon([[-3.600, 1.500], [-5.200, -1.500],
                             [5.200, -1.500], [3.600, 1.500]]);
        }
        // spindle stanchion 3
        difference() {
            translate([0, 0, 253.267]) linear_extrude(height=4.500) difference() {
                union() {
                    for (sx = [-1, 1])
                        translate([sx * 24.550, 15.703])
                            square([7.060, 31.407], center=true);
                    translate([0, 28.407])
                        square([56.100, 10.300], center=true);
                }
                translate([0, 28.407]) circle(d=3.700, $fn=32);
            }
        }
        translate([0, 28.407, 186.267])
            cylinder(d=3.000, h=72.500, $fn=28);
}

module keywork_rods() {
        // pad rod for hole 2: hollow tube, pad arm, cup, bridge lug
        difference() {
            translate([-15.200, 18.407, 162.092]) cylinder(d=4.000, h=45.425, $fn=28);
            translate([-15.200, 18.407, 161.092]) cylinder(d=2.200, h=47.425, $fn=28);
        }
        translate([-15.200, 18.407, 162.892]) cylinder(d=7.000, h=2.400, $fn=28);
        translate([-15.200, 18.407, 178.892]) cylinder(d=7.000, h=2.400, $fn=28);
        translate([0, 0, 188.442]) linear_extrude(height=6.000)
            hull() {
                translate([-15.200, 18.407]) circle(d=7.600, $fn=24);
                translate([0, 18.577]) circle(d=8.305, $fn=24);
            }
        translate([0, 16.977, 191.442]) rotate([-90, 0, 0]) rotate([0, 0, 30]) difference() {
            cylinder(d=18.422, h=2.800, $fn=6);
            translate([0, 0, -0.010]) cylinder(d=12.700, h=1.600, $fn=32);
        }
        translate([0, 0, 197.517]) linear_extrude(height=6.000) {
            hull() {
                translate([-15.200, 18.407]) circle(d=8.200, $fn=24);
                translate([-15.200, 38.557]) circle(d=8.200, $fn=24);
            }
            translate([-10.850, 38.557])
                square([8.700, 3.000], center=true);
            translate([-6.500, 37.557])
                circle(d=7.000, $fn=28);
        }
        // pad rod for hole 3: hollow tube, pad arm, cup, bridge lug
        difference() {
            translate([15.200, 18.407, 215.517]) cylinder(d=4.000, h=52.668, $fn=28);
            translate([15.200, 18.407, 214.517]) cylinder(d=2.200, h=54.668, $fn=28);
        }
        translate([15.200, 18.407, 248.985]) cylinder(d=7.000, h=2.400, $fn=28);
        translate([15.200, 18.407, 264.985]) cylinder(d=7.000, h=2.400, $fn=28);
        translate([0, 0, 235.835]) linear_extrude(height=6.000)
            hull() {
                translate([15.200, 18.407]) circle(d=7.600, $fn=24);
                translate([0, 18.577]) circle(d=8.305, $fn=24);
            }
        translate([0, 16.977, 238.835]) rotate([-90, 0, 0]) rotate([0, 0, 30]) difference() {
            cylinder(d=18.422, h=2.800, $fn=6);
            translate([0, 0, -0.010]) cylinder(d=12.700, h=1.600, $fn=32);
        }
        translate([0, 0, 219.517]) linear_extrude(height=6.000) {
            hull() {
                translate([15.200, 18.407]) circle(d=8.200, $fn=24);
                translate([15.200, 38.557]) circle(d=8.200, $fn=24);
            }
            translate([10.850, 38.557])
                square([8.700, 3.000], center=true);
            translate([6.500, 37.557])
                circle(d=7.000, $fn=28);
        }
        // pad rod for hole 4: hollow tube, pad arm, cup, bridge lug
        difference() {
            translate([-15.200, 18.407, 237.517]) cylinder(d=4.000, h=45.425, $fn=28);
            translate([-15.200, 18.407, 236.517]) cylinder(d=2.200, h=47.425, $fn=28);
        }
        translate([-15.200, 18.407, 263.742]) cylinder(d=7.000, h=2.400, $fn=28);
        translate([-15.200, 18.407, 279.742]) cylinder(d=7.000, h=2.400, $fn=28);
        translate([0, 0, 250.592]) linear_extrude(height=6.000)
            hull() {
                translate([-15.200, 18.407]) circle(d=7.600, $fn=24);
                translate([0, 18.577]) circle(d=8.305, $fn=24);
            }
        translate([0, 16.977, 253.592]) rotate([-90, 0, 0]) rotate([0, 0, 30]) difference() {
            cylinder(d=18.422, h=2.800, $fn=6);
            translate([0, 0, -0.010]) cylinder(d=12.700, h=1.600, $fn=32);
        }
        translate([0, 0, 241.517]) linear_extrude(height=6.000) {
            hull() {
                translate([-15.200, 18.407]) circle(d=8.200, $fn=24);
                translate([-15.200, 38.557]) circle(d=8.200, $fn=24);
            }
            translate([-10.850, 38.557])
                square([8.700, 3.000], center=true);
            translate([-6.500, 37.557])
                circle(d=7.000, $fn=28);
        }
}

module keywork_touch_keys() {
        // touch key for hole 2: hinge tube, bridge foot, plate arm, spring ledge
        difference() {
            union() {
                translate([0, 28.407, 192.367]) cylinder(d=7.300, h=16.300, $fn=32);
                translate([0, 0, 197.517]) linear_extrude(height=6.000)
                    hull() {
                        translate([0, 28.407]) circle(d=7.300, $fn=32);
                        translate([-3.000, 31.457]) circle(d=3.000, $fn=20);
                        translate([-10.000, 31.457]) circle(d=3.000, $fn=20);
                    }
                translate([0, 0, 192.017]) linear_extrude(height=17.000) {
                    hull() {
                        translate([0, 28.407]) circle(d=6.205, $fn=32);
                        translate([12.000, 45.257]) circle(d=4, $fn=20);
                    }
                    translate([12.000, 46.657])
                        square([16.000, 2.800], center=true);
                    translate([7.440, 41.557])
                        square([9.000, 3.000], center=true);
                }
            }
            translate([0, 28.407, 191.017])
                cylinder(d=3.700, h=19.000, $fn=32);
        }
        // touch key for hole 3: hinge tube, bridge foot, plate arm, spring ledge
        difference() {
            union() {
                translate([0, 28.407, 214.367]) cylinder(d=7.300, h=16.300, $fn=32);
                translate([0, 0, 219.517]) linear_extrude(height=6.000)
                    hull() {
                        translate([0, 28.407]) circle(d=7.300, $fn=32);
                        translate([3.000, 31.457]) circle(d=3.000, $fn=20);
                        translate([10.000, 31.457]) circle(d=3.000, $fn=20);
                    }
                translate([0, 0, 214.017]) linear_extrude(height=17.000) {
                    hull() {
                        translate([0, 28.407]) circle(d=6.205, $fn=32);
                        translate([-12.000, 45.257]) circle(d=4, $fn=20);
                    }
                    translate([-12.000, 46.657])
                        square([16.000, 2.800], center=true);
                    translate([-7.440, 41.557])
                        square([9.000, 3.000], center=true);
                }
            }
            translate([0, 28.407, 213.017])
                cylinder(d=3.700, h=19.000, $fn=32);
        }
        // touch key for hole 4: hinge tube, bridge foot, plate arm, spring ledge
        difference() {
            union() {
                translate([0, 28.407, 236.367]) cylinder(d=7.300, h=16.300, $fn=32);
                translate([0, 0, 241.517]) linear_extrude(height=6.000)
                    hull() {
                        translate([0, 28.407]) circle(d=7.300, $fn=32);
                        translate([-3.000, 31.457]) circle(d=3.000, $fn=20);
                        translate([-10.000, 31.457]) circle(d=3.000, $fn=20);
                    }
                translate([0, 0, 236.017]) linear_extrude(height=17.000) {
                    hull() {
                        translate([0, 28.407]) circle(d=6.205, $fn=32);
                        translate([12.000, 45.257]) circle(d=4, $fn=20);
                    }
                    translate([12.000, 46.657])
                        square([16.000, 2.800], center=true);
                    translate([7.440, 41.557])
                        square([9.000, 3.000], center=true);
                }
            }
            translate([0, 28.407, 235.017])
                cylinder(d=3.700, h=19.000, $fn=32);
        }
}

// Soft parts, shown in place. They print separately in TPU and are NOT part of the body solid.
module keywork_tpu() {
        // TPU for hole 2: pad disc, regulation bumper, leaf spring
        translate([0, 16.377, 191.442]) rotate([-90, 0, 0])
            cylinder(d=12.500, h=2.200, $fn=32);
        translate([-6.500, 33.707, 200.517])
            cube([9.000, 1.500, 7.000], center=true);
        translate([7.440, 35.057, 189.517])
            linear_extrude(height=8.500, center=true)
                polygon([[-3.500, 1.500], [-4.900, -1.500],
                         [4.900, -1.500], [3.500, 1.500]]);
        hull() {
            translate([7.440, 34.607, 191.767])
                cube([8.000, 2.900, 2.000], center=true);
            translate([7.440, 38.607, 200.517])
                cube([8.000, 2.900, 3.000], center=true);
        }
        // TPU for hole 3: pad disc, regulation bumper, leaf spring
        translate([0, 16.377, 238.835]) rotate([-90, 0, 0])
            cylinder(d=12.500, h=2.200, $fn=32);
        translate([6.500, 33.707, 222.517])
            cube([9.000, 1.500, 7.000], center=true);
        translate([-7.440, 35.057, 211.517])
            linear_extrude(height=8.500, center=true)
                polygon([[-3.500, 1.500], [-4.900, -1.500],
                         [4.900, -1.500], [3.500, 1.500]]);
        hull() {
            translate([-7.440, 34.607, 213.767])
                cube([8.000, 2.900, 2.000], center=true);
            translate([-7.440, 38.607, 222.517])
                cube([8.000, 2.900, 3.000], center=true);
        }
        // TPU for hole 4: pad disc, regulation bumper, leaf spring
        translate([0, 16.377, 253.592]) rotate([-90, 0, 0])
            cylinder(d=12.500, h=2.200, $fn=32);
        translate([-6.500, 33.707, 244.517])
            cube([9.000, 1.500, 7.000], center=true);
        translate([7.440, 35.057, 233.517])
            linear_extrude(height=8.500, center=true)
                polygon([[-3.500, 1.500], [-4.900, -1.500],
                         [4.900, -1.500], [3.500, 1.500]]);
        hull() {
            translate([7.440, 34.607, 235.767])
                cube([8.000, 2.900, 2.000], center=true);
            translate([7.440, 38.607, 244.517])
                cube([8.000, 2.900, 3.000], center=true);
        }
}

module keywork_moving() {
    keywork_rods();
    keywork_touch_keys();
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
        keywork_sleeves();
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

    // Keywork that a tone-hole drill would otherwise pass straight through, clipped back out of
    // every air column because it missed the bore subtraction above.
    difference() {
        union() {
            keywork_stanchions();
            keywork_moving();
        }
        keywork_bore_clip();
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
