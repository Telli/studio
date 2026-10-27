# Models

| Script | Output | Purpose |
| --- | --- | --- |
| parts/shelf_bracket.py | parts/shelf_bracket.step | The shelf bracket, bent from G90-074 galvanised steel, with its named sizes |
| parts/shelf_bracket_flat.py | parts/shelf_bracket_flat.step | The bracket's flat pattern, developed with SendCutSend's radius and K-factor |
| parts/shelf_bracket_cut.py | cut/shelf_bracket_cut.dxf | The bracket's cut file: the flat pattern with its two bend lines |
| parts/shelf_bracket_drawing.py | drawings/shelf_bracket_drawing.pdf | The bracket's engineering drawing |

Build: `python parts/shelf_bracket.py` from the project root builds the bracket; `python parts/shelf_bracket_flat.py`
builds the flat pattern and `python parts/shelf_bracket_cut.py` its cut file. Unchanged models are current.
`python parts/shelf_bracket_drawing.py` draws the bracket from its saved STEP, so run it after the bracket.

The strength study: studies/shelf_bracket.study.json, solved with
`cadgen fea solve parts/shelf_bracket.step studies/shelf_bracket.fea.glb --study studies/shelf_bracket.study.json`.

The bending check: parts/shelf_bracket.sheet_metal.json, run with
`cadgen manufacturing check parts/shelf_bracket.step --study parts/shelf_bracket.sheet_metal.json --fail-on error`,
which writes parts/shelf_bracket.sheet_metal.glb and parts/shelf_bracket.sheet_metal.result.json.

Checks, run from the project root: `python checks/shelf_bracket_step_facts.py` (the STEP's solid, volume and cylinders),
`python checks/shelf_bracket_cut_facts.py` (the cut file's units, layers, bend lines, flange depths and hole distances,
for the SendCutSend preflight) and `python checks/shelf_bracket_fea_probe.py studies/shelf_bracket.fea.glb
studies/shelf_bracket.fea.json "[[14,-25],[14,-125]]"` (the strength result's stress away from the wall holes).
