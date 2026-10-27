"""The desk lamp: the base with the steel weight bonded into its pocket, the arm on the base's clevis, the head on the
arm's upper end, and the LED module screwed into the head. Both hinges are an ISO 4762 M5 x 30 socket head screw and an
M5 nylon insert locknut (both from step.parts) through two cheeks that clamp the arm, so each holds where it is set.
Each part is placed by its mates, solved on every run, at the rest pose: the arm 55 degrees up from the desk and the
head hanging level. `tilt` turns the arm on the base and `head` the head on the arm, through the range the fit check
finds clear (assemblies/desk_lamp_fit.md); the `range` clip runs each through that range for the motion video."""

import math
import sys
from pathlib import Path

import cadgen
from cadgen import build123d as bd
from cadgen import read_step, step
from cadgen.mates import Coincident, Concentric, Distance, mate

PARTS = Path(__file__).resolve().parent.parent / "parts"
sys.path.insert(0, str(PARTS))  # the parts are models in ../parts, built and linked here as children

from arm import arm  # noqa: E402
from base import CLEVIS_X, HEIGHT, HINGE_HEIGHT, POCKET_CLEARANCE, base  # noqa: E402
from head import BOSS, PILOT, SHADE_FROM_HINGE, head  # noqa: E402
from led_module import led_module  # noqa: E402
from sizes import ARM_LENGTH, CHEEK, CHEEK_GAP, HINGE_HOLE, LED_SCREW_HOLE, TONGUE, WEIGHT_DIAMETER, WEIGHT_THICKNESS  # noqa: E402
from weight import weight  # noqa: E402

HINGE_SCREW = PARTS / "imported" / "iso4762_socket_head_cap_screw_m5x30.step"  # step.parts: iso4762_socket_head_cap_screw_m5x30
LOCKNUT = PARTS / "imported" / "nylon_locknut_m5_simple.step"  # step.parts: nylon_locknut_m5_simple
LED_SCREW = PARTS / "imported" / "iso4762_socket_head_cap_screw_m3x8.step"  # step.parts: iso4762_socket_head_cap_screw_m3x8

ARM_REST = 55.0  # the arm's angle up from the desk at rest
SIDE_PLAY = (CHEEK_GAP - TONGUE) / 2  # between the arm and each cheek before the screw closes them up
BASE_HINGE = (CLEVIS_X, 0.0, HEIGHT + HINGE_HEIGHT)  # the base hinge's axis, along Y
HEAD_HINGE = (
    CLEVIS_X + ARM_LENGTH * math.cos(math.radians(ARM_REST)),
    0.0,
    HEIGHT + HINGE_HEIGHT + ARM_LENGTH * math.sin(math.radians(ARM_REST)),
)  # the head hinge's axis, along Y
UP = (0, -1, 0)  # both hinges turn about -Y, so a positive angle lifts the arm, or the head's front

# The hinges' clear range, from the fit check's sweeps (assemblies/desk_lamp_fit.md), rounded in to whole 5 degrees.
TILT_LIMITS = (-45.0, 135.0)
HEAD_LIMITS = (-45.0, 175.0)
RANGE_SECONDS = 12.0  # the range clip: the arm through its range in the first half, then the head in the second

KINEMATICS = {
    "mates": [
        cadgen.revolute("tilt", parent="#base", child="#arm_assembly", origin=BASE_HINGE, direction=UP, limits=TILT_LIMITS),
        cadgen.revolute("head", parent="#arm_assembly", child="#head_assembly", origin=HEAD_HINGE, direction=UP, limits=HEAD_LIMITS),
    ],
}

ARM_PARTS = ["arm", "m5x30_screw:head_hinge", "m5_locknut:head_hinge"]
HEAD_PARTS = ["head", "led_module", "m3x8_screw:left", "m3x8_screw:right"]

# Each hinge swung from its rest to one end of its range, back through rest to the other end, and back, as the
# `tilt` and `head` mates allow. The head's parts turn on the head's hinge first, then ride the arm.
ANIMATION = f"""
const T = {RANGE_SECONDS};
const swing = (s, lo, hi) => (s >= 0 ? s * hi : -s * lo);
export const clips = {{
  range: {{
    label: "Arm, then head, through their range",
    duration: T,
    update(t, m) {{
      const half = T / 2;
      const tilt = t < half ? swing(Math.sin(2 * Math.PI * t / half), {TILT_LIMITS[0]}, {TILT_LIMITS[1]}) : 0;
      const head = t < half ? 0 : swing(Math.sin(2 * Math.PI * (t - half) / half), {HEAD_LIMITS[0]}, {HEAD_LIMITS[1]});
      for (const label of {HEAD_PARTS}) {{
        m.get(label).rotate({list(UP)}, head, {list(HEAD_HINGE)}).rotate({list(UP)}, tilt, {list(BASE_HINGE)});
      }}
      for (const label of {ARM_PARTS}) {{
        m.get(label).rotate({list(UP)}, tilt, {list(BASE_HINGE)});
      }}
    }},
  }},
}};
"""


def at_y(faces, y: float):
    """The one face of `faces` whose centre is at `y`."""
    (face,) = [face for face in faces if abs(face.center().Y - y) < 1e-3]
    return face


def round_faces(part, radius: float):
    return part.faces().filter_by(bd.GeomType.CYLINDER).filter_by(lambda face: abs(face.radius - radius) < 1e-3)


@step(kinematics=KINEMATICS, animation=ANIMATION)
def desk_lamp():
    inner, outer = CHEEK_GAP / 2, CHEEK_GAP / 2 + CHEEK  # a cheek's faces, out from the middle of its hinge

    lamp_base = base()
    clevis_holes = round_faces(lamp_base, HINGE_HOLE / 2)
    clevis_sides = lamp_base.faces().filter_by(bd.Axis.Y)
    pocket = round_faces(lamp_base, (WEIGHT_DIAMETER + POCKET_CLEARANCE) / 2)[0]
    pocket_ceiling = at_z(lamp_base.faces().filter_by(bd.Axis.Z), WEIGHT_THICKNESS)

    steel = weight()
    mate(steel, Concentric(round_faces(steel, WEIGHT_DIAMETER / 2)[0], pocket), Coincident(steel.faces().sort_by(bd.Axis.Z)[-1], pocket_ceiling))

    lamp_arm = bd.Pos(*BASE_HINGE) * bd.Rot(0, -ARM_REST, 0) * arm()  # placed near its mates, turned to the rest pose
    arm_holes = round_faces(lamp_arm, HINGE_HOLE / 2).sort_by(bd.Axis.X)
    arm_side = lamp_arm.faces().filter_by(bd.Axis.Y).sort_by(bd.Axis.Y)[-1]
    mate(lamp_arm, Concentric(arm_holes[0], clevis_holes[0]), Distance(arm_side, at_y(clevis_sides, inner), SIDE_PLAY))
    arm_holes = round_faces(lamp_arm, HINGE_HOLE / 2).sort_by(bd.Axis.X)
    arm_side = lamp_arm.faces().filter_by(bd.Axis.Y).sort_by(bd.Axis.Y)[-1]

    lamp_head = bd.Pos(*HEAD_HINGE) * head()  # hanging level, as the rest pose has it
    head_holes = round_faces(lamp_head, HINGE_HOLE / 2)
    mate(lamp_head, Concentric(head_holes[0], arm_holes[-1]), Distance(at_y(lamp_head.faces().filter_by(bd.Axis.Y), inner), arm_side, SIDE_PLAY))
    head_holes = round_faces(lamp_head, HINGE_HOLE / 2)
    yoke_sides = lamp_head.faces().filter_by(bd.Axis.Y)

    hinges = []
    for name, axis, holes, sides in (("base_hinge", BASE_HINGE, clevis_holes, clevis_sides), ("head_hinge", HEAD_HINGE, head_holes, yoke_sides)):
        x, _, z = axis
        screw = bd.Pos(x, outer, z) * bd.Rot(-90, 0, 0) * read_step(HINGE_SCREW)  # its shank along -Y, its head on the +Y cheek
        shank = round_faces(screw, 2.5)[0]  # M5
        head_underside = at_y(screw.faces().filter_by(bd.Axis.Y), outer)
        mate(screw, Concentric(shank, holes[0]), Coincident(head_underside, at_y(sides, outer)))
        screw.label = f"m5x30_screw:{name}"

        nut = bd.Pos(x, -outer, z) * bd.Rot(90, 0, 0) * read_step(LOCKNUT)  # its bearing face toward +Y, against the -Y cheek
        bore = nut.faces().filter_by(bd.GeomType.CYLINDER)[0]
        mate(nut, Concentric(bore, holes[0]), Coincident(at_y(nut.faces().filter_by(bd.Axis.Y), -outer), at_y(sides, -outer)))
        nut.label = f"m5_locknut:{name}"
        hinges.append((screw, nut))

    boss_end = math.pi * ((BOSS / 2) ** 2 - (PILOT / 2) ** 2)  # each boss's end, round its pilot hole
    bosses = lamp_head.faces().filter_by(bd.Axis.Z).filter_by(lambda face: abs(face.area - boss_end) < 1e-2).sort_by(bd.Axis.X)
    pilots = round_faces(lamp_head, PILOT / 2).sort_by(bd.Axis.X)
    boss_z = bosses[0].center().Z
    led = bd.Pos(HEAD_HINGE[0] + SHADE_FROM_HINGE, 0, boss_z) * bd.Rot(180, 0, 0) * led_module()  # its emitter down, out of the shade
    led_holes = round_faces(led, LED_SCREW_HOLE / 2).sort_by(bd.Axis.X)
    mate(led, Coincident(led.faces().filter_by(bd.Axis.Z).sort_by(bd.Axis.Z)[-1], bosses[0]), Concentric(led_holes[0], pilots[0]), Concentric(led_holes[-1], pilots[-1]))
    led_holes = round_faces(led, LED_SCREW_HOLE / 2).sort_by(bd.Axis.X)
    led_front = led.faces().filter_by(bd.Axis.Z).sort_by(bd.Axis.Z)[1]

    led_screws = []
    for side, hole in zip(("left", "right"), led_holes):
        screw = bd.Pos(hole.center().X, 0, led_front.center().Z) * bd.Rot(180, 0, 0) * read_step(LED_SCREW)  # its head under the board, its shank up into the boss
        shank = round_faces(screw, 1.5)[0]  # M3
        mate(screw, Concentric(shank, hole), Coincident(at_z(screw.faces().filter_by(bd.Axis.Z), led_front.center().Z), led_front))
        screw.label = f"m3x8_screw:{side}"
        led_screws.append(screw)

    (base_screw, base_nut), (head_screw, head_nut) = hinges
    head_assembly = bd.Compound(children=[lamp_head, led, *led_screws], label="head_assembly")
    arm_assembly = bd.Compound(children=[lamp_arm, head_screw, head_nut, head_assembly], label="arm_assembly")
    return bd.Compound(children=[lamp_base, steel, base_screw, base_nut, arm_assembly], label="desk_lamp")


def at_z(faces, z: float):
    """The one face of `faces` whose centre is at height `z`."""
    (face,) = [face for face in faces if abs(face.center().Z - z) < 1e-3]
    return face


if __name__ == "__main__":
    desk_lamp()
