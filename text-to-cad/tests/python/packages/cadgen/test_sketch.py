"""Constrained 2D sketches (``cadgen.sketch``): solved from their relations and dimensions, as
defined as a CAD tool says, and made into faces on their plane."""

from __future__ import annotations

import math
import unittest

import build123d as B

from cadgen.sketch import Sketch, SketchError


def plate(length=70.0, width=25.0, hole=8.0):
    s = Sketch("Sketch1", plane="Top")
    bottom, right, top, left = s.rectangle((0, 0), (60, 20))
    s.coincident(bottom.start, s.origin)
    s.length(bottom, length)
    s.length(left, width)
    circle = s.circle((30, 10), 3)
    s.diameter(circle, hole)
    s.horizontal_distance(bottom.start, circle.center, length / 2)
    s.vertical_distance(bottom.start, circle.center, width / 2)
    return s, bottom, right, top, left, circle


class Solving(unittest.TestCase):
    def test_a_dimensioned_plate_is_fully_defined_and_solved_where_its_sizes_put_it(self):
        s, bottom, right, top, left, circle = plate()
        self.assertEqual((s.status, s.dof), ("Fully defined", 0))
        self.assertAlmostEqual(top.end.x, 0.0, places=6)
        self.assertAlmostEqual(right.end.x, 70.0, places=6)
        self.assertAlmostEqual(right.end.y, 25.0, places=6)
        self.assertAlmostEqual(circle.radius, 4.0, places=6)
        self.assertAlmostEqual(circle.center.x, 35.0, places=6)

    def test_a_changed_size_moves_what_depends_on_it(self):
        s, *_, circle = plate(length=90.0)
        s.solve()
        self.assertAlmostEqual(circle.center.x, 45.0, places=6)

    def test_what_no_dimension_fixes_is_left_free_and_counted(self):
        s = Sketch()
        s.rectangle((0, 0), (10, 5))
        # A rectangle's lines held square still move, stretch and widen: four ways.
        self.assertEqual((s.status, s.dof), ("Under defined", 4))
        self.assertAlmostEqual(s.points[2].x, 10.0, places=6)

    def test_relations_that_cannot_all_hold_are_named(self):
        s = Sketch("Bad")
        bottom, right, top, left = s.rectangle((0, 0), (10, 5))
        s.length(bottom, 10)
        s.length(top, 12)
        with self.assertRaises(SketchError) as raised:
            s.solve()
        self.assertIn("can't all hold", str(raised.exception))

    def test_a_relation_that_adds_nothing_makes_the_sketch_over_defined(self):
        s = Sketch()
        bottom, right, top, left = s.rectangle((0, 0), (10, 5))
        s.coincident(bottom.start, s.origin)
        s.length(bottom, 10)
        s.length(left, 5)
        extra = s.length(top, 10)
        self.assertEqual(s.status, "Over defined")
        self.assertEqual(s.solve().redundant, [extra])

    def test_a_slot_of_tangent_arcs_solves_and_dimensions_like_a_cad_slot(self):
        s = Sketch("Slot")
        arc1, line1, arc2, line2 = s.slot((0, 0), (30, 0), 5)
        self.assertEqual((s.status, s.dof), ("Under defined", 5))
        s.fix(arc1.center)
        s.horizontal(arc1.center, arc2.center)
        s.distance(arc1.center, arc2.center, 40)
        s.radius(arc1, 6)
        self.assertEqual((s.status, s.dof), ("Fully defined", 0))
        self.assertAlmostEqual(s.face().area, 40 * 12 + math.pi * 36, places=6)

    def test_a_three_point_arc_bulges_toward_its_middle_point(self):
        s = Sketch()
        line = s.line((0, 0), (20, 0))
        s.three_point_arc(line.end, (10, 10), line.start)
        # Half a circle of radius 10 above the line.
        self.assertAlmostEqual(s.face().area, math.pi * 100 / 2, places=4)


class Faces(unittest.TestCase):
    def test_a_profile_with_a_hole_extrudes_along_its_plane(self):
        s, *_ = plate()
        solid = B.extrude(s.face(), amount=5)
        self.assertAlmostEqual(solid.volume, (70 * 25 - math.pi * 16) * 5, places=3)
        box = solid.bounding_box()
        self.assertAlmostEqual(box.min.Z, 0, places=6)
        self.assertAlmostEqual(box.max.Z, 5, places=6)

    def test_a_sketch_fillet_rounds_its_corner_in_the_face_and_its_dimensions_still_hold(self):
        s, bottom, right, top, left, circle = plate()
        s.fillet(bottom, right, 5)
        self.assertEqual(s.status, "Fully defined")
        self.assertAlmostEqual(right.end.x, 70.0, places=6)
        cut = 5 * 5 - math.pi * 25 / 4
        self.assertAlmostEqual(s.face().area, 70 * 25 - math.pi * 16 - cut, places=3)
        s.fillet(top, left, 30)
        with self.assertRaises(SketchError) as raised:
            s.face()
        self.assertIn("more than", str(raised.exception))

    def test_offset_entities_follow_what_they_are_offset_from(self):
        s, bottom, right, top, left, circle = plate()
        ring = s.circle(circle.center, 6)
        s.offset_entities(ring, circle, 2)
        made = [s.line((-1, -1), (71, -1))]
        made.append(s.line(made[0].end, (71, 26)))
        made.append(s.line(made[1].end, (-1, 26)))
        made.append(s.line(made[2].end, made[0].start))
        s.offset_entities(made, [bottom, right, top, left], 1)
        self.assertEqual((s.status, s.dof), ("Fully defined", 0))
        self.assertAlmostEqual(ring.radius, 6.0, places=6)
        bigger, *_ = plate(length=90.0)
        offset = [bigger.line((-1, -1), (71, -1))]
        offset.append(bigger.line(offset[0].end, (71, 26)))
        offset.append(bigger.line(offset[1].end, (-1, 26)))
        offset.append(bigger.line(offset[2].end, offset[0].start))
        bigger.offset_entities(offset, bigger.curves[:4], 1)
        bigger.solve()
        self.assertAlmostEqual(offset[1].start.x, 91.0, places=6)

    def test_front_and_right_sketches_face_their_planes(self):
        for plane, normal in (("Front", (0, -1, 0)), ("Right", (1, 0, 0)), ("Top", (0, 0, 1))):
            s = Sketch(plane=plane)
            s.rectangle((0, 0), (20, 10))
            self.assertEqual(tuple(round(c) for c in s.face().normal_at()), normal)

    def test_an_open_profile_says_where_it_is_open(self):
        s = Sketch("Open")
        s.polyline((0, 0), (10, 0), (10, 5))
        with self.assertRaises(SketchError) as raised:
            s.face()
        self.assertIn("is open at", str(raised.exception))

    def test_construction_geometry_is_no_part_of_the_profile(self):
        s = Sketch()
        s.center_rectangle((0, 0), (10, 5))
        self.assertAlmostEqual(s.face().area, 200, places=6)


class State(unittest.TestCase):
    def test_an_editor_reads_the_sketch_as_solved_with_where_each_line_of_it_is(self):
        s, *_ = plate()
        state = s.state()
        self.assertEqual((state["name"], state["plane"], state["status"], state["dof"]), ("Sketch1", "Top", "Fully defined", 0))
        self.assertEqual([curve["id"] for curve in state["curves"]], ["Line1", "Line2", "Line3", "Line4", "Circle1"])
        self.assertEqual([d["id"] for d in state["dimensions"]], ["D1", "D2", "D3", "D4", "D5"])
        self.assertTrue(all(d["file"].endswith("test_sketch.py") and d["line"] > 0 for d in state["dimensions"]))
        self.assertIn("Horizontal1", [r["id"] for r in state["relations"]])


if __name__ == "__main__":
    unittest.main()
