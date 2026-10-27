"""The NEMA 17 stepper's mounting sizes, in millimetres, shared by the motor plate, its drawing, the motor model and
the mount. Change one here and every part that imports it follows."""

# The NEMA 17 frame, as step.parts' record of the motor gives it (frameMm, boltSpacingMm, shaftDiameterMm).
MOTOR_FRAME = 42.3  # the square face
MOTOR_BOLT_PATTERN = 31.0  # the four M3 tapped holes, on a square this size
MOTOR_SHAFT = 5.0  # the output shaft
MOTOR_BODY_LENGTH = 40.0  # the 40 mm body, the common one, as bought

# Not in step.parts' record: the usual NEMA 17 datasheet's pilot, which step.parts' simplified model draws smaller
# (17.8 mm across, 3.4 mm tall). Check it on the bought motor before the plate is cut.
MOTOR_PILOT = 22.0  # the locating boss round the shaft, on the motor's face
MOTOR_PILOT_HEIGHT = 2.0  # how far it stands off the face
