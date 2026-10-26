"""The base link of the servo mount's robot descriptions (servo_mount.urdf, .srdf and .sdf beside this script): every
part of the mount that does not turn with the horn, as one mesh in the base link's frame. That frame is the
assembly's own: the outside corner of the bracket's bend, halfway along it, +Y out from the wall, +Z up. The parts
are the assembly model's, placed by its mates, so the mesh follows the mount."""

import sys
from pathlib import Path

from cadgen import build123d as bd
from cadgen import stl, threemf

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "assemblies"))  # the mount is a model in ../assemblies

from servo_mount import servo_mount  # noqa: E402

TURNS = "horn_adapter"  # the one part the horn turns: the horn link (horn_link.py)
MESH_TOLERANCE = 1e-2  # coarse: a display mesh for the robot's viewers, kept small (chord, relative to each part's size)
MESH_ANGLE = 0.8  # radians between neighbouring triangles' normals


@threemf(out="meshes/base_link.3mf", mesh_tolerance=MESH_TOLERANCE, mesh_angular_tolerance=MESH_ANGLE)  # the URDF's, in colour
@stl(out="meshes/base_link.stl", mesh_tolerance=MESH_TOLERANCE, mesh_angular_tolerance=MESH_ANGLE)  # the SDF's: Gazebo reads no 3MF
def base_link():
    mount = servo_mount()
    parts = [part for part in mount.children if part.label != TURNS]  # the bracket, the servo's body, its screws, the clip
    return bd.Compound(children=parts, label="base_link")


if __name__ == "__main__":
    base_link()
