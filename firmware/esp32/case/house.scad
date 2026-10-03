// Family hustle sync box — a little house for the ESP32.
//
// The family's data lives in it, so it is a house: the USB cable comes in
// through the front door, the side windows and the chimney are the vents,
// and the board's RGB LED glows through the round attic window.
//
// Two parts, both printed without supports:
//   body — floor, walls, porch steps; printed standing on its floor
//   roof — gables, roof, chimney; printed standing on its open bottom
//
//   openscad -D 'part="body"' -o body.stl house.scad
//   openscad -D 'part="roof"' -o roof.stl house.scad
//
// The board's numbers below are the black ESP32-S3 N16R8 board with two
// USB-C ports (28 mm wide, 63 mm end to end with the ports and antenna), no
// pin headers soldered, plugged in by its USB-JTAG port. Measure yours (see
// README.md) — a millimetre matters here.

part = "assembly";  // assembly | body | roof | board

/* [Board] */
board_l = 63.0;     // along the side with the USB port at one end
board_w = 28.0;
pcb_t = 1.6;
// room under the board for pin headers; 3 if yours has none soldered
under = 3;
// room above the board for the module, ports and LED
above = 12;
// the USB-C port you use, measured from the board's centre line (+ = right
// when looking at the port end, components up). This board's USB-JTAG port
// is on the left; its COM port, at +6, is not used.
usb_x = -6.0;
// a second port beside it, which overhangs the board's edge like the first
// and so gets a pocket inside the front wall; 0 for none
other_usb_x = 6.0;
usb_w = 9.0;        // USB-C receptacle
usb_h = 3.2;

/* [Fit] */
wall = 2.6;
floor_t = 2.0;
clearance = 0.3;    // around the board
tongue_t = 1.2;     // the lip the roof slips over
tongue_h = 3.0;
lid_gap = 0.25;     // per side, between lip and roof; more if it is too tight

/* [Look] */
eave = 2.5;         // how far the roof overhangs
roof_t = 2.0;
label = "family hustle";

$fn = 64;
eps = 0.01;

// ---- derived ---------------------------------------------------------------

inner_w = board_w + 2 * clearance;
// front clearance, the board, then a stop post behind it
stop_d = 2.0;
inner_l = clearance + board_l + 0.5 + stop_d + 0.7;
W = inner_w + 2 * wall;
L = inner_l + 2 * wall;
H = floor_t + under + pcb_t + above;

pcb_z = floor_t + under;              // underside of the board
board_y0 = wall + clearance;          // the port end of the board
usb_z = pcb_z + pcb_t + usb_h / 2;    // centre of the port

// the door is sized for a cable's plug (about 12 x 7), not just the port:
// the arch's centre sits just above the port, so the plug's top corners
// clear the curve
door_w = 13;
door_r = door_w / 2;
door_bottom = usb_z - 4.5;
door_top = usb_z + 1 + door_r;

ring_h = tongue_h + 0.4;
RW = W + 2 * eave;                    // roof width at the eaves
RL = L + 2 * eave;
rise = RW / 2;                        // 45 degrees: prints without support

// ---- body ------------------------------------------------------------------

module arch(w, bottom, top) {
  // a door or window shape in XZ: straight sides, round top
  r = w / 2;
  translate([-w / 2, bottom]) square([w, top - r - bottom]);
  translate([0, top - r]) circle(r = r);
}

module door_shape() {
  translate([usb_x, 0]) arch(door_w, door_bottom, door_top);
}

module heart(s) {
  // a heart about s wide, in XY
  scale(s / 10) translate([0, -3]) rotate(45) {
    square(6, center = false);
    translate([3, 6]) circle(3);
    translate([6, 3]) circle(3);
  }
}

module four_pane_window(w) {
  // cut out as four panes, leaving the cross between them
  bar = 1.2;
  p = (w - bar) / 2;
  for (i = [0, 1], j = [0, 1])
    translate([i * (p + bar), j * (p + bar)]) square(p);
}

module steps() {
  // up to the door, only as high as it needs to be
  n = max(0, floor(door_bottom / 3.4));
  if (n > 0)
    for (i = [0 : n - 1]) {
      h = door_bottom * (i + 1) / n;
      d = 3.2 * (n - i);
      translate([usb_x - door_w / 2 - 1.5, -d, 0]) cube([door_w + 3, d + eps, h]);
    }
}

module body() {
  difference() {
    union() {
      translate([-W / 2, 0, 0]) cube([W, L, H]);
      // the lip the roof slips over
      translate([-(inner_w / 2 + tongue_t), wall - tongue_t, H - eps])
        difference() {
          cube([inner_w + 2 * tongue_t, inner_l + 2 * tongue_t, tongue_h]);
          translate([tongue_t, tongue_t, -1]) cube([inner_w, inner_l, tongue_h + 2]);
        }
      steps();
      // a frame around the door, standing proud of the wall
      translate([0, eps, 0]) rotate([90, 0, 0])
        linear_extrude(0.8) difference() {
          offset(r = 1.4) door_shape();
          door_shape();
        }
    }

    // inside
    translate([-inner_w / 2, wall, floor_t]) cube([inner_w, inner_l, H]);

    // a pocket inside the front wall for the port that is not used, whose
    // overhang would otherwise stop the board sitting against the wall
    if (other_usb_x != 0)
      translate([other_usb_x - (usb_w + 1) / 2, wall - 0.8, pcb_z + pcb_t - 0.3])
        cube([usb_w + 1, 0.8 + eps, usb_h + 0.8]);

    // the door, through the wall, the frame and the top step
    translate([0, wall + 1, 0]) rotate([90, 0, 0])
      linear_extrude(wall + 4) door_shape();

    // windows: two each side, four panes each
    ww = 9;
    for (side = [-1, 1], f = [0.32, 0.72])
      translate([side * (W / 2), L * f - ww / 2, H * 0.62 - ww / 2])
        rotate([90, 0, 90])
          linear_extrude(2 * wall + 4, center = true) four_pane_window(ww);

    // a heart in the back wall
    translate([0, L + 1, H * 0.55]) rotate([90, 0, 0])
      linear_extrude(wall + 2) heart(9);
  }

  // window sills
  ww = 9;
  for (side = [-1, 1], f = [0.32, 0.72])
    translate([side * (W / 2) + (side > 0 ? 0 : -1), L * f - ww / 2 - 1, H * 0.62 - ww / 2 - 1.2])
      cube([1, ww + 2, 1.2]);

  // inside: two ribs between the pin rows hold the board up...
  rib_w = min(16, board_w - 8);
  for (y = [board_y0 + 4, board_y0 + board_l - 6])
    translate([-rib_w / 2, y, floor_t - eps]) cube([rib_w, 3, under + eps]);
  // ...and a stop behind it takes the push of plugging the cable in
  translate([-rib_w / 2, board_y0 + board_l + 0.5, floor_t - eps])
    cube([rib_w, stop_d, under + pcb_t + 2]);
}

// ---- roof ------------------------------------------------------------------

module gable_profile(inset = 0) {
  // the roof's triangle in XZ, smaller by `inset` measured square to the slope
  d = inset * sqrt(2);
  polygon([[-RW / 2 + d, 0], [RW / 2 - d, 0], [0, rise - d]]);
}

function slope_z(x) = ring_h + rise - abs(x);  // the outer roof surface

module roof() {
  ch = 7;             // chimney
  cx = RW / 4 + 1;
  cy = L * 0.68;
  difference() {
    union() {
      // a ring that sits on the walls, around the lip
      difference() {
        translate([-W / 2, 0, 0]) cube([W, L, ring_h]);
        translate([-(inner_w / 2 + tongue_t + lid_gap), wall - tongue_t - lid_gap, -1])
          cube([inner_w + 2 * (tongue_t + lid_gap), inner_l + 2 * (tongue_t + lid_gap), ring_h + 2]);
      }
      // the roof itself, overhanging all round
      translate([0, -eave, ring_h]) rotate([-90, 0, 0])
        mirror([0, 1, 0]) linear_extrude(RL) gable_profile();
      // chimney, rising from the slope
      translate([cx - ch / 2, cy - ch / 2, slope_z(cx + ch / 2) - 0.2])
        cube([ch, ch, ring_h + rise - slope_z(cx + ch / 2) + 4.5]);
      translate([cx - ch / 2 - 0.8, cy - ch / 2 - 0.8, ring_h + rise + 2.8])
        cube([ch + 1.6, ch + 1.6, 1.7]);
    }

    // hollow it out, all along under the slopes...
    translate([0, -eave - 1, ring_h - eps]) rotate([-90, 0, 0])
      mirror([0, 1, 0]) linear_extrude(RL + 2) gable_profile(roof_t);
    // ...and through the ring into the house
    translate([-inner_w / 2, wall, -1]) cube([inner_w, inner_l, ring_h + 2]);

    // chimney flue, into the roof space: a vent
    translate([cx - 2, cy - 2, ring_h]) cube([4, 4, rise + 10]);

    // round attic window at the front, a vent at the back
    for (y = [-1, L - wall - 1])
      translate([0, y, ring_h + rise * 0.38]) rotate([-90, 0, 0])
        cylinder(r = y < 0 ? 3.6 : 2.4, h = wall + 2);

    // the name, engraved in the left slope
    translate([-RW / 4, L / 2, ring_h + rise - RW / 4])
      multmatrix([[0, 1 / sqrt(2), -1 / sqrt(2), 0],
                  [-1, 0, 0, 0],
                  [0, 1 / sqrt(2), 1 / sqrt(2), 0],
                  [0, 0, 0, 1]])
        translate([0, 0, -0.6])
          linear_extrude(2)
            text(label, size = 4.6, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
  }

  // the gable ends: the front and back walls carried up into the roof
  difference() {
    for (y = [0, L - wall])
      translate([0, y, ring_h]) rotate([-90, 0, 0]) mirror([0, 1, 0])
        linear_extrude(wall) intersection() {
          gable_profile(roof_t - eps);
          translate([-W / 2, 0]) square([W, rise]);
        }
    for (y = [-1, L - wall - 1])
      translate([0, y, ring_h + rise * 0.38]) rotate([-90, 0, 0])
        cylinder(r = y < 0 ? 3.6 : 2.4, h = wall + 2);
  }
  // a frame round the attic window
  translate([0, eps, ring_h + rise * 0.38]) rotate([90, 0, 0])
    difference() {
      cylinder(r = 4.8, h = 0.8);
      translate([0, 0, -1]) cylinder(r = 3.6, h = 3);
    }
}

// ---- the board, for checking the fit ---------------------------------------

module board() {
  translate([-board_w / 2, board_y0, pcb_z]) {
    color("#1d5c3a") cube([board_w, board_l, pcb_t]);
    // module with its shield
    color("silver") translate([board_w / 2 - 9, board_l - 25.5, pcb_t]) cube([18, 25.5, 3.1]);
    // USB-C ports, overhanging the edge a little
    for (x = other_usb_x == 0 ? [usb_x] : [usb_x, other_usb_x])
      color("gainsboro") translate([board_w / 2 + x - usb_w / 2, -0.6, pcb_t]) cube([usb_w, 7.4, usb_h]);
    // pin headers underneath, if there is room for them
    if (under > 8)
      color("#222") for (x = [1.27, board_w - 1.27])
        translate([x - 1.27, 6, -8.5]) cube([2.54, board_l - 12, 8.5]);
  }
}

// ---- what to show ------------------------------------------------------------

if (part == "body") body();
else if (part == "roof") roof();
else if (part == "board") board();
else if (part == "assembly") {
  color("#f3d9c4") body();
  color("#c8553d") translate([0, 0, H]) roof();
  board();
}
