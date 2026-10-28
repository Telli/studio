"""A full revolve of a profile drawn on XZ."""
import build123d as bd
from cadgen import model


@model
def knob():
    with bd.BuildPart() as part:
        with bd.BuildSketch(bd.Plane.XZ):
            with bd.Locations((6, 4)):
                bd.Rectangle(4, 8)
        bd.revolve(axis=bd.Axis.Z, revolution_arc=360)
    return part.part


if __name__ == "__main__":
    knob()
