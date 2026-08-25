// Tone-hole chimney donuts, display-only render
$fn = 24;
difference() {
    union() {
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
    }
        translate([0, 0, 163.57]) rotate([-90, 0, 0]) cylinder(d=8.00, h=56.68, center=false, $fn=24);
        translate([0, 0, 373.30]) rotate([-90, 0, 0]) cylinder(d=8.00, h=56.68, center=false, $fn=24);
        translate([0, 0, 384.45]) rotate([-90, 0, 0]) cylinder(d=8.00, h=56.68, center=false, $fn=24);
        translate([0, 0, 499.29]) rotate([-90, 0, 0]) cylinder(d=8.00, h=56.68, center=false, $fn=24);
        translate([0, 0, 518.90]) rotate([-90, 0, 0]) cylinder(d=8.00, h=56.68, center=false, $fn=24);
}
