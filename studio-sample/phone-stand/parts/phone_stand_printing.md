# Phone stand: warp off the plate

**Ready to print.** Printed on its side in PLA, the stand's bottom lifts 0.317 mm out of flat once it is off the plate, inside the 0.4 mm tolerance, and nothing moves more than 0.322 mm from the model.

Checked with the manufacturing-sim skill's `printing` process:

```bash
cadgen manufacturing check parts/phone_stand.step --study studies/phone_stand.printing.json --fail-on error
```

The study (`studies/phone_stand.printing.json`): FDM in PLA, built along the stand's +X (on its side, its -X face on the plate, as `parts/phone_stand_print.py` turns it), 12 bands, 0.2 mm layers, let go of the plate once built. It meshed the part into 22911 tetrahedra of 4.811 mm, cut into 12 bands of 6.67 mm, and took PLA's inherent strain as -0.00238 in the plane (its expansion from its 60 °C glass transition down to a 25 °C chamber) and 0 along the build. Its solve took 68 s (`timings` in the result).

| Check | Measured | Limit | Result |
| --- | --- | --- | --- |
| Warp | the bottom 0.317 mm out of flat, off the plate, most at [-40.0, 0.152, 1.235] mm (the plate face, the base's front corner) | 0.4 mm, ISO 2768-2 K for its 140 mm | pass |
| Distortion off the plate | 0.322 mm at most, at [-6.0, 139.414, 0.586] mm (the base's back edge) | 0.4 mm | pass |
| Residual stress | 28.9 MPa at the 99th percentile as printed (97.0 MPa at a corner against the plate, where the peak is singular) | PLA's yield, 60 MPa | pass |
| Hand check | the first band against a band fully held on the plate: 10.3 MPa simulated, 13.0 MPa by hand (the run reads the two 1.26× apart) | within 2× | pass |
| Bed adhesion | the plate must hold the bottom down with up to 23.8 MPa, at [-40.0, 0.819, 1.5] mm | no `bed_adhesion_MPa` given, so not judged | note |

The result is `parts/phone_stand.printing.glb` (the stand coloured by its residual stress and drawn deformed by its distortion, band by band, then off the plate) and `parts/phone_stand.printing.result.json` (every number).

## What it leaves out

- The layers are lumped into 12 bands, each with one inherent strain for the whole part: the scan pattern, the heat that builds up and the plate's temperature are in that number, not computed.
- Linear elastic: a stress past yield would be an upper bound. None passes it here.
- The plate is rigid and supports are not modelled; a real plate bends under the part's pull, which adds to the curl once it is cut off. The curl it finds is mostly at the part's ends.
- The chamber is taken at 25 °C, the check's default for an open printer. The P1S is enclosed, so this assumes PLA is printed with its door open; a warmer chamber shrinks PLA less, so a closed door would warp it less, not more.
- The 0.4 mm tolerance is ISO 2768-2 K's flatness for the 140 mm side, the check's default: no tolerance has been asked for yet.
