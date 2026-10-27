# Models

| Script | Output | Purpose |
| --- | --- | --- |
| parts/sizes.py | | The largest phone the stand is for, shared by the placeholder, the assembly and the tip-over check |
| parts/phone_stand.py | parts/phone_stand.step | The phone stand: its side profile sketched and extruded, its edges filleted, the cable slot and the cable pass cut |
| parts/phone_stand_print.py | parts/phone_stand_print.stl, parts/phone_stand_print.3mf | The stand turned onto its side as it prints, for the slicer and the FDM check |
| parts/phone_placeholder.py | parts/phone_placeholder.step | A placeholder for the largest phone, not a real phone's model |
| assemblies/phone_stand_portrait.py | assemblies/phone_stand_portrait.step | The stand with the placeholder phone in it in portrait |
| parts/phone_stand_drawing.py | drawings/phone_stand_drawing.pdf | The stand's engineering drawing |
| checks/phone_stand_tip.py | docs/phone_stand_mass_and_tip.md | Mass, fit and tip-over |
| checks/phone_stand_print_facts.py | (prints JSON) | The bridges and plate contact the FDM check's tool does not measure |

Build: `python parts/phone_stand_print.py` from the project root builds the stand and its print files;
`python assemblies/phone_stand_portrait.py` builds the stand with the phone in it. Unchanged models are current. Then
`python parts/phone_stand_drawing.py` draws the stand from its saved STEP, and `python checks/phone_stand_tip.py`
checks it again.

The printing check: `cadgen manufacturing check parts/phone_stand.step --study studies/phone_stand.printing.json`,
which writes parts/phone_stand.printing.glb and parts/phone_stand.printing.result.json.

Pictures, rendered from the saved STEPs and STL: `cadgen step snapshot` and `cadgen stl snapshot` into pictures/.
