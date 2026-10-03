# A little house for the sync box

![the house](preview.png)

The family's data lives in it, so it's a house:
- the USB cable comes in through the **front door**, up the porch steps
- the board's RGB LED glows warm through the **round attic window** while the box is ready, and flashes when a phone saves (see [the light](../README.md#the-light))
- the four-pane **side windows**, the **chimney** and the **heart** in the back wall are the vents
- "family hustle" is engraved on the roof

It's about 36 × 87 × 51 mm, the size of a small box of matches standing on its end, and it comes in two parts:

| part | prints | about |
| --- | --- | --- |
| `body` | standing on its floor | 33 × 87 × 28 mm |
| `roof` | standing on its open bottom | 36 × 83 × 26 mm |

Neither needs supports. The roof is pitched at 45° for exactly that reason.

![inside](cutaway.png)

Inside, the board sits on two ribs between its rows of pins, and a stop behind it takes the push when the cable goes in. The roof slips over a lip at the top of the walls, so it needs no screws.

## Measure your board first

The defaults are for an **ESP32-S3-DevKitC-1 with pin headers soldered on**. Boards sold as "N16R8" vary, so check these with a ruler or calipers and change them at the top of `house.scad`:

| setting | what | default |
| --- | --- | --- |
| `board_l` | length of the board, port end to antenna end | 69.0 |
| `board_w` | width | 25.4 |
| `under` | room under the board; **3** if it has no pins soldered on | 9.5 |
| `usb_x` | how far the port **you plug into** is from the board's centre line, in mm, + to the right looking at the port end | 0 |

`usb_x` matters most. Many of these boards have **two** USB-C ports side by side, and the door is only big enough for one plug. Use the port the box was flashed through: on a DevKitC it's the one labelled **USB**, not UART.

## Print

```bash
openscad -D 'part="body"' -o body.stl house.scad
openscad -D 'part="roof"' -o roof.stl house.scad
```

PLA is fine; the board runs warm, not hot. Use a 0.2 mm layer height and a 0.4 mm nozzle, with no supports and no brim. Print each part the way it comes out of OpenSCAD: the body on its floor, the roof on its open bottom.

A lighter colour for the roof lets the LED glow through it as well as the window.

## Put it together

1. Lower the board in, pins down, with the USB port towards the door, and slide it forward until the port sits in the doorway.
2. Plug the cable in through the door.
3. Press the roof on.

If the roof is too tight, raise `lid_gap` by 0.05 and print the roof again. If it's too loose, lower it. The body doesn't need reprinting.
