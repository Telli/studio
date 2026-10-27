"""The desk lamp's shared sizes, in millimetres: the two hinges (the base's clevis, the arm and the head's yoke), the
LED module and the head that holds it, and the steel weight and the base's pocket for it. Change one here and every
part that imports it follows."""

# The hinges: both are the same joint, an M5 x 30 socket head screw through two cheeks that clamp the arm between them.
HINGE_HOLE = 5.5  # M5 clearance, ISO 273 medium, in the cheeks and the arm's ends
TONGUE = 10.0  # the arm's thickness, which each hinge's cheeks clamp
CHEEK = 5.0  # each cheek of the base's clevis and of the head's yoke
CHEEK_GAP = 10.2  # between a hinge's two cheeks: the arm and 0.1 mm each side, closed up by the screw
HINGE_END = 8.0  # radius of the arm's rounded ends about its hinge holes

# The arm: one link from the base's hinge to the head's.
ARM_LENGTH = 200.0  # hinge centre to hinge centre
ARM_WIDTH = 2 * HINGE_END

# The LED module: an aluminium LED board, a generic envelope (step.parts has none); check it against the board bought.
LED_BOARD = 40.0  # the board's diameter
LED_BOARD_THICKNESS = 1.6
LED_SCREW_SPACING = 32.0  # its two M3 mounting holes, across the board's centre
LED_SCREW_HOLE = 3.2

# The weight: a steel disc in a pocket under the base.
WEIGHT_DIAMETER = 90.0
WEIGHT_THICKNESS = 10.0
