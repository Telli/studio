"""A box with a through hole, vertical edges filleted."""
import build123d as bd
from cadgen import model


@model
def widget():
    with bd.BuildPart() as part:
        bd.Box(10, 10, 5)
        with bd.Locations((0, 0, 5)):
            bd.Hole(radius=1)
        bd.fillet(part.edges().filter_by(bd.Axis.Z), radius=0.5)
    return part.part


if __name__ == "__main__":
    widget()
