"""The MG996R servo's sizes, in millimetres, shared by the servo model, the bracket that holds it, the
bracket's flat pattern and the horn adapter. Change one here and every part that imports it follows."""

# From Tower Pro's MG996R datasheet: its table's A to F, as its dimension drawing labels them.
SERVO_HEIGHT = 42.7  # A: base to the top of the output spline
SERVO_LENGTH = 40.9  # B: case length
SERVO_CASE_HEIGHT = 37.0  # C: base to the top of the case
SERVO_WIDTH = 20.0  # D: case width
SERVO_TAB_LENGTH = 54.0  # E: over the mounting tabs
SERVO_TAB_HEIGHT = 26.8  # F: base to the underside of the mounting tabs
SERVO_TRAVEL = 120.0  # degrees the horn turns, 60 each way

# Not in the datasheet: measured by a seller, scaled from the datasheet's drawing, or assumed.
# Measure a servo before the bracket is cut.
SERVO_TAB_THICKNESS = 2.5  # scaled from the drawing
SERVO_TAB_HOLE = 4.1  # Kitronik's measurement of an MG996R
SERVO_TAB_HOLE_ACROSS = 9.5  # Kitronik's: between the two holes of one tab
SERVO_TAB_HOLE_SPACING = (SERVO_LENGTH + SERVO_TAB_LENGTH) / 2  # along the servo, each hole centred on its tab
SERVO_SHAFT_FROM_END = 10.5  # the output axis from the near end of the case, scaled from the drawing
SERVO_SPLINE = 5.9  # the 25-tooth output spline, across its teeth
