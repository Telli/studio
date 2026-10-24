"""The horn link of the servo mount's robot descriptions (servo_mount.urdf, .srdf and .sdf beside this script): the
horn adapter, the one part that turns with the servo's output, as a mesh in the horn link's frame. That frame sits on
the output axis at the top of the spline, where the adapter's bore seats, with the assembly's axes; the horn joint
turns it about its +Z."""

import sys
from pathlib import Path

from cadgen import build123d as bd
from cadgen import stl, threemf

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "assemblies"))  # the mount is a model in ../assemblies

from servo_mount import HORN_AXIS, servo_mount  # noqa: E402
from sizes import SERVO_HEIGHT, SERVO_TAB_HEIGHT  # noqa: E402

SPLINE_TOP = SERVO_HEIGHT - SERVO_TAB_HEIGHT  # above the shelf's top, where the servo's tabs sit
MESH_TOLERANCE = 1e-2  # coarse: a display mesh for the robot's viewers, kept small (chord, relative to each part's size)
MESH_ANGLE = 0.8  # radians between neighbouring triangles' normals


@threemf(out="meshes/horn_link.3mf", mesh_tolerance=MESH_TOLERANCE, mesh_angular_tolerance=MESH_ANGLE)  # the URDF's, in colour
@stl(out="meshes/horn_link.stl", mesh_tolerance=MESH_TOLERANCE, mesh_angular_tolerance=MESH_ANGLE)  # the SDF's: Gazebo reads no 3MF
def horn_link():
    mount = servo_mount()
    adapter = next(part for part in mount.children if part.label == "horn_adapter")
    adapter = bd.Pos(-HORN_AXIS[0], -HORN_AXIS[1], -SPLINE_TOP) * adapter
    return bd.Compound(children=[adapter], label="horn_link")


if __name__ == "__main__":
    horn_link()
