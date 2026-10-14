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
