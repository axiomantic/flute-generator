// Parametric Triple Drone Flute (1:1 OpenSCAD Native Model)
$fn = 24;

wall = 4.0;
spacing = 43.78;
bore_melody = 28.00;
bore_drone1 = 32.00;
bore_drone2 = 24.00;
outer_d = 46.08;

L_melody = 1148.81;
L_drone1 = 1149.05;
L_drone2 = 765.28;

head_len = 42.00;
win_len = 5.20;
total_L = 1221.05;
fipple_z = 1179.05;
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
echo("== KEYWORK mode=keys_all keys=[0, 1, 2, 3, 4] rod_od=6.923 sleeve_od=11.623 kw_sleeve_tol=0.35 pitch=22.000 cluster=[297.232, 385.232] standoff=41.684");
echo("!! WARN KW-OVERHOLE: 1 spindle stanchion beam(s) pass directly over an open tone hole, 9.5 mm above the rim. Nothing touches, but a solid bar that close above a 8 mm hole raises its open-hole end correction and will flatten that note. The tuning model does not account for it. Shift the cluster or accept the detune.");
echo("!! WARN KW-BRIDGEHOLE: bridge stations [3,4] sit inside a chimney footprint (their own hole or a neighbour's: [[1],[1,2]]). The bridge clears it in Y -- the contact plane is 21 mm above the rim crown -- but rods [] are too short for an inline journal and are bearing-supported on the far side of their hole instead.");
echo("!! WARN KW-UNNEEDED: the closest two keyed holes are 11 mm apart, inside a normal finger pitch. This instrument can be played with bare fingers and does not need keys. Keywork here adds 42 mm of hardware and 15 extra parts for no reach benefit.");
echo("!! WARN KW-BUILDZ: longest printed segment is 1221 mm, over the 250 mm build height. Increase numSegments or the instrument will not fit the printer.");

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
    for (pipe = [[-43.78, 32.00], [0.00, 28.00], [43.78, 24.00]])
        translate([pipe[0], 0, -2])
            cylinder(d=pipe[1] + 2*kw_bore_clear, h=1179.05 + 2, $fn=24);
}

module keywork_sleeves() {
        // journal sleeve for hole 0, 114.566 mm
        difference() {
            union() {
                translate([-17.411, 27.264, 177.667]) cylinder(d=11.623, h=114.566, $fn=40);
                translate([-17.411, 13.632, 234.949])
                    cube([2.423, 27.264, 114.566], center=true);
            }
            translate([-17.411, 27.264, 176.667])
                cylinder(d=10.023, h=116.566, $fn=40);
        }
        difference() {
            translate([-17.411, 27.264, 178.667]) cylinder(d=10.423, h=6.000, $fn=40);
            translate([-17.411, 27.264, 177.667]) cylinder(d=7.623, h=8.000, $fn=40);
        }
        difference() {
            translate([-17.411, 27.264, 231.949]) cylinder(d=10.423, h=6.000, $fn=40);
            translate([-17.411, 27.264, 230.949]) cylinder(d=7.623, h=8.000, $fn=40);
        }
        difference() {
            translate([-17.411, 27.264, 285.232]) cylinder(d=10.423, h=6.000, $fn=40);
            translate([-17.411, 27.264, 284.232]) cylinder(d=7.623, h=8.000, $fn=40);
        }
        // journal sleeve for hole 1, 34.969 mm
        difference() {
            union() {
                translate([17.411, 27.264, 324.232]) cylinder(d=11.623, h=34.969, $fn=40);
                translate([17.411, 13.632, 341.717])
                    cube([2.423, 27.264, 34.969], center=true);
            }
            translate([17.411, 27.264, 323.232])
                cylinder(d=10.023, h=36.969, $fn=40);
        }
        difference() {
            translate([17.411, 27.264, 325.232]) cylinder(d=10.423, h=6.000, $fn=40);
            translate([17.411, 27.264, 324.232]) cylinder(d=7.623, h=8.000, $fn=40);
        }
        difference() {
            translate([17.411, 27.264, 352.201]) cylinder(d=10.423, h=6.000, $fn=40);
            translate([17.411, 27.264, 351.201]) cylinder(d=7.623, h=8.000, $fn=40);
        }
        // journal sleeve for hole 2, 24.116 mm
        difference() {
            union() {
                translate([-17.411, 27.264, 346.232]) cylinder(d=11.623, h=24.116, $fn=40);
                translate([-17.411, 13.632, 358.290])
                    cube([2.423, 27.264, 24.116], center=true);
            }
            translate([-17.411, 27.264, 345.232])
                cylinder(d=10.023, h=26.116, $fn=40);
        }
        difference() {
            translate([-17.411, 27.264, 347.232]) cylinder(d=10.423, h=6.000, $fn=40);
            translate([-17.411, 27.264, 346.232]) cylinder(d=7.623, h=8.000, $fn=40);
        }
        difference() {
            translate([-17.411, 27.264, 363.348]) cylinder(d=10.423, h=6.000, $fn=40);
            translate([-17.411, 27.264, 362.348]) cylinder(d=7.623, h=8.000, $fn=40);
        }
        // journal sleeve for hole 3, 116.962 mm
        difference() {
            union() {
                translate([30.534, 27.264, 368.232]) cylinder(d=11.623, h=116.962, $fn=40);
                translate([30.534, 13.632, 426.713])
                    cube([2.423, 27.264, 116.962], center=true);
            }
            translate([30.534, 27.264, 367.232])
                cylinder(d=10.023, h=118.962, $fn=40);
        }
        difference() {
            translate([30.534, 27.264, 369.232]) cylinder(d=10.423, h=6.000, $fn=40);
            translate([30.534, 27.264, 368.232]) cylinder(d=7.623, h=8.000, $fn=40);
        }
        difference() {
            translate([30.534, 27.264, 423.713]) cylinder(d=10.423, h=6.000, $fn=40);
            translate([30.534, 27.264, 422.713]) cylinder(d=7.623, h=8.000, $fn=40);
        }
        difference() {
            translate([30.534, 27.264, 478.194]) cylinder(d=10.423, h=6.000, $fn=40);
            translate([30.534, 27.264, 477.194]) cylinder(d=7.623, h=8.000, $fn=40);
        }
        // journal sleeve for hole 4, 114.566 mm
        difference() {
            union() {
                translate([-30.534, 27.264, 390.232]) cylinder(d=11.623, h=114.566, $fn=40);
                translate([-30.534, 13.632, 447.515])
                    cube([2.423, 27.264, 114.566], center=true);
            }
            translate([-30.534, 27.264, 389.232])
                cylinder(d=10.023, h=116.566, $fn=40);
        }
        difference() {
            translate([-30.534, 27.264, 391.232]) cylinder(d=10.423, h=6.000, $fn=40);
            translate([-30.534, 27.264, 390.232]) cylinder(d=7.623, h=8.000, $fn=40);
        }
        difference() {
            translate([-30.534, 27.264, 444.515]) cylinder(d=10.423, h=6.000, $fn=40);
            translate([-30.534, 27.264, 443.515]) cylinder(d=7.623, h=8.000, $fn=40);
        }
        difference() {
            translate([-30.534, 27.264, 497.798]) cylinder(d=10.423, h=6.000, $fn=40);
            translate([-30.534, 27.264, 496.798]) cylinder(d=7.623, h=8.000, $fn=40);
        }
}

module keywork_stanchions() {
        // spindle stanchion 0
        difference() {
            translate([0, 0, 283.982]) linear_extrude(height=4.500) difference() {
                union() {
                    for (sx = [-1, 1])
                        translate([sx * 41.346, 20.978])
                            square([7.060, 41.956], center=true);
                    translate([0, 38.956])
                        square([89.692, 10.761], center=true);
                    translate([7.440, 45.837])
                        square([13.000, 3.020], center=true);
                }
                translate([0, 38.956]) circle(d=4.161, $fn=32);
            }
            translate([7.440, 45.837, 286.232])
                linear_extrude(height=10.500, center=true)
                    polygon([[-3.600, 1.500], [-5.200, -1.500],
                             [5.200, -1.500], [3.600, 1.500]]);
        }
        // spindle stanchion 1
        difference() {
            translate([0, 0, 305.982]) linear_extrude(height=4.500) difference() {
                union() {
                    for (sx = [-1, 1])
                        translate([sx * 41.346, 20.978])
                            square([7.060, 41.956], center=true);
                    translate([0, 38.956])
                        square([89.692, 10.761], center=true);
                    translate([-7.440, 45.837])
                        square([13.000, 3.020], center=true);
                }
                translate([0, 38.956]) circle(d=4.161, $fn=32);
            }
            translate([-7.440, 45.837, 308.232])
                linear_extrude(height=10.500, center=true)
                    polygon([[-3.600, 1.500], [-5.200, -1.500],
                             [5.200, -1.500], [3.600, 1.500]]);
        }
        // spindle stanchion 2
        difference() {
            translate([0, 0, 327.982]) linear_extrude(height=4.500) difference() {
                union() {
                    for (sx = [-1, 1])
                        translate([sx * 41.346, 20.978])
                            square([7.060, 41.956], center=true);
                    translate([0, 38.956])
                        square([89.692, 10.761], center=true);
                    translate([7.440, 45.837])
                        square([13.000, 3.020], center=true);
                }
                translate([0, 38.956]) circle(d=4.161, $fn=32);
            }
            translate([7.440, 45.837, 330.232])
                linear_extrude(height=10.500, center=true)
                    polygon([[-3.600, 1.500], [-5.200, -1.500],
                             [5.200, -1.500], [3.600, 1.500]]);
        }
        // spindle stanchion 3
        difference() {
            translate([0, 0, 349.982]) linear_extrude(height=4.500) difference() {
                union() {
                    for (sx = [-1, 1])
                        translate([sx * 41.346, 20.978])
                            square([7.060, 41.956], center=true);
                    translate([0, 38.956])
                        square([89.692, 10.761], center=true);
                    translate([-7.440, 45.837])
                        square([13.000, 3.020], center=true);
                }
                translate([0, 38.956]) circle(d=4.161, $fn=32);
            }
            translate([-7.440, 45.837, 352.232])
                linear_extrude(height=10.500, center=true)
                    polygon([[-3.600, 1.500], [-5.200, -1.500],
                             [5.200, -1.500], [3.600, 1.500]]);
        }
        // spindle stanchion 4
        difference() {
            translate([0, 0, 371.982]) linear_extrude(height=4.500) difference() {
                union() {
                    for (sx = [-1, 1])
                        translate([sx * 41.346, 20.978])
                            square([7.060, 41.956], center=true);
                    translate([0, 38.956])
                        square([89.692, 10.761], center=true);
                    translate([7.440, 45.837])
                        square([13.000, 3.020], center=true);
                }
                translate([0, 38.956]) circle(d=4.161, $fn=32);
            }
            translate([7.440, 45.837, 374.232])
                linear_extrude(height=10.500, center=true)
                    polygon([[-3.600, 1.500], [-5.200, -1.500],
                             [5.200, -1.500], [3.600, 1.500]]);
        }
        // spindle stanchion 5
        difference() {
            translate([0, 0, 393.982]) linear_extrude(height=4.500) difference() {
                union() {
                    for (sx = [-1, 1])
                        translate([sx * 41.346, 20.978])
                            square([7.060, 41.956], center=true);
                    translate([0, 38.956])
                        square([89.692, 10.761], center=true);
                }
                translate([0, 38.956]) circle(d=4.161, $fn=32);
            }
        }
        translate([0, 38.956, 282.982])
            cylinder(d=3.461, h=116.500, $fn=28);
}

module keywork_rods() {
        // pad rod for hole 0: hollow tube, pad arm, cup, bridge lug
        difference() {
            translate([-17.411, 27.264, 156.567]) cylinder(d=6.923, h=147.666, $fn=28);
            translate([-17.411, 27.264, 155.567]) cylinder(d=3.808, h=149.666, $fn=28);
        }
        translate([-17.411, 27.264, 174.467]) cylinder(d=9.923, h=2.400, $fn=28);
        translate([-17.411, 27.264, 293.032]) cylinder(d=9.923, h=2.400, $fn=28);
        translate([0, 0, 160.567]) linear_extrude(height=6.000)
            hull() {
                translate([-17.411, 27.264]) circle(d=10.523, $fn=24);
                translate([0, 25.973]) circle(d=9.130, $fn=24);
            }
        translate([0, 24.373, 163.567]) rotate([-90, 0, 0]) rotate([0, 0, 30]) difference() {
            cylinder(d=20.252, h=2.800, $fn=6);
            translate([0, 0, -0.010]) cylinder(d=14.200, h=1.600, $fn=32);
        }
        translate([0, 0, 294.232]) linear_extrude(height=6.000) {
            hull() {
                translate([-17.411, 27.264]) circle(d=11.123, $fn=24);
                translate([-17.411, 49.337]) circle(d=11.123, $fn=24);
            }
            translate([-12.071, 49.337])
                square([10.681, 3.000], center=true);
            translate([-6.731, 48.337])
                circle(d=7.000, $fn=28);
        }
        // pad rod for hole 1: hollow tube, pad arm, cup, bridge lug
        difference() {
            translate([17.411, 27.264, 312.232]) cylinder(d=6.923, h=68.069, $fn=28);
            translate([17.411, 27.264, 311.232]) cylinder(d=3.808, h=70.069, $fn=28);
        }
        translate([17.411, 27.264, 321.032]) cylinder(d=9.923, h=2.400, $fn=28);
        translate([17.411, 27.264, 360.001]) cylinder(d=9.923, h=2.400, $fn=28);
        translate([0, 0, 370.301]) linear_extrude(height=6.000)
            hull() {
                translate([17.411, 27.264]) circle(d=10.523, $fn=24);
                translate([0, 25.973]) circle(d=9.130, $fn=24);
            }
        translate([0, 24.373, 373.301]) rotate([-90, 0, 0]) rotate([0, 0, 30]) difference() {
            cylinder(d=20.252, h=2.800, $fn=6);
            translate([0, 0, -0.010]) cylinder(d=14.200, h=1.600, $fn=32);
        }
        translate([0, 0, 316.232]) linear_extrude(height=6.000) {
            hull() {
                translate([17.411, 27.264]) circle(d=11.123, $fn=24);
                translate([17.411, 49.337]) circle(d=11.123, $fn=24);
            }
            translate([12.071, 49.337])
                square([10.681, 3.000], center=true);
            translate([6.731, 48.337])
                circle(d=7.000, $fn=28);
        }
        // pad rod for hole 2: hollow tube, pad arm, cup, bridge lug
        difference() {
            translate([-17.411, 27.264, 334.232]) cylinder(d=6.923, h=57.216, $fn=28);
            translate([-17.411, 27.264, 333.232]) cylinder(d=3.808, h=59.216, $fn=28);
        }
        translate([-17.411, 27.264, 343.032]) cylinder(d=9.923, h=2.400, $fn=28);
        translate([-17.411, 27.264, 371.148]) cylinder(d=9.923, h=2.400, $fn=28);
        translate([0, 0, 381.448]) linear_extrude(height=6.000)
            hull() {
                translate([-17.411, 27.264]) circle(d=10.523, $fn=24);
                translate([0, 25.973]) circle(d=9.130, $fn=24);
            }
        translate([0, 24.373, 384.448]) rotate([-90, 0, 0]) rotate([0, 0, 30]) difference() {
            cylinder(d=20.252, h=2.800, $fn=6);
            translate([0, 0, -0.010]) cylinder(d=14.200, h=1.600, $fn=32);
        }
        translate([0, 0, 338.232]) linear_extrude(height=6.000) {
            hull() {
                translate([-17.411, 27.264]) circle(d=11.123, $fn=24);
                translate([-17.411, 49.337]) circle(d=11.123, $fn=24);
            }
            translate([-12.071, 49.337])
                square([10.681, 3.000], center=true);
            translate([-6.731, 48.337])
                circle(d=7.000, $fn=28);
        }
        // pad rod for hole 3: hollow tube, pad arm, cup, bridge lug
        difference() {
            translate([30.534, 27.264, 356.232]) cylinder(d=6.923, h=150.062, $fn=28);
            translate([30.534, 27.264, 355.232]) cylinder(d=3.808, h=152.062, $fn=28);
        }
        translate([30.534, 27.264, 365.032]) cylinder(d=9.923, h=2.400, $fn=28);
        translate([30.534, 27.264, 485.994]) cylinder(d=9.923, h=2.400, $fn=28);
        translate([0, 0, 496.294]) linear_extrude(height=6.000)
            hull() {
                translate([30.534, 27.264]) circle(d=10.523, $fn=24);
                translate([0, 25.973]) circle(d=9.130, $fn=24);
            }
        translate([0, 24.373, 499.294]) rotate([-90, 0, 0]) rotate([0, 0, 30]) difference() {
            cylinder(d=20.252, h=2.800, $fn=6);
            translate([0, 0, -0.010]) cylinder(d=14.200, h=1.600, $fn=32);
        }
        translate([0, 0, 360.232]) linear_extrude(height=6.000) {
            hull() {
                translate([30.534, 27.264]) circle(d=11.123, $fn=24);
                translate([30.534, 49.337]) circle(d=11.123, $fn=24);
            }
            translate([19.129, 49.337])
                square([22.811, 3.000], center=true);
            translate([7.723, 48.337])
                circle(d=7.000, $fn=28);
        }
        // pad rod for hole 4: hollow tube, pad arm, cup, bridge lug
        difference() {
            translate([-30.534, 27.264, 378.232]) cylinder(d=6.923, h=147.666, $fn=28);
            translate([-30.534, 27.264, 377.232]) cylinder(d=3.808, h=149.666, $fn=28);
        }
        translate([-30.534, 27.264, 387.032]) cylinder(d=9.923, h=2.400, $fn=28);
        translate([-30.534, 27.264, 505.598]) cylinder(d=9.923, h=2.400, $fn=28);
        translate([0, 0, 515.898]) linear_extrude(height=6.000)
            hull() {
                translate([-30.534, 27.264]) circle(d=10.523, $fn=24);
                translate([0, 25.973]) circle(d=9.130, $fn=24);
            }
        translate([0, 24.373, 518.898]) rotate([-90, 0, 0]) rotate([0, 0, 30]) difference() {
            cylinder(d=20.252, h=2.800, $fn=6);
            translate([0, 0, -0.010]) cylinder(d=14.200, h=1.600, $fn=32);
        }
        translate([0, 0, 382.232]) linear_extrude(height=6.000) {
            hull() {
                translate([-30.534, 27.264]) circle(d=11.123, $fn=24);
                translate([-30.534, 49.337]) circle(d=11.123, $fn=24);
            }
            translate([-19.129, 49.337])
                square([22.811, 3.000], center=true);
            translate([-7.723, 48.337])
                circle(d=7.000, $fn=28);
        }
}

module keywork_touch_keys() {
        // touch key for hole 0: hinge tube, bridge foot, plate arm, spring ledge
        difference() {
            union() {
                translate([0, 38.956, 289.082]) cylinder(d=7.761, h=16.300, $fn=32);
                translate([0, 0, 294.232]) linear_extrude(height=6.000)
                    hull() {
                        translate([0, 38.956]) circle(d=7.761, $fn=32);
                        translate([-3.231, 42.237]) circle(d=3.000, $fn=20);
                        translate([-10.231, 42.237]) circle(d=3.000, $fn=20);
                    }
                translate([0, 0, 288.732]) linear_extrude(height=17.000) {
                    hull() {
                        translate([0, 38.956]) circle(d=6.597, $fn=32);
                        translate([12.000, 56.037]) circle(d=4, $fn=20);
                    }
                    translate([12.000, 57.437])
                        square([16.000, 2.800], center=true);
                    translate([7.440, 52.337])
                        square([9.000, 3.000], center=true);
                }
            }
            translate([0, 38.956, 287.732])
                cylinder(d=4.161, h=19.000, $fn=32);
        }
        // touch key for hole 1: hinge tube, bridge foot, plate arm, spring ledge
        difference() {
            union() {
                translate([0, 38.956, 311.082]) cylinder(d=7.761, h=16.300, $fn=32);
                translate([0, 0, 316.232]) linear_extrude(height=6.000)
                    hull() {
                        translate([0, 38.956]) circle(d=7.761, $fn=32);
                        translate([3.231, 42.237]) circle(d=3.000, $fn=20);
                        translate([10.231, 42.237]) circle(d=3.000, $fn=20);
                    }
                translate([0, 0, 310.732]) linear_extrude(height=17.000) {
                    hull() {
                        translate([0, 38.956]) circle(d=6.597, $fn=32);
                        translate([-12.000, 56.037]) circle(d=4, $fn=20);
                    }
                    translate([-12.000, 57.437])
                        square([16.000, 2.800], center=true);
                    translate([-7.440, 52.337])
                        square([9.000, 3.000], center=true);
                }
            }
            translate([0, 38.956, 309.732])
                cylinder(d=4.161, h=19.000, $fn=32);
        }
        // touch key for hole 2: hinge tube, bridge foot, plate arm, spring ledge
        difference() {
            union() {
                translate([0, 38.956, 333.082]) cylinder(d=7.761, h=16.300, $fn=32);
                translate([0, 0, 338.232]) linear_extrude(height=6.000)
                    hull() {
                        translate([0, 38.956]) circle(d=7.761, $fn=32);
                        translate([-3.231, 42.237]) circle(d=3.000, $fn=20);
                        translate([-10.231, 42.237]) circle(d=3.000, $fn=20);
                    }
                translate([0, 0, 332.732]) linear_extrude(height=17.000) {
                    hull() {
                        translate([0, 38.956]) circle(d=6.597, $fn=32);
                        translate([12.000, 56.037]) circle(d=4, $fn=20);
                    }
                    translate([12.000, 57.437])
                        square([16.000, 2.800], center=true);
                    translate([7.440, 52.337])
                        square([9.000, 3.000], center=true);
                }
            }
            translate([0, 38.956, 331.732])
                cylinder(d=4.161, h=19.000, $fn=32);
        }
        // touch key for hole 3: hinge tube, bridge foot, plate arm, spring ledge
        difference() {
            union() {
                translate([0, 38.956, 355.082]) cylinder(d=7.761, h=16.300, $fn=32);
                translate([0, 0, 360.232]) linear_extrude(height=6.000)
                    hull() {
                        translate([0, 38.956]) circle(d=7.761, $fn=32);
                        translate([4.223, 42.237]) circle(d=3.000, $fn=20);
                        translate([11.223, 42.237]) circle(d=3.000, $fn=20);
                    }
                translate([0, 0, 354.732]) linear_extrude(height=17.000) {
                    hull() {
                        translate([0, 38.956]) circle(d=6.597, $fn=32);
                        translate([-12.000, 56.037]) circle(d=4, $fn=20);
                    }
                    translate([-12.000, 57.437])
                        square([16.000, 2.800], center=true);
                    translate([-7.440, 52.337])
                        square([9.000, 3.000], center=true);
                }
            }
            translate([0, 38.956, 353.732])
                cylinder(d=4.161, h=19.000, $fn=32);
        }
        // touch key for hole 4: hinge tube, bridge foot, plate arm, spring ledge
        difference() {
            union() {
                translate([0, 38.956, 377.082]) cylinder(d=7.761, h=16.300, $fn=32);
                translate([0, 0, 382.232]) linear_extrude(height=6.000)
                    hull() {
                        translate([0, 38.956]) circle(d=7.761, $fn=32);
                        translate([-4.223, 42.237]) circle(d=3.000, $fn=20);
                        translate([-11.223, 42.237]) circle(d=3.000, $fn=20);
                    }
                translate([0, 0, 376.732]) linear_extrude(height=17.000) {
                    hull() {
                        translate([0, 38.956]) circle(d=6.597, $fn=32);
                        translate([12.000, 56.037]) circle(d=4, $fn=20);
                    }
                    translate([12.000, 57.437])
                        square([16.000, 2.800], center=true);
                    translate([7.440, 52.337])
                        square([9.000, 3.000], center=true);
                }
            }
            translate([0, 38.956, 375.732])
                cylinder(d=4.161, h=19.000, $fn=32);
        }
}

// Soft parts, shown in place. They print separately in TPU and are NOT part of the body solid.
module keywork_tpu() {
        // TPU for hole 0: pad disc, regulation bumper, leaf spring
        translate([0, 23.773, 163.567]) rotate([-90, 0, 0])
            cylinder(d=14.000, h=2.200, $fn=32);
        translate([-6.731, 44.487, 297.232])
            cube([9.000, 1.500, 7.000], center=true);
        translate([7.440, 45.837, 286.232])
            linear_extrude(height=8.500, center=true)
                polygon([[-3.500, 1.500], [-4.900, -1.500],
                         [4.900, -1.500], [3.500, 1.500]]);
        hull() {
            translate([7.440, 45.404, 288.482])
                cube([8.000, 2.867, 2.000], center=true);
            translate([7.440, 49.404, 297.232])
                cube([8.000, 2.867, 3.000], center=true);
        }
        // TPU for hole 1: pad disc, regulation bumper, leaf spring
        translate([0, 23.773, 373.301]) rotate([-90, 0, 0])
            cylinder(d=14.000, h=2.200, $fn=32);
        translate([6.731, 44.487, 319.232])
            cube([9.000, 1.500, 7.000], center=true);
        translate([-7.440, 45.837, 308.232])
            linear_extrude(height=8.500, center=true)
                polygon([[-3.500, 1.500], [-4.900, -1.500],
                         [4.900, -1.500], [3.500, 1.500]]);
        hull() {
            translate([-7.440, 45.404, 310.482])
                cube([8.000, 2.867, 2.000], center=true);
            translate([-7.440, 49.404, 319.232])
                cube([8.000, 2.867, 3.000], center=true);
        }
        // TPU for hole 2: pad disc, regulation bumper, leaf spring
        translate([0, 23.773, 384.448]) rotate([-90, 0, 0])
            cylinder(d=14.000, h=2.200, $fn=32);
        translate([-6.731, 44.487, 341.232])
            cube([9.000, 1.500, 7.000], center=true);
        translate([7.440, 45.837, 330.232])
            linear_extrude(height=8.500, center=true)
                polygon([[-3.500, 1.500], [-4.900, -1.500],
                         [4.900, -1.500], [3.500, 1.500]]);
        hull() {
            translate([7.440, 45.404, 332.482])
                cube([8.000, 2.867, 2.000], center=true);
            translate([7.440, 49.404, 341.232])
                cube([8.000, 2.867, 3.000], center=true);
        }
        // TPU for hole 3: pad disc, regulation bumper, leaf spring
        translate([0, 23.773, 499.294]) rotate([-90, 0, 0])
            cylinder(d=14.000, h=2.200, $fn=32);
        translate([7.723, 44.487, 363.232])
            cube([9.000, 1.500, 7.000], center=true);
        translate([-7.440, 45.837, 352.232])
            linear_extrude(height=8.500, center=true)
                polygon([[-3.500, 1.500], [-4.900, -1.500],
                         [4.900, -1.500], [3.500, 1.500]]);
        hull() {
            translate([-7.440, 45.432, 354.482])
                cube([8.000, 2.810, 2.000], center=true);
            translate([-7.440, 49.432, 363.232])
                cube([8.000, 2.810, 3.000], center=true);
        }
        // TPU for hole 4: pad disc, regulation bumper, leaf spring
        translate([0, 23.773, 518.898]) rotate([-90, 0, 0])
            cylinder(d=14.000, h=2.200, $fn=32);
        translate([-7.723, 44.487, 385.232])
            cube([9.000, 1.500, 7.000], center=true);
        translate([7.440, 45.837, 374.232])
            linear_extrude(height=8.500, center=true)
                polygon([[-3.500, 1.500], [-4.900, -1.500],
                         [4.900, -1.500], [3.500, 1.500]]);
        hull() {
            translate([7.440, 45.432, 376.482])
                cube([8.000, 2.810, 2.000], center=true);
            translate([7.440, 49.432, 385.232])
                cube([8.000, 2.810, 3.000], center=true);
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
                translate([0, 0, 834.68])
                    linear_extrude(height=349.58 + seam_lap)
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
        translate([0, 19.45, 163.57]) rotate([-90, 0, 0]) {
            hull() {
                cylinder(d=20.20, h=0.5, $fn=24);
                translate([0, 0, 2.50]) cylinder(d=14.60, h=0.8, $fn=24);
            }
            translate([0, 0, 3.30]) rotate_extrude($fn=24) translate([5.65, 0]) circle(d=2.64, $fn=16);
        }
        // Solid self-supporting donut chimney pad embedded 0.5mm into the front wall face
        translate([0, 19.45, 373.30]) rotate([-90, 0, 0]) {
            hull() {
                cylinder(d=20.20, h=0.5, $fn=24);
                translate([0, 0, 2.50]) cylinder(d=14.60, h=0.8, $fn=24);
            }
            translate([0, 0, 3.30]) rotate_extrude($fn=24) translate([5.65, 0]) circle(d=2.64, $fn=16);
        }
        // Solid self-supporting donut chimney pad embedded 0.5mm into the front wall face
        translate([0, 19.45, 384.45]) rotate([-90, 0, 0]) {
            hull() {
                cylinder(d=20.20, h=0.5, $fn=24);
                translate([0, 0, 2.50]) cylinder(d=14.60, h=0.8, $fn=24);
            }
            translate([0, 0, 3.30]) rotate_extrude($fn=24) translate([5.65, 0]) circle(d=2.64, $fn=16);
        }
        // Solid self-supporting donut chimney pad embedded 0.5mm into the front wall face
        translate([0, 19.45, 499.29]) rotate([-90, 0, 0]) {
            hull() {
                cylinder(d=20.20, h=0.5, $fn=24);
                translate([0, 0, 2.50]) cylinder(d=14.60, h=0.8, $fn=24);
            }
            translate([0, 0, 3.30]) rotate_extrude($fn=24) translate([5.65, 0]) circle(d=2.64, $fn=16);
        }
        // Solid self-supporting donut chimney pad embedded 0.5mm into the front wall face
        translate([0, 19.45, 518.90]) rotate([-90, 0, 0]) {
            hull() {
                cylinder(d=20.20, h=0.5, $fn=24);
                translate([0, 0, 2.50]) cylinder(d=14.60, h=0.8, $fn=24);
            }
            translate([0, 0, 3.30]) rotate_extrude($fn=24) translate([5.65, 0]) circle(d=2.64, $fn=16);
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
        translate([0, 0, 163.57]) rotate([-90, 0, 0]) cylinder(d=8.00, h=56.68, center=false, $fn=24);
        translate([0, 0, 373.30]) rotate([-90, 0, 0]) cylinder(d=8.00, h=56.68, center=false, $fn=24);
        translate([0, 0, 384.45]) rotate([-90, 0, 0]) cylinder(d=8.00, h=56.68, center=false, $fn=24);
        translate([0, 0, 499.29]) rotate([-90, 0, 0]) cylinder(d=8.00, h=56.68, center=false, $fn=24);
        translate([0, 0, 518.90]) rotate([-90, 0, 0]) cylinder(d=8.00, h=56.68, center=false, $fn=24);
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
z_cut1 = 1157.05;
z_cut2 = 1221.05;
z_cut3 = 1221.05;

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
