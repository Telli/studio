"""The servo bracket's cut file: its flat pattern as a DXF, ready to laser or waterjet cut, with the bend line on a layer
of its own. The outline is the flat pattern's outside face (servo_bracket_flat.py), moved down onto the XY plane so it
keeps the flat pattern's own coordinates: the holes stay circles, the corners arcs, and the bend's centre stays on Y = 0.
The bend line marks that centre and runs right across the blank, as SendCutSend asks of a bend line in a DXF. Drawn at
true size: the cutter's own kerf compensation applies."""

from cadgen import build123d as bd
from cadgen import dxf, flatten

from servo_bracket import THICKNESS, WIDTH
from servo_bracket_flat import servo_bracket_flat

KERF = 0.0  # true size


@dxf(out="../cut/servo_bracket_cut.dxf")
def servo_bracket_cut():
    outside = flatten.planar_faces(
        servo_bracket_flat(), normal_axis="z", normal_sign=1.0, coordinate_axis="z", coordinate=THICKNESS
    )
    outline = flatten.offset_profile(flatten.union_faces([bd.Location((0, 0, -THICKNESS)) * face for face in outside]), KERF)
    bend = bd.Edge.make_line((-WIDTH / 2, 0), (WIDTH / 2, 0))  # the bend's centre line, edge to edge
    return {"CUT": outline, "BEND": bend}


if __name__ == "__main__":
    servo_bracket_cut()
