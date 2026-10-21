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

- **The project's overview.** The Project tab (Overview, in Engineering) opens on it: the
  project's README in its folder first, what it is and its decisions
  (`- <what was decided> (<YYYY-MM-DD>, asked)`, or `by hand`; a decision written date first reads
  too), then every other section the README has as written, its links opening what they name. The
  agent is told to keep it, and on a new project's first turn to name the project, set its setup
  and write the README before anything else. Below it, modules: the lead part large (or, with no
  part yet, Start a part by hand), the open issues its
  checks found (each with the fix the check suggests, and Propose a fix, which asks the agent to
  propose and wait), then, in Engineering, everything in the project in one place the way Google
  Drive shows a folder (`components/workbench/ProjectEverything.tsx`): its chats and every kind
  of file together, each marked by its kind's icon in its kind's color (`KIND_TINTS`), filtered
  by type (Chats, CAD, Electronics, Analysis, Manufacturing, Documents, References), as a list
  (name, kind, how a chat stands or how a part's checks went) or as cards with pictures (a part's
  with its checks, drawing and manufacturing files); then the parts' versions, the project's
  folders and the brief's links. The sidebar's Overview opens it across the window, as a Drive
  folder opens; opening a chat or a file from it brings the chat back with the file beside it.
  With code tools on, the page keeps a module per kind (CAD, Electronics, then Documents and each
  other kind of file) and its Files, References and Threads tabs. In Engineering its New starts
  new designs only. A module shows once it
  has something in it, folds away (remembered on this computer), and is read again whenever the
  thread's agent changes files. Checks
  are the results text-to-cad writes beside the parts, `<name>.fea.json` (or a named study's
  `FEA/<name>.<study>.json`) and `<stem>.<process>.result.json`
  (`components/workbench/checkResults.ts`), named as an engineer says them (Strength, Vibration,
  Casting), a study that passes saying its safety factor; a drawing is the engineering drawing's
  `<part>_drawing.pdf`. Each opens with a click.
- **Import.** Studio scans the folders picked on this computer (Documents, Desktop and Downloads to
  start) for CAD models, drawings, parts lists, datasheets, photos and notes, and proposes a
  project for each folder that holds models or drawings, imported where it is: Studio only reads
  them. Loose files are placed in a project (copied into its folder) or left out; copies and older
  versions are listed and stay put. Import is on Home (files or a folder, or a scan), takes files
  dropped anywhere on Home, and offers the CAD files new in the scanned folders
  since the last scan. The desktop app reads and copies (`apps/desktop/src/studio/`); what makes a
  project is decided in the web (`components/workbench/importPlan.ts`).
- **No usage data.** T3 Code's analytics are off and keyless in this build
  (`apps/server/src/telemetry/AnalyticsService.ts`), so nothing about its use goes to T3.
- **Design history.** A turn that changed files ends with one line of what it changed in the
  design, a chip per part and document (a part's script, model, drawing and studies are one
  entry); a part's chip opens what changed in it at that turn, anything else opens beside the
  thread. The work log's groups say which parts they updated ("3 steps, updated the L bracket").
  With code tools on, the turn keeps T3 Code's changed-files card and the project page keeps its
  Threads tab.
- **Documents from templates.** New's Documents (and the Overview's Documents, the Document
  menu's From a template, and the quick find) start a document the agent writes into `docs/`: a
  PRD, an MRD, the engineering requirements, an FMEA, a design review or a de-risk plan, each with
  its sections (`newTemplates.ts` `DOCUMENT_TEMPLATES`), or one of the person's own templates, any
  file in the Templates folder beside Studio's projects (`<projects folder>/Templates`), which the
  agent follows section by section (`documentTemplates.ts`; Add a template copies one in). The
  agent fills each section from the project and writes what is not known as an open question.
- **Versions and What changed.** Every chat turn's checkpoint is a version. The Overview's
  Versions lists a part's versions, newest first, each with when and which chat made it (and Now,
  for a hand edit since the last turn), and shows what changed between the one picked and the one
  before, or any earlier one: the part as one model (added green, removed red, unchanged
  see-through grey) or side by side, the named sizes of its script that changed, its volume and
  size, how its checks went at each, and the script's lines on request. The CAD service reads the
  versions with git and compares the solids in a process of its own
  (`text-to-cad/packages/cadgen/src/cadgen/edit/versions.py` and `solid_diff.py`, ported from
  Fixture's `diff_revision.py`; routes `/__cad/versions` and `/__cad/versions/compare`). It
  writes under the project folder's `.studio/compare/`, which git is told to leave out.
- **Home, the switcher and the chats.** In Engineering, Home is Studio's one page (Projects goes
  to it): a top bar with the mark and a search that opens the quick find, then a project from a
  description (Start makes the project and its first chat, and sends the description as its first
  message) or a blank part, assembly or board to model by hand, then every project, pictured by
  its first part, with Import. T3 Code's sidebar stays shut there. A project opens in the thread
  last open in it on this device (else the one last worked on, else a new one). Projects are
  listed as a recents list orders them, the one opened last on this device first (or worked on, if
  that came later), and the starred ones (kept on this computer) apart at the top of Home and the
  switcher. In its workspace the sidebar is the project and its chats (`StudioSidebar.tsx`): at
  its top the project's name, a control with its picture that switches projects
  (`components/workbench/ProjectSwitcher.tsx`, also Cmd+O, which is the quick find on Home), whose
  top is the project's own menu (Rename, Duplicate, a copy in a new folder made by the desktop
  app, Version history, Back up and Show in Finder); then its Overview, New chat, and its chats,
  newest first. What the project holds is on its Overview. The top bar names the open chat; with
  the sidebar folded (T3 Code's toggle or its shortcut) it leads with the mark and the project's
  switcher. The panel's tabs are what was opened lately, along its top as a browser's are
  (`brand/theme.css`): the Overview pinned first as its icon, then each file with its kind's
  colored icon (`FileKindIcon.tsx`), the one in front joined to the toolbar under them. The
  toolbar is one line of what can be done (`StudioPanelBar.tsx`): New, always first, as Drive's
  is (`StudioNew.tsx`, which hosts New's dialog in Engineering); then, over a part, Ask or Edit
  by hand and Evaluate, Manufacture and Document. Engineering with code keeps T3 Code's thread sidebar, with the
  projects listed in it.
- **Back up.** A project is already a folder on the Mac with its versions in it; the project's
  menu backs it up somewhere else (`components/workbench/BackupDialog.tsx`). GitHub: a private
  repository Studio makes for it with T3 Code's own publish, then each backup committed and
  pushed over https, as the account the source control settings are signed in as; Studio pushes
  only to a repository it made, so a folder with a repository of its own is left to it. Or a
  folder that syncs (a Google Drive, Dropbox or iCloud folder, or a drive): the desktop app copies
  each of the project's folders there, version history (`.git`) included, then only what changed,
  and never deletes from it (`backUp` in `apps/desktop/src/studio/studioImportFiles.ts`). Import
  brings a folder backup back. Where and when are remembered on this computer and shown under the
  menu (`useBackup.ts`).
- **Quick find.** In Engineering ⌘K finds a project, a part, a document or a chat in any project
  (one in another project opens there; with nothing typed, the open project's), or any job for
  the part on screen, with Home, New project, Take the tour, Settings and the interface switches
  (`components/workbench/StudioQuickFind.tsx`). Engineering with code keeps T3 Code's command
  palette.
- **Getting around.** The top bar is a path, the project then the open chat, the project's name
  opening its Overview (`StudioWorkspaceBar.tsx`). The panel's tabs take Chrome's shortcuts:
  Ctrl+Tab and Ctrl+Shift+Tab go round them, Cmd+1 to 8 to one by its place and Cmd+9 to the last
  (`panelTabShortcuts.ts`, ahead of T3 Code's own Cmd+number), and a file opens in one tab
  however its path was written or whoever opened it (`sameFile.ts`). Home lists Needs you (the
  chats waiting on the person, in any project) and Recent (chats and files opened lately, as
  Drive's Recent does; files opened beside a chat are remembered, `recentFiles.ts`). In
  Engineering a document always reads as a document: rendered, with no source view, editor or
  file tree beside it (`FilePreviewPanel.tsx`).
- **Onboarding.** Setup speaks Studio's words and ends at signing in to Claude or Codex
  (`WelcomeWizard.tsx`; Home brings in files). A first Home says Welcome to Studio and offers a
  sample project the agent builds in front of you (a servo bracket, its strength check, its
  drawing and its PRD), a few projects to start with one press, and Start from a PRD
  (`homeExamples.ts`). The first workspace opened gives a four-step tour, once (`StudioTour.tsx`,
  `tourSteps.ts`): the project, its Overview, the tabs and the toolbar.
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
- **Ask or Edit by hand.** While the CAD viewer shows a part, the workspace's top bar lays it out
  for asking the AI (text-to-cad's viewer as Jake built it, where a selection goes to the agent
  through Quick Edit) or for modeling it by hand (edit mode), per project and Ask until chosen;
  with the Overview, a document or a board in front it is not shown (`editsByHand`). The part
  tabs run along the panel's bottom. The viewer takes it
  from its host context (`studio/editLayout`) and then shows no switch of its own; elsewhere its
  navbar keeps the switch, as Manual and AI. By hand, what a command uses is plain: a sketch is
  picked on the model or in the design tree and shaded in the selection blue with its name, an
  extrude is previewed in amber (a cut in red, starting into the part), and a command's panel
  floats in a card of its own at the model view's top-right, apart from the design tree, its OK
  and Cancel a green check and a red cross in its title row. The ribbon and the tree draw each
  modeling command as a picture of what it does to a block, in the CAD colors of `tokens.css`, and
  what edit mode is busy with (reading the part, rolling back, rebuilding) shows with a spinner and
  a line along the ribbon's foot. A rollback step moves the bar at once and, the files unchanged,
  does not run the part again. A hole goes where its face is clicked (a slanted face too), a
  sketch can go on a plane at an Offset distance, a linear pattern takes its direction (X, Y or
  Z) from an edge picked on the model and a circular one its axis from a round face or a straight
  edge, an extrude can end Up To Surface or Up To Vertex, and a revolve and a drafted extrude are
  previewed as they will be made. In a sketch, Convert Entities brings the model's edges in, held
  On Edge so they follow the part as it changes.
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
- **Evaluate, Manufacture, Document.** In the workspace's top bar, the jobs the part's kind takes:
  simulations, fit, motion and mass; each way of making it (the project's own first: printing,
  CNC with G-code, sheet metal, cutting, molding, boards), buying standard parts and the files to
  export (STEP, STL and 3MF); drawings, instructions, pictures, reports and robot descriptions.
  Each menu keeps its everyday jobs and ends in More, which opens the quick find on all of its
  jobs. Each needs its text-to-cad skill (`components/workbench/hardwareActions.ts`) and writes
  the job, naming the part, into the composer.
- **Three kinds, and work done on them.** What is designed is CAD, Electronics or Documents, and
  New offers those. FEA and CAM are not kinds of design but work done on one, for parts and boards
  alike, so what Evaluate, Manufacture and Document make (analysis, manufacturing files,
  drawings) belongs to the part it was made from, as a CAD system keeps a study or a toolpath with
  its part. Each kind has one icon wherever it shows: the sidebar, New, the Overview's modules and
  badges, the top bar's menus, the quick find and the chat's change chips
  (`components/workbench/kinds.ts`).
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
