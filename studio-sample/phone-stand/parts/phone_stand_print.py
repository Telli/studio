"""The phone stand as it is printed: on its side, its right-hand face (the stand's -X side) on the plate, so its
profile is the layer and it prints with nothing overhanging. The STL and 3MF here are the files the slicer and the
FDM check read. Origin: the plate's corner under the part; +Z up from the plate."""

from cadgen import build123d as bd
from cadgen import stl, threemf

from phone_stand import phone_stand


@stl(out="phone_stand_print.stl", mesh_tolerance=3e-4, mesh_angular_tolerance=0.2)
@threemf(out="phone_stand_print.3mf", mesh_tolerance=3e-4, mesh_angular_tolerance=0.2)
def phone_stand_print():
    stand = phone_stand()
    on_side = bd.Rot(0, -90, 0) * stand  # the stand's +X becomes up
    low = on_side.bounding_box().min
    printed = bd.Pos(-low.X, -low.Y, -low.Z) * on_side
    printed.label = "phone_stand"
    return printed


if __name__ == "__main__":
    phone_stand_print()
