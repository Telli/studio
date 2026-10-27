"""The motor plate: a 6061-T6 aluminium plate, CNC milled, that holds a NEMA 17 stepper to a frame. The motor sits
under it, its pilot in the plate's bore and its shaft up through it to a belt pulley, held by four M3 screws whose
heads sit in the pocket on top. Two M5 screws through the slots at its ends fix it to the frame; the slots let it
slide along the belt, so it is pulled back to tension the belt and then clamped. Origin: the centre of its underside,
the face the motor sits on; +X along the belt and the slots, +Z up through the plate to the pulley."""

from cadgen import build123d as bd
from cadgen import step
from cadgen.color import srgb
from cadgen.sketch import Sketch

from sizes import MOTOR_BOLT_PATTERN, MOTOR_PILOT

PLATE_LENGTH = 110.0  # along the belt
PLATE_WIDTH = 56.0
THICKNESS = 6.0
CORNER = 5.0  # the outline's corners
PILOT_CLEARANCE = 0.2  # across the motor's pilot, so it drops in
PILOT_BORE = MOTOR_PILOT + PILOT_CLEARANCE
SCREW_CLEARANCE = 3.4  # M3, ISO 273 medium
POCKET_SIZE = 46.0  # square, round the motor's four screw heads
POCKET_DEPTH = 3.0  # leaves a 3 mm floor under the screw heads
POCKET_CORNER = 5.0  # the pocket's inside corners: over the 6 mm cutter's 3 mm radius
SLOT_WIDTH = 5.5  # M5, ISO 273 medium
SLOT_LENGTH = 10.0  # the belt's tensioning travel: between the centres of each slot's two ends
SLOT_SPACING = 80.0  # between the two slots' middles, along the belt
CHAMFER = 0.5  # the outline's top and bottom edges


@step
def motor_plate():
    outline = Sketch("Outline", plane="Top")
    bottom, right, top, left = outline.center_rectangle(outline.origin, (PLATE_LENGTH / 2, PLATE_WIDTH / 2))
    outline.length(bottom, PLATE_LENGTH)
    outline.length(left, PLATE_WIDTH)
    outline.fillet(bottom, right, CORNER)
    outline.fillet(right, top, CORNER)
    outline.fillet(top, left, CORNER)
    outline.fillet(left, bottom, CORNER)
    plate = bd.extrude(outline.face(), amount=THICKNESS)

    pocket = Sketch("Pocket", plane="Top", offset=THICKNESS)
    p_bottom, p_right, p_top, p_left = pocket.center_rectangle(pocket.origin, (POCKET_SIZE / 2, POCKET_SIZE / 2))
    pocket.length(p_bottom, POCKET_SIZE)
    pocket.length(p_left, POCKET_SIZE)
    pocket.fillet(p_bottom, p_right, POCKET_CORNER)
    pocket.fillet(p_right, p_top, POCKET_CORNER)
    pocket.fillet(p_top, p_left, POCKET_CORNER)
    pocket.fillet(p_left, p_bottom, POCKET_CORNER)
    plate -= bd.extrude(pocket.face(), amount=-POCKET_DEPTH)

    bore = Sketch("Pilot bore", plane="Top")
    pilot = bore.circle(bore.origin, PILOT_BORE / 2)
    bore.diameter(pilot, PILOT_BORE)
    plate -= bd.extrude(bore.face(), amount=plate.bounding_box().diagonal)

    screws = Sketch("Motor screw holes", plane="Top")
    hole1 = screws.circle((-MOTOR_BOLT_PATTERN / 2, -MOTOR_BOLT_PATTERN / 2), SCREW_CLEARANCE / 2)
    screws.diameter(hole1, SCREW_CLEARANCE)
    screws.horizontal_distance(hole1.center, screws.origin, MOTOR_BOLT_PATTERN / 2)
    screws.vertical_distance(hole1.center, screws.origin, MOTOR_BOLT_PATTERN / 2)
    (hole2,) = screws.linear_pattern([hole1], along=0, spacing=MOTOR_BOLT_PATTERN, count=2)
    screws.linear_pattern([hole1, hole2], along=90, spacing=MOTOR_BOLT_PATTERN, count=2)
    plate -= bd.extrude(screws.faces(), amount=plate.bounding_box().diagonal)  # M3 clearance, ISO 273 medium

    slots = Sketch("Belt slots", plane="Top")
    end1 = slots.point(-SLOT_SPACING / 2 - SLOT_LENGTH / 2, 0)
    end2 = slots.point(-SLOT_SPACING / 2 + SLOT_LENGTH / 2, 0)
    slots.slot(end1, end2, SLOT_WIDTH / 2)
    slots.horizontal_distance(end1, end2, SLOT_LENGTH)
    slots.horizontal_distance(end2, slots.origin, SLOT_SPACING / 2 - SLOT_LENGTH / 2)
    end3 = slots.point(SLOT_SPACING / 2 - SLOT_LENGTH / 2, 0)
    end4 = slots.point(SLOT_SPACING / 2 + SLOT_LENGTH / 2, 0)
    slots.slot(end3, end4, SLOT_WIDTH / 2)
    slots.horizontal_distance(end3, end4, SLOT_LENGTH)
    slots.horizontal_distance(slots.origin, end3, SLOT_SPACING / 2 - SLOT_LENGTH / 2)
    plate -= bd.extrude(slots.faces(), amount=plate.bounding_box().diagonal)  # M5 clearance, ISO 273 medium

    plate = bd.chamfer(
        plate.faces().sort_by(bd.Axis.Z)[-1].outer_wire().edges() + plate.faces().sort_by(bd.Axis.Z)[0].outer_wire().edges(),
        length=CHAMFER,
    )

    plate.color = srgb("#B9C0C8")
    plate.label = "motor_plate"
    return plate


if __name__ == "__main__":
    motor_plate()
