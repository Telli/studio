"""A plate with a grid of through holes and chamfered vertical edges."""
import build123d as bd
from cadgen import model


@model
def plate():
    with bd.BuildPart() as part:
        bd.Box(40, 30, 5)
        with bd.GridLocations(28, 18, 2, 2):
            bd.Hole(2)
        bd.chamfer(part.edges().filter_by(bd.Axis.Z), length=1)
    return part.part


if __name__ == "__main__":
    plate()
