# text-to-cad Studio

T3 Code made into a hardware app: agents design parts with the text-to-cad plugin, and the CAD
view follows their work beside the thread. It is this fork's `amy/hardware` branch, pinned inside
[text-to-cad](https://github.com/earthtojake/text-to-cad) as the `apps/studio` submodule.

This branch, `amy/hardware-first`, is the hardware engineer's version and lives in a private
repository, never pushed to the public fork. It is one repository: text-to-cad is in it at
`text-to-cad/`, a subtree of Jake's repository with its history, so the viewer and cadgen change
here beside the app. His updates merge in (the `jake` remote is fetch-only):

```sh
git fetch jake main && git merge -X subtree=text-to-cad/ jake/main
```

Set it up once: `vp i` here; in `text-to-cad/`, a `.venv` with `requirements-dev.txt` and
`-e packages/cadgen[fea]`, `npm ci` and `scripts/bundle/bundle.sh`. Then
`TEXT_TO_CAD_DEV=1 vpr studio:desktop` runs it from this repository's `text-to-cad/`
(`TEXT_TO_CAD_ROOT` points at another checkout). A change to the viewer needs its packages built
(`npm run build` in `text-to-cad/packages/core` and `packages/ui`) before Studio starts.

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
  (`apps/web/src/components/workbench`). With the engineering surfaces on, a thread opens on its
  project page, and the viewer comes forward when there is a model to show: the agent's `cad_open`
  (which `cad_show` asks for when no viewer is open), a model it writes, or a part the person
  opens. Without them a thread opens on its viewer the first time it shows, so the agent's
  `cad_show` has one to switch. One the user closes stays closed. With the room, the
  viewer's own findings show where it puts them: the verdict at the top of an FEA study, the
  findings in a CAM job, a board's checks. Studio lists none of its own.
- **The part stays in view.** Above the composer, what the viewer shows: its name, what it is
  (part, assembly, board, FEA study, CAM job), its units, its material and its last build. The
  viewer's own sync (`cad_sync`, relayed by the frame) says which model and its build; the
  viewer's routes, through `cad_http` once per revision, say the rest. Studio makes no call the
  plugin would count, and a fact the server does not hold is left out or said to be missing. A
  press brings the viewer back. The title block over the viewer also lists the part's checks, each
  opening its result, and a result on screen names the part it checked, a click away. A model a
  chat link or file chip names opens in the viewer, not as text.
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
  propose and wait), every part with how its checks went and its drawing, and recent work. Checks
  are the results text-to-cad writes beside the parts, `<name>.fea.json` (or a named study's
  `FEA/<name>.<study>.json`) and `<stem>.<process>.result.json`
  (`components/workbench/checkResults.ts`), named as an engineer says them (Strength, Vibration,
  Casting), a study that passes saying its safety factor; a drawing is the engineering drawing's
  `<part>_drawing.pdf`. Each opens with a click.
- **Design history.** A turn that changed files ends with what it changed in the design, by part
  and document (a part's script, model, drawing and studies are one entry), each opening beside
  the thread; the work log's groups say which parts they updated ("3 steps, updated the L
  bracket"). The project's Threads tab is its History: the work newest first under its day, each
  piece with how it came out (done, needs you, working, stopped). With code tools on, the turn
  keeps T3 Code's changed-files card and the tab is Threads.
- **A sidebar of projects.** In Engineering the sidebar lists the projects, not their threads,
  then the folders in no project: each opens on its page, where its history is, in the thread
  last open in it on this device (else the one last worked on, else a new one), and says whether
  work in it needs you or is under way. Engineering with code keeps T3 Code's thread sidebar.
- **Edit mode in the CAD view.** A model with a part script beside it opens in edit mode, and the
  script stays its source: text-to-cad's own viewer is laid out as a CAD tool, with a ribbon of
  its tools across the top (Undo and Redo of hand changes; Select; Measure and Section; Explode
  and Position; Draw), a design tree docked at the left (the part's named sizes, its history
  numbered as a CAD tree numbers it, and the selected feature's inputs, each with the formula
  behind it), and the feature's dimensions drawn on the model, each changed by a double-click. A
  change rewrites one number in the script, as it was written, and rebuilds every part that uses
  the file, so the model reloads as any rebuild does; a value made of several sizes asks which to
  change, and a file changed since it was read is refused. The ribbon's Create and Modify groups
  (Hole, Pattern, Mirror; Fillet, Chamfer, Shell) open a panel at the left in the sizes' place, as
  SolidWorks' PropertyManager does: what the command acts on (the edges or faces selected on the
  model, Select turned to them as it opens; for Mirror and Pattern, the feature picked in the
  history, or the whole body), its inputs in the part's units, and OK and Cancel. OK writes one
  line of build123d after the statement that makes the part's body, its faces and edges written
  as build123d's own selectors by where they are, never their numbers (the top face's outer
  edges: `tray.faces().sort_by(bd.Axis.Z)[-1].outer_wire().edges()`), and the line reads back as
  a new feature, selected, with its inputs to change like any other; a line that does not run,
  or picks something other than the selection, is not written. Undo takes a command's line back. The
  agent hears of each change with the next message (a Hand edit note queued in the composer),
  never by a message of its own. Edit Feature reopens a feature's panel, Suppress sets one aside,
  and the rollback bar shows the part as it was above a feature, new features going in there. An
  assembly places its parts: double-click one in its design tree (Open Part) and the part opens on
  its own, in a tab of its own when the assembly is a project file's tab
  (`studio/open-file`, a plugin view's request to open a file beside the thread). The engine is `text-to-cad/packages/cadgen/src/cadgen/edit/` (a
  tracer that runs the script with every number remembering where it is written, in a process of
  its own, behind the viewer's `/__cad/edit/*` routes, and `commands.py`, which matches a
  selection to the part by its geometry and writes a command's line); the frame is
  `text-to-cad/packages/ui/src/renderers/step/edit/`. The CAD skill's `references/edit-mode.md`
  tells the agent how to write parts that edit well.
- **Manual or AI.** A switch in the viewer's navbar lays a part out for modeling it by hand (edit
  mode) or for the AI (text-to-cad's viewer as Jake built it, where a selection goes to the agent
  through Quick Edit, which Manual leaves out). By hand, what a command uses is plain: a sketch is
  picked on the model or in the design tree and shaded in the selection blue with its name, an
  extrude is previewed in amber (a cut in red), and OK and Cancel are a green check and a red cross
  at the top of the panel and again in the model view's corner. The ribbon draws each modeling
  command as a picture of what it does to a block, in the CAD colors of `tokens.css`.
- **SolidCraft, on request.** `STUDIO_SOLIDCRAFT=1`, with SolidCraft (a parametric CAD engine,
  Apache-2.0) in Applications, adds `studio-plugins/solidcraft`: its engine headless per thread
  behind an editor page of its own, for `.solidcraft` designs (the overview lists a design and its STEP as
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
