# text-to-cad Studio

T3 Code made into a hardware app: agents design parts with the text-to-cad plugin, and the CAD
view follows their work beside the thread. It is this fork's `amy/hardware` branch, pinned inside
[text-to-cad](https://github.com/earthtojake/text-to-cad) as the `apps/studio` submodule.

## Run it

In a text-to-cad checkout, `git submodule update --init apps/studio`, then from `apps/studio`,
after `vp i`:

```sh
vpr studio            # server and web
vpr studio:desktop    # the Electron app
```

`scripts/studio.ts` reads the checkout as a plugin marketplace and turns its `text-to-cad`
plugin on at first start, brands the app from `brand/`, and keeps state in `~/.text-to-cad-studio` (never in
T3 Code's `~/.t3`). `TEXT_TO_CAD_ROOT` points at another checkout; `TEXT_TO_CAD_STUDIO_HOME`
moves the state.

## What it adds to T3 Code

Everything else is upstream T3 Code plus the fork's plugins (`FORK.md` on `main`).

- **Views the agent opens.** When the agent calls a plugin view's tool (`cad_open`), the view
  opens as a tab beside the thread with the call's arguments.
- **Follow the files.** When a run's file edit writes a file a view claims (a `.step`) and no view
  of that plugin is open, the file opens in one. Models a shell command builds arrive through the
  agent's own `cad_open` or `cad_show`. Open views refresh themselves, and a panel choice made during the run wins.
- **Bundled plugins.** `T3CODE_PLUGIN_MARKETPLACE` and `T3CODE_DEFAULT_PLUGINS`
  (`apps/server/src/plugins/BundledPlugins.ts`); a plugin the user uninstalls stays uninstalled.
- **A workbench, not a chat with a CAD tab.** `brand.json` `"layout": "workbench"` makes the right
  panel the main surface: the model or board viewer takes the window and the chat docks beside it
  at a width the user drags, one width for every thread, while the viewer absorbs a wider window
  (`apps/web/src/components/workbench`). A thread opens on its viewer the first time it shows, so
  the agent's `cad_show` has one to switch; one the user closes stays closed. With the room, the
  viewer's own findings show where it puts them: the verdict at the top of an FEA study, the
  findings in a CAM job, a board's checks. Studio lists none of its own.
- **The part stays in view.** Above the composer, what the viewer shows: its name, what it is
  (part, assembly, board, FEA study, CAM job), its units, its material and its last build. The
  viewer's own sync (`cad_sync`, relayed by the frame) says which model and its build; the
  viewer's routes, through `cad_http` once per revision, say the rest. Studio makes no call the
  plugin would count, and a fact the server does not hold is left out or said to be missing. A
  press brings the viewer back.
- **Hardware starters.** A new thread offers hardware jobs from `brand.json` `starters` ("Route
  this board", "Post G-code for grbl"), each only while an enabled plugin has the skill it needs
  (`pcb`, `cam`). Without brand starters, it offers what the enabled plugins suggest
  (`interface.defaultPrompt`).
- **text-to-cad's look.** It's named Studio and wears text-to-cad's brand kit, not T3's: the CAD
  viewer's neutral palette (charcoal in dark), its animated mark on the loading splash, its mark
  beside the name, its favicons and dock icon (`brand/`, see its README). `T3CODE_BRAND_DIR` applies
  them (`apps/web/vite/brand.ts`) and `VITE_APP_BASE_NAME` names the app, its assistant messages and
  the desktop window. A theme the user picks keeps its own colors. T3's stage artwork gives way to
  its small stage pill. Other mentions of T3 Code stay: they describe T3's own machinery (T3
  Connect, its desktop updates), and rewording them would make every rebase conflict.

## Hardware first (`amy/hardware-first`)

A branch on top of `amy/hardware` for people who know hardware before code: `brand.json`
`"focus": "hardware"`. `amy/hardware` stays the base text-to-cad pins; this one rebases onto it.

Its interface is a setting, Engineering, Engineering with code, or Code (Settings, Appearance,
Interface; or the "Switch to ..." commands in the command palette, which "dev" also finds),
Engineering by default, per device. Engineering puts every coding tool away (version control,
editors, terminals, scripts, branches, pull requests, diffs), names parts and documents rather than
files ("Servo bracket", "Servo bracket drawing", not `parts/servo_bracket.step`) on the project
page, tabs, file chips in the chat and the work log (`components/workbench/partNames.ts`), says what
the agent's steps did to the design ("FEA study on the L bracket", "Built the L bracket") instead of
the command lines, and reads like a shop drawing: a title block over the viewer with the part's
type, units, material and build, and
documents the agent writes (plans, reports) opening beside the thread as documents with a title
block of their own. Engineering with code keeps those surfaces (the projects home, the project's
overview, the title block, documents) and brings every coding tool back in T3 Code's own words,
with Source beside the pinned Project tab for the explorer. Code shows T3 Code's surfaces as they
are. `<html data-studio-focus>` (`hardware`, `both` or `code`) carries the choice for
`brand/theme.css`.

- **The project's overview.** The Project tab opens on it: the lead part large, the open issues its
  checks found (each with the fix the check suggests, and Propose a fix, which asks the agent to
  propose and wait), every part with how its checks went, and recent work. Checks are the results
  text-to-cad writes beside the parts, `<name>.fea.json` and `<stem>.<process>.result.json`
  (`components/workbench/checkResults.ts`).
- **Design history.** A turn that changed files ends with what it changed in the design, by part
  and document (a part's script, model, drawing and studies are one entry), each opening beside
  the thread; the work log's groups say which parts they updated ("3 steps, updated the L
  bracket"). The project's Threads tab is its History: the work newest first under its day, each
  piece with how it came out (done, needs you, working, stopped). With code tools on, the turn
  keeps T3 Code's changed-files card and the tab is Threads.
- **A sidebar of projects.** In Engineering the sidebar lists the projects, not their threads,
  then the folders in no project: each opens on its page, where its history is, and says whether
  work in it needs you or is under way. Engineering with code keeps T3 Code's thread sidebar.
- **The part editor.** A text-to-cad part's script stays its source, and the part editor
  (`studio-plugins/part-editor`) reads it as a design: a tracer runs the script in cadgen's Python
  with every number in the project's files remembering where it is written, and records each
  build123d operation. The editor tab beside the chat shows the model with its dimensions, the
  named sizes the part uses (`TRAY_HEIGHT` reads "Tray height") and a timeline, one row per
  operation in the script, each with its own inputs and the formula behind them. Double-click a
  value and type a number or a formula: the change is that one number rewritten in the source, as
  it was written (`.060` to `.050`); a dimension from a formula of several sizes asks which to
  change; a file changed since the editor read it is refused. Every part that uses the changed file
  is built again, so its STEP, Studio's viewer and the checks follow, and the note of the change
  goes into the composer for the agent, which is not run. The editor follows the agent's own edits
  to the script. It is offered when cadgen's Python is known: the checkout's in development, else
  `CADGEN_PYTHON`. Open it from the panel's + menu, on a part script, or by the agent
  (`part_editor_open`). Its page is built at launch (`scripts/editor-pages.ts`). Test:
  `python studio-plugins/part-editor/tracer/test_tracer.py` in cadgen's Python.
- **SolidCraft, on request.** `STUDIO_SOLIDCRAFT=1`, with SolidCraft (a parametric CAD engine,
  Apache-2.0) in Applications, adds `studio-plugins/solidcraft`: its engine headless per thread
  behind the same editor, for `.solidcraft` designs (the overview lists a design and its STEP as
  one part). `STUDIO_SOLIDCRAFT_APP=1` bridges it to the SolidCraft app instead. Bundled plugins
  come from several marketplace folders (`T3CODE_PLUGIN_MARKETPLACE`, separated as PATH is), and
  one whose folder changed is updated at the next start, so its tools and views are listed again;
  one the app stops offering is uninstalled, and offered again if it is offered again.
- **Setup, as a CAD tool shows it.** Under the project's name, its units, material (from a library
  of common grades, or any name typed), process and quantity. Picking a value writes the request
  into the composer ("Change the project's material to PETG."); the agent changes the project's
  `project.json`, which it is told about and may edit, says what the change means for the parts,
  and waits. A folder in no project yet is set up in place. What the project is for and must meet
  is the brief behind Brief.

- **Point, then ask.** What the viewer adds to the chat (Quick Edit's references, a picture of the
  view) lands in the composer, to read and edit before it goes. The viewer is then told the
  context was taken, so the next addition carries only what is new.
- **Check, Make, Document.** Beside the part's name, the jobs its kind takes: strength under load,
  CNC, sheet metal, molding, 3D printing, board fab checks; G-code for grbl, slicing, a Bambu
  print, cut-ready DXF, a SendCutSend order, routing; drawings, standard parts, exports, URDF.
  Each needs its text-to-cad skill (`components/workbench/hardwareActions.ts`) and writes the job,
  naming the part, into the composer.
- **Start from a part.** A new thread lists the project's CAD files (a mesh exported beside its
  STEP counts once); picking one offers the same three menus for it.
- **A checkout's working copy.** `TEXT_TO_CAD_DEV=1 vpr studio:desktop` runs the checkout's own
  cadgen instead of the release, so branch work (FEA, CAM, KiCad) reaches Studio: the launcher
  builds the development plugin with the checkout's `scripts/install/dev_install.py`
  (`scripts/studio-dev-plugin.py`) and keeps its state in `~/.text-to-cad-studio-dev`. The
  checkout needs its `.venv` (with the `fea` extra), `npm ci` and `scripts/bundle/bundle.sh`.

One command takes in a new T3 Code: from the fork's `main` checkout,
`scripts/sync-upstream.sh --push` rebases `main` and `amy/plugins` onto upstream, and
`amy/hardware` onto `amy/plugins`, stopping at the first conflict. Then bump text-to-cad's pin
and tag the commit it pins, so it stays fetchable after the next rebase moves the branch:

```sh
git submodule update --remote apps/studio     # in text-to-cad: the pin follows amy/hardware
pin=studio/pin/$(git -C apps/studio rev-parse --short=10 HEAD)
git -C apps/studio tag "$pin" && git -C apps/studio push origin "$pin"
```

and commit `apps/studio`. What Studio changes against T3 Code is the compare view from the
upstream commit the branch sits on to `amy/hardware`.

Rebases stay clean because the branch adds files rather than editing T3's: an edit to an upstream
file is a seam of a line or a few (`scripts/fork-diff.sh amy/hardware` on `main` lists them). Keep it that
way: new behaviour goes in new files, and a T3 string or style is changed through `brand/`, not
in place.

## Who the engineering interface is for (Amy, 2026-10-15)

Mechanical engineers who design in SolidWorks, Creo, NX, Fusion or Onshape today, or sketch and
hand the CAD to someone else. Studio is meant to replace that CAD, not sit beside it. What would
prove it: a real product made only in Studio and shipped; a handful of working engineers using it
for a week on their own parts; the same part done in SolidWorks and in Studio, compared.

- **What it owns.** Idea to first model, will-it-make checks, changes from feedback, and the
  documents a shop gets.
- **The unit is a product.** Its parts, assemblies, checks, documents and history together.
  Opening one shows the model with the chat docked, each part's checks, what changed lately and
  the open issues.
- **Steering.** Click a face and ask, mark up a picture, or say it. Exact values are said in chat
  ("make that hole 6.35"), not typed into a table. The code behind a part is there on request,
  one click away.
- **Trust.** A hand check beside every simulation, a source for every number and a list of the
  guesses, the assumptions up front, and a track record: test results logged against a revision,
  a supplier's notes and quotes, and photos of the made part come back in and are compared with
  the model.
- **A failed check.** The agent proposes the fix and waits for a go; it does not change the part
  on its own.
- **People.** One engineer, a small team editing the same product, and suppliers who see the
  released files and send back notes.
