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

Set it up on a Mac with `scripts/setup-studio.sh`, after Apple's command line tools and Node 24,
and again after pulling. It installs the packages (the repository's own vp, run through npx when
none is installed), fetches Electron, makes `text-to-cad/.venv` with uv (Python 3.13,
`requirements-dev.txt` and the `fea` extra), runs `npm ci`, `npm run build:packages` and
`scripts/bundle/bundle.sh` in `text-to-cad/`, fetches the browser cadgen draws pictures with, and
checks for Claude Code; it changes no shell settings. `scripts/run-studio.sh` starts it:
`TEXT_TO_CAD_DEV=1 vpr studio:desktop`, from this repository's `text-to-cad/` (`TEXT_TO_CAD_ROOT`
points at another checkout). The development plugin is built with `text-to-cad/.venv`'s Python,
since a Mac's own python3 can be too old for cadgen. A change to the viewer needs its packages
built (`npm run build:packages` in `text-to-cad/`) before Studio starts.

**The Mac app.** `scripts/build-studio-app.sh [version]` builds `release/Studio-<version>-arm64.dmg`,
which needs nothing else on an Apple silicon Mac. Its first screen installs Claude Code and signs
in, so the person needs only their own Claude subscription. Building it needs Rust 1.95 or newer
for the resource monitor (`RUSTUP_TOOLCHAIN=1.95` uses one installed beside an older default)
and about 7 GB free; the download is about 400 MB and the app 1.2 GB (from 0.1.4; 600 MB and
1.9 GB while the CAD tools went in twice). The disk image step
reserves its whole temporary image (about 2.3 GB) at once, so it fails with "No space left" while
gigabytes still show free. `build/studio-bundle` is read only to stage it: deleting it once the
build logs "Installing staged production dependencies" gives that step 1.5 GB. The build runs
`vp run build:desktop` in the checkout, which rewrites the `dist-electron` and server `dist` files
a running `vpr studio:desktop` watches, so that copy restarts once. Its scratch folders, the
desktop build's stage among them, are in `build/tmp`, not the system's temp folder, which macOS
empties every night at 3:35 of files no one has opened in three days: a build running then lost
the bundle's empty files and made an update zip short of the app's signature (2026-10-22). Publish a version
as a release of the public `amywork777/studio-download` (it holds only the download, never code)
with the asset named `Studio-arm64.dmg`, as the script prints. The website, the guide page and
that repository's README link to `releases/latest/download/Studio-arm64.dmg`, so a new version
changes no link.

**The website**, https://studio-for-mac.vercel.app, is one static page in `~/code/studio-site`, on
Amy's personal Vercel (`amy-zhous-projects-45e75853`); `vercel deploy --prod` there redeploys it.
Its screenshots are the sample project in a packaged app, driven over Chrome's debugging port
(`--remote-debugging-port`), since a plain browser can't draw Studio's 3D views.

- **What it carries** (`build/studio-bundle`):
  - the CAD tools with a Python of their own: uv's movable CPython 3.13, with cadgen and its `fea`
    extra pinned to the checkout's `.venv`. cadgen's STL and DXF builders run on the Node that
    Playwright ships in it, which cadgen finds itself when none is on PATH (since 0.7.26), so the
    Mac needs no Node;
  - their plugin, laid out by `scripts/studio-app-plugin.py`, with the app's paths left as
    `@@STUDIO_…@@` placeholders;
  - the plugin's page;
  - `studio.json`.
- **The build.** T3 Code's desktop build takes the bundle through `T3CODE_DESKTOP_STUDIO_BUNDLE`
  (`scripts/lib/studio-app.ts`). That gives it Studio's name, id, icon and copyright, and a plain
  DMG with no link schemes. The bundle goes in as a resource of its own and is kept out of
  `app.asar`, as T3 Code keeps its other staged resources: up to Mac 0.1.3 it was packed in both,
  so the app carried the CAD tools' Python twice. The name is also the `productName` in the app's package.json, which
  Electron starts the app under, so the app keeps its saved secrets in its own keychain item,
  "Studio Safe Storage". Under T3 Code's `t3code` it asked for T3 Code's item, and macOS wants the
  login password for that. Its package name, `text-to-cad-studio`, names the updater's download
  folder; under `t3code` the two apps' updaters shared one and emptied each other's downloads.
  By default it is signed ad hoc, without the hardened runtime, and has
  no update feed: macOS installs no update to an app signed ad hoc, so a new version is a new
  download.
- **Signed, it updates itself** (`STUDIO_SIGN=1`). The build signs with the Developer ID
  Application certificate in this Mac's keychain, under the hardened runtime with Studio's
  entitlements (`scripts/studio-app.entitlements.plist`: Electron and Playwright's Node compile
  JavaScript as they go, and the CAD tools' Python loads libraries signed by others), and Apple
  notarizes it. It skips T3 Code's passkey sign-in setup, which needs T3's own Apple profile. It
  carries a zip and Studio's update feed, the releases of `amywork777/studio-download`: T3 Code's
  updater checks 15 seconds after launch and every 4 minutes. It downloads nothing by itself and
  installs nothing on quit (T3 turns both off, `DesktopUpdates.ts`): a found update shows as the
  sidebar's update button, one click downloads it and the next restarts into it. The button is at
  the foot of the list beside the rail, and on the rail above Settings while the list is folded and
  an update waits (`StudioRail.tsx`). Under the hardened runtime without those
  entitlements, Playwright's Node crashes and the bundled Python can't load its own library; with
  them both run (checked 2026-10-22, signed ad hoc with `--options runtime`).
  - **Once, on Amy's Mac:** join the Apple Developer Program; in Xcode, Settings, Accounts, Manage
    Certificates, add a Developer ID Application certificate; make an app-specific password at
    account.apple.com; then save it for notarization with
    `xcrun notarytool store-credentials studio-notary --apple-id <Apple ID> --team-id <Team ID>`
    (it asks for the password, which stays in the keychain).
  - **Each release:** `STUDIO_SIGN=1 APPLE_KEYCHAIN_PROFILE=studio-notary RUSTUP_TOOLCHAIN=1.95
scripts/build-studio-app.sh <version>`, then the `gh release create` line it prints: the DMG
    under its one name, and the zip, its blockmap and `latest-mac.yml` the updater reads. It needs
    about 10 GB free: the last release's files in `release/` and `build/studio-bundle` can go once
    it is published. 0.1.3 ran out on its last step (2026-10-22), which now moves the DMG and the
    zip out of the stage instead of copying them; its zip was made from the notarized DMG's app
    with `ditto -c -k --sequesterRsrc --keepParent`, as 0.1.2's was. 0.1.4 (2026-10-23) built
    whole from 8.6 GB free plus the 7.8 GB iOS simulator runtime Amy chose to delete. Publish as a
    draft with the Windows files too (`gh release create ... --draft`, then `gh release edit
--draft=false --latest`), so neither updater ever reads a release without its feed.
  - The first signed version is still a download: a copy signed ad hoc has no feed to find it.
- **On each start**, the app's boot step (`apps/desktop/src/studio/studioAppBundle.ts`) points
  it at `Resources/studio`:
  - its own home, `~/.text-to-cad-studio`;
  - its own Electron profile, named by its id, `com.amywork777.studio`, apart from T3 Code's;
  - its name;
  - the plugin, copied into the home with this copy's paths filled in.
- **Gatekeeper.** Unsigned, the person chooses Open Anyway once (System Settings, Privacy and
  Security). The boot step then clears the download's quarantine from the bundled Python, so
  macOS doesn't stop each of its programs again.

**The Windows app.** The same script, run in Git Bash on Windows, builds the installer
`release/Studio-<version>-x64.exe`. `.github/workflows/studio-windows.yml` runs it on GitHub's
windows-latest (Run workflow with a version, or a push to an `amy/studio-windows…` branch), installs
the result there, checks the CAD tools import in the installed app, and keeps the installer, its
blockmap and `latest.yml` as the run's artifact for three days (`gh run download`). Publish it into
the version's release with the `gh release upload` line the script prints, which adds
`Studio-Setup.exe`, the download's one name. Both apps' updaters read the latest release, so from
0.1.3 on every release carries `latest-mac.yml` and `latest.yml` together: a release with only one
leaves the other platform's updater with an error. The 0.1.3 installer is about 320 MB (482 MB while
the CAD tools went in twice) and installs, with no questions, in about four minutes to
`%LOCALAPPDATA%\Programs\text-to-cad-studio`: the one-click installer names the folder by the
package name. The CAD tools' 20,000 or so small files are most of those minutes; one archive
unpacked on the first start would cut them. Their deepest path is about 220 characters under a
short user name, so a long one comes near Windows's 260.

- **Unsigned for now.** Windows warns the first time it opens (More info, then Run anyway), and
  Smart App Control or a company's IT can block it outright. Unlike macOS, Windows installs updates
  to an unsigned app, so every Windows build carries Studio's feed (`latest.yml`), and a signed
  version later updates an unsigned one. Signing is Microsoft Trusted Signing in Amy's name: an
  Azure account, a Trusted Signing account, identity validation as an individual, a certificate
  profile, and an app registration whose secrets go in this repository's GitHub secrets under the
  `AZURE_*` names T3 Code's build reads; then `STUDIO_SIGN=1` signs it.
- **Where it differs from the Mac's.** uv's Windows CPython keeps `python.exe` at the top of its
  folder (`resources\studio\python\python.exe`), and the boot step writes paths into the plugin
  with forward slashes, quoted in the skills when they hold a space (a user folder like
  `C:\Users\Amy Zhou`). T3 Code's Windows payload check holds its own payload to 80 loose files,
  to keep its installer quick; Studio's build skips that budget, since the CAD tools' Python alone
  is about 20,000 files (the rest of the app is 55). Its icon is the brand kit's `favicon.ico`,
  which has every size Windows draws.
- **Installing packages.** This Mac's checkouts leave `apps/mobile` out (a sparse checkout), and
  pnpm then refuses to install over the mobile app's unused patches. GitHub's checkout includes it
  and installs only the desktop app's packages, as T3 Code's release does; locally, add
  `apps/mobile` to the sparse checkout and install with the same `--filter`s.

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
files ("Servo bracket", "Servo bracket drawing", "Servo bracket STL", not
`parts/servo_bracket.step`) on the project page, tabs, file chips in the chat and the work log (`components/workbench/partNames.ts`), says what
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
  Drive shows a folder (`components/workbench/ProjectEverything.tsx`): every kind of file
  together (its chats are down the left), each marked by its kind's icon in its kind's color
  (`KIND_TINTS`), filtered by type (CAD, Electronics, Analysis, Manufacturing, Documents,
  References), as a list (name, kind, how a part's checks went or where a file is) or as cards
  with pictures (a part's with its checks, drawing and manufacturing files); then the parts' versions, the project's
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
  since the last scan; a project removed from Studio is offered again. Inside a project, Import
  beside New, or files dropped on its Overview, copy what is picked into the project's folder,
  never over a file there (`importIntoProject.ts`). The desktop app reads and copies (`apps/desktop/src/studio/`); what makes a
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
  PRD, the engineering requirements, an FMEA or a design review, each with its sections
  (`newTemplates.ts` `DOCUMENT_TEMPLATES`; general to any engineering, so a team's own formats,
  such as a client's PRD or an xRD, come in as templates), or one of the person's own templates, any
  file in the Templates folder beside Studio's projects (`<projects folder>/Templates`), which the
  agent follows section by section (`documentTemplates.ts`; Add a template copies one in). The
  agent fills each section from the project and writes what is not known as an open question.
- **Sizes** (Amy, 2026-10-22: "Variables > pushing and pulling hundreds of features"). The
  Overview's Sizes is every named size in the project's scripts in one table, as a CAD tool's
  global variables (`ProjectSizes.tsx`): the shared ones first, with the parts that use them, then
  each part's own. Shared sizes live in `sizes.py` beside the parts, which import them by name
  (`from sizes import WALL`); a script's imports resolve from its own folder, so that is where the
  file goes, the folder holding most of the parts (`text-to-cad/skills/cad/references/edit-mode.md`
  tells the agent). A number changes where it is written, a click away, and every part that
  imports its file builds again; a formula (`2 * WALL`) changes where its sizes are. Add shared
  size appends one, and Use it in parts asks the agent to put it to work; the agent is told of
  each change in a hidden note, as of a restore. A project with several folders shows each
  folder's sizes under its name, since each folder's imports are its own, and Add shared size
  writes in the first folder with sizes, saying which. The CAD service reads the sizes from the source
  without running anything (`cadgen/edit/sizes.py`, `/__cad/sizes`), so a CAD service started
  before them needs a restart to show them.
- **Versions and What changed.** Every chat turn's checkpoint is a version. The Overview's
  Versions lists a part's versions, newest first, each with when and which chat made it (and Now,
  for a hand edit since the last turn), and shows what changed between the one picked and the one
  before, or any earlier one: the part as one model (added green, removed red, unchanged
  see-through grey) or side by side, the named sizes of its script that changed, its volume and
  size, how its checks went at each, and the script's lines on request. The CAD service reads the
  versions with git and compares the solids in a process of its own
  (`text-to-cad/packages/cadgen/src/cadgen/edit/versions.py` and `solid_diff.py`, ported from
  Fixture's `diff_revision.py`; routes `/__cad/versions` and `/__cad/versions/compare`). It
  writes under the project folder's `.studio/compare/`, which git is told to leave out. A picked
  version that is not the newest has Restore this version, as Google Docs does, with no question
  first: the part's file and its script go back to how that version had them
  (`/__cad/versions/restore`), what was on disk kept first as a version unless one already holds
  it (a commit under `refs/studio/kept/`, made with an index of its own, listed as what you had
  before restoring), and the agent hears of it with the next message, as a hand edit's note.
- **Home, the switcher and the chats.** In Engineering, Home is where you start and pick up where
  you left off, and Projects is every project (Amy, 2026-10-23: they showed the same, since
  Projects went to Home): a top bar with the mark and a search that opens the quick find, then a box for what to
  make, in two modes on the part toolbar's segmented control, each named with its button's word.
  Start, from an idea: Start sends what was typed to a new project (made, with a first chat that
  sends it as its first message), or, with a project of yours chosen beside Attach
  (`ProjectPicker.tsx`, the project switcher's own control and list, `ProjectChoices.tsx`), to a
  new chat in that project. One line is enough. Set up, from files: a drop area for a PRD,
  requirements, sketches, CAD or a whole folder (Choose files or
  folders picks either in the desktop app), an optional What it is line, the three steps it takes
  (add what you have, Studio reads it and fills in the Overview, you answer what's left) and Set
  up project, always a new project. Switching keeps what was typed and attached. In both modes
  the files attached (Attach, the drop area, or dropped on the box) go into the project's
  References (`brief/references/`), where the Overview lists them and every chat can read them,
  and the first message names them and asks the agent to read them all before anything else,
  then fill in the project's name, setup and README from them and ask only what they leave open
  (`startMessage` in `startProject.ts`). A project can start from files alone, named after the
  first; in the web app, without paths to copy, they go with the first message instead. Then
  the starred projects and the last four worked on, with All projects to the Projects page
  (`ProjectsHome.tsx`: every project, a box to find one, the folders in no project), and New and
  Import beside them to add one, on both pages: New is the same New and dialog as a
  project's toolbar (`StudioNew.tsx`), where Create makes a new project and hands the job to its
  first chat. Every project is pictured by
  its first assembly (else its first part or board; `useProjectCover.ts`), with Import, all in one
  column so the box and the tiles line up. A picture that came back empty (the CAD plugin still
  starting) is asked for again (`usePictures.ts`). A project with a chat waiting on the person (a
  question, an approval) comes first, says Needs you (on Home, in the switcher's list and in
  Cmd+K), and opens on that chat; Home lists no chats of its own. A tile's right-click, or the …
  on its hover, is the project's menu, the switcher's own actions in its words
  (`ProjectMenu.tsx`). A project opens in the thread last
  open in it on this device (else the one last worked on, else a new one), with its Overview
  across the window (`useOpenProject.ts`). Projects are
  listed as a recents list orders them, the one opened last on this device first (or worked on, if
  that came later), and the starred ones (kept on this computer) apart at the top of Home and the
  switcher. The sidebar is a rail of places down the far left, as Slack's (Amy, 2026-10-22,
  `StudioRail.tsx`): Home, Chats, Projects and Needs you (with how many chats wait on you), and
  Settings at its foot, each icon labelled and each opening its own page, as Claude's and ChatGPT's
  open Chats and Projects (Amy: "each one should open its own page"): Chats, every chat with a box
  to find one (`ChatPages.tsx`, `allChats.ts`); Projects, the Projects page; Needs you, the chats
  waiting on your answer or approval in any project. The rail marks the page that shows, and
  Projects inside a project (`studioPlaces.ts`). Beside the rail the column says where you are
  (`StudioSidebar.tsx`): on Studio's pages the recent chats, each with its project's name; inside
  a project, the project; on Settings, its sections (T3's settings list inside Studio's frame,
  `StudioSidebarFrame`), so the rail stays there too. Folding it (the panel button beside the window's controls, or its
  shortcut) keeps the rail (`collapsible="icon"`). Inside a project the column has All projects to
  go back, then at its top the project's name, a control on one line with its picture that switches projects
  (`components/workbench/ProjectSwitcher.tsx`, also Cmd+O, which is the quick find on Home), whose
  top is the project's own menu (Rename, Duplicate, a copy in a new folder made by the desktop
  app, Version history once it has a part, Back up, Show in Finder, and Remove from Studio, which
  asks first and keeps the folder's files to import again; T3's Remove project in Settings is
  hidden in Engineering), then its Overview, New chat, and its chats, newest first, which fold
  away under their heading as an Overview module folds (`chatScope.ts`). Like Claude's and
  Codex's sidebars, the panel button is a plain dark icon and the rows and their icons read dark,
  with the lists' labels quiet (`brand/theme.css`). T3 Code drew the button white for its stage
  artwork, which a fork's mark replaces, so on Studio's light sidebar it nearly vanished. The
  footer's Home icon is only in T3 Code's sidebar beside code tools, and its Settings only outside
  Studio's rail. Opening a chat from another project opens that project. What the project holds is on its
  Overview. The top bar names the open chat; with
  the sidebar folded (T3 Code's toggle or its shortcut) it leads with the mark and the project's
  switcher. The panel's tabs are what was opened lately in the project, along its top as a
  browser's are (`brand/theme.css`), and the same beside each of the folder's chats, as a Chrome
  window's (`projectTabs.ts`): the Overview pinned first as its icon, then each file with its kind's
  colored icon (`FileKindIcon.tsx`) at its left and its close at its right, as Chrome's are, the
  one in front joined to the toolbar under them. There is no + (New is the one way to add), a
  panel with every tab closed shows the Overview, and a tab's menu has no Copy path. The
  toolbar is one line of what can be done (`StudioPanelBar.tsx`): over a part, Evaluate,
  Manufacture and Document; then Simple view where the viewer in front has two layouts; and
  Import and New, always there, at its right end, as Home has them (`StudioNew.tsx`, which hosts
  New's dialog in Engineering); a narrow window's panel sheet keeps it. Whatever
  writes into the chat (these menus, Cmd+K, the viewer's Add to chat, the Overview) brings the
  chat back from a panel filling the window, as does a question or approval the agent waits on
  and a notification's Open chat (`useShowWaitingChat`), except a hand edit's note, which goes in quietly
  and leaves the keyboard in the view (`viewContext.ts`). Engineering with code keeps T3 Code's
  thread sidebar, with the projects listed in it.
- **Back up.** A project is already a folder on the Mac with its versions in it; the project's
  menu backs it up somewhere else (`components/workbench/BackupDialog.tsx`). GitHub: a private
  repository Studio makes for it with T3 Code's own publish, then each backup committed and
  pushed over https, as the account the source control settings are signed in as; Studio pushes
  only to a repository it made, so a folder with a repository of its own is left to it. Or a
  folder that syncs (a Google Drive, Dropbox or iCloud folder, or a drive): the desktop app copies
  each of the project's folders there, version history (`.git`) included, then only what changed,
  and never deletes from it (`backUp` in `apps/desktop/src/studio/studioImportFiles.ts`). Import
  brings a folder backup back. Not signed in to GitHub is said so, with Set up GitHub (Settings'
  Source control), never the GitHub tool's commands; a finished backup's toast opens it, on
  GitHub or in Finder. Where and when are remembered on this computer and shown under the
  menu (`useBackup.ts`).
- **Quick find.** In Engineering ⌘K finds a project, a part (with its picture), a document or a
  chat in any project (one in another project opens there; with nothing typed, the open
  project's), or any job for the part on screen, with Home, New project, Take the tour, Settings and the interface switches
  (`components/workbench/StudioQuickFind.tsx`). Engineering with code keeps T3 Code's command
  palette.
- **Getting around.** The top bar is a path, the project then the open chat, the project's name
  opening its Overview (`StudioWorkspaceBar.tsx`). The panel's tabs take Chrome's shortcuts:
  Ctrl+Tab and Ctrl+Shift+Tab go round them, Cmd+1 to 8 to one by its place and Cmd+9 to the last
  (`panelTabShortcuts.ts`, ahead of T3 Code's own Cmd+number), and a file opens in one tab
  however its path was written or whoever opened it (`sameFile.ts`), from a chat link or a part
  mentioned in the composer alike. Cmd+K outside a project opens on Recent (chats and files opened
  lately, as Drive's Recent does; files opened beside a chat are remembered, `recentFiles.ts`). In
  Engineering a document always reads as a document: rendered, with no source view, editor or
  file tree beside it (`FilePreviewPanel.tsx`), and a parts list as a table and a page as a page.
  A file with no viewer of its own (G-code, Gerbers, a schematic, a spreadsheet, a zip) gets a
  page saying what it is, with Open in its own app on this Mac ("Open the spreadsheet"; the
  desktop app opens documents, sheets, drawings and models only, never a script or an app), Show
  in Finder, and its text one press away, read only (`StudioFilePage.tsx`, `aboutFile.ts`); a
  check's result reads as a report. A document has no title block over it in Engineering (its
  first heading is its title), and the Overview's README is typed into where it reads, like a
  document (`ReadmeOverview.tsx`, `replaceReadmeText`). A file chip in the chat shows its kind's
  icon, says what the file is and where on hover, and offers Open and Show in Finder. Studio has
  one name for each thing and one way to do it: new UI reuses the component and the words that
  already exist (Home's New is the toolbar's; Home is "Home" everywhere; the chat says "AI
  agent", as Settings does).
- **Onboarding.** Setup speaks Studio's words and ends at signing in to Claude or Codex
  (`WelcomeWizard.tsx`; Home brings in files). A first Home says Welcome to Studio and offers a
  sample project the agent builds in front of you (a servo bracket, its strength check, its
  drawing and its PRD; `homeExamples.ts`). The first workspace opened gives a four-step tour,
  once (`StudioTour.tsx`,
  `tourSteps.ts`): the project, its Overview, the tabs and the toolbar.
- **Ask, in no project.** Home's box has Start, Ask and Set up. Ask is a question about anything
  (a part made last week, a file, how something was done) with no project to choose or make, as
  Claude Code is asked from wherever it runs (Amy, 2026-10-23): a chat in the folder that holds
  the Studio projects, registered once as the workspace "No project", its first message telling
  the agent it is in no project, where the projects are, and that other work may be anywhere on
  the computer (`workbench/freeformChat.ts`). It opens as a chat alone; Chats and the sidebar list
  it under No project.
- **Invite codes.** A friend without ChatGPT uses Codex on Amy's OpenAI key: the first screen's
  Invite code row, under the Claude and Codex cards, so a friend never has to pick Codex (in
  Settings it is AI agents, Codex), paste the code
  (`CodexInviteCode.tsx`, `codexInvite.ts`). The dialog checks the code with Amy's invite server
  (`~/code/studio-invite`, studio-invite.vercel.app, deployed with the Vercel CLI, not on
  GitHub), puts the instance on Studio's own setup for as long as Codex is installed or found (only
  that setup installs Codex), then saves it as an "existing" instance run from that Codex, with
  the server as its provider in launch arguments and the code as a sensitive variable. Stop using
  it puts it back on Studio's own setup. Trap: Codex shows no models from a plain OpenAI model
  list, so the server answers the model list from Codex's own catalog (`npm run catalog` there).
- **The workspace reads like NX** (Amy, 2026-10-23: "really similar to NX", her team's CAD at
  Apple), in NX's words over the SolidWorks-built machinery below (`edit/nx.js`), with a toolbar
  laid out as Fusion's: tabs Solid, Sketch and Inspect (Assemble in an assembly, Drafting for the
  part's sheet) with Undo and Redo at the tab row's left, Solid's groups Create, Modify,
  Construct, Inspect and Select, each showing its most-used commands as buttons and the whole
  group in its title's menu; one Extrude
  (and Revolve, Sweep along Guide, Through Curves) whose Boolean, Unite or Subtract, opens the
  cut command with what was typed; dialogs with OK, Apply and Cancel at their foot; a Part
  Navigator numbering features as NX does ("Extrude (2)", an Edge Blend for a fillet), a box on
  each to suppress it, User Expressions folded above it, and the Datum Coordinate System (0) with
  its XY, XZ and YZ planes; a row's menu in NX's words (Edit Parameters, Edit Sketch, Suppress,
  Rename, Delete, Make Current Feature) and the viewer's warning on the feature a failed build
  points at; the sketch tools as NX names them (Finish Sketch, Rapid Dimension, Quick Trim). The
  script and the agent's notes keep their own names. Simple view reads the part once, quietly,
  after the model opens, so the full workspace opens on it at once (`useEditMode`). A pick in the
  workspace (a face or an edge on the model, a feature the person pressed in the Part Navigator or
  on the timeline, a sketch picked on the model) with no command open offers a small bar beside it
  (`edit/EditSelectionBar.jsx`, `selectionBar.js`): Ask, Add to context, Annotate and Edit (Edit
  Parameters, or Edit Sketch; a face has none until the engine says which feature made it). A feature a command's OK
  selected is not a pick, or the bar would stand over the part all the while it is worked on. Ask,
  in the bar or the toolbar, opens Quick Edit, which the workspace shows only once asked (with
  nothing picked, on the part as a whole); Escape, a send, its X, the picks emptying or a command or
  sketch opening put it away (`selectionBarState.js`). A feature chosen goes to the agent as a
  `text-range` reference to its line in its script, with a chip named as the Part Navigator names it
  ("Hole (6)"), the chip's X letting go of the pick (`featureAsk.jsx`; the script's absolute path is the
  engine's `root` with the feature's `file`). Add to context, in the bar or the toolbar's Ask the agent group, is Quick Edit's
  Queue without the note (`useAddToContext.js`, `addToContext` in `quickEditPrompt.js`): it puts the same references Ask carries,
  the marks on a face and the snapshot a Queue would attach, into the chat box without sending, and lets go of the picks (and the ink) once they are
  there, so faces, edges and features can be collected and one message written; a failure keeps them and is said in the viewport's card.
  It is there only where the host has a chat box to fill (`canAddToContext`: never in Jake's standalone viewer), and the toolbar's is
  dimmed, saying "Select a face, edge or feature first", until something is picked or drawn (ink alone is something to add). While a command, a sketch or a panel is open its
  picks are the model's selection (an Edge Blend's edges), which a delivery or a send would let go of, so the toolbar's Ask and Add to
  context are both dimmed, saying "Finish or cancel the command first" (Simple view's switch says the same of the same hold), and the
  bar is not shown. Quick Edit's X and a send let go of a feature chosen too, as a press on the background does. Annotate, the
  toolbar's third agent button, is the viewer's own Pencil with Shapes in its chevron's menu, each showing what it draws with (the
  bar's Annotate takes up the Pencil). Marks drawn on a face go to the agent as shapes in that face's own coordinates, in the part's
  units (`kit/tools/annotate/faceShapes.js`: a mark on one face alone, flat on it and all of it over the part; any other stays with the
  picture and the faces it touches; a shape said as what it is on the face, so a rectangle drawn on a face slanted to the view is the
  polygon of its four corners there), as a text part after the references, in every way Quick Edit goes and in Add to context. Simple view's Quick Edit is as
  it always was, but for those marks, which it carries too.
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
  never by a message of its own. Edit Parameters reopens a feature's panel, Suppress sets one aside,
  and the rollback bar (dragged, or put under a feature by Make Current Feature) shows the part as
  it was above a feature, new features going in there. An
  assembly places its parts: double-click one in its design tree (Open Part) and the part opens on
  its own, in a tab of its own when the assembly is a project file's tab
  (`studio/open-file`, a plugin view's request to open a file beside the thread). The engine is `text-to-cad/packages/cadgen/src/cadgen/edit/` (a
  tracer that runs the script with every number remembering where it is written, in a process of
  its own, behind the viewer's `/__cad/edit/*` routes, and `commands.py`, which matches a
  selection to the part by its geometry and writes a command's line); the frame is
  `text-to-cad/packages/ui/src/renderers/step/edit/`. The CAD skill's `references/edit-mode.md`
  tells the agent how to write parts that edit well.
- **Simple view.** Studio's bar turns it on and off where the CAD viewer in front has two layouts.
  On, the viewer's ai layout, text-to-cad's view exactly as it ships, where a selection goes to
  the agent through Quick Edit; off, the full workspace (edit mode). One choice for the person,
  across projects, the full workspace the first time (`workbench/simpleView.ts`). The viewer says
  what its part allows (`studio/notifications/edit-state`, to a host offering `studioEditState`):
  a STEP with no part script has one layout, so no toggle shows, and a command, sketch or pick
  open, or a change saving, holds the toggle until it is finished or cancelled; a view that closes
  or opens another file forgets it (`workbench/viewerEditState.ts`). The part tabs run along the
  panel's bottom. The viewer takes the layout from its host context (`studio/editLayout`) and then
  shows no switch of its own; elsewhere its navbar keeps the switch, as Manual and AI. In the full
  workspace, what a command uses is plain: a sketch is
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
  of common grades, or any name typed), process and quantity. Picking a value sends the request
  to the chat ("Change the project's material to PETG."); the agent changes the project's
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
  jobs. Each needs its text-to-cad skill (`components/workbench/hardwareActions.ts`) and sends
  the job, naming the part, to the chat, as New's Create does: each prompt asks for what it needs
  (the loads, the machine), so nothing waits on a second press. The composer's / menu offers
  Studio's own commands in plain words and the skills, not the agent's coding commands.
- **Three kinds, and work done on them.** What is designed is CAD, Electronics or Documents, and
  New offers those. FEA and CAM are not kinds of design but work done on one, for parts and boards
  alike, so what Evaluate, Manufacture and Document make (analysis, manufacturing files,
  drawings) belongs to the part it was made from, as a CAD system keeps a study or a toolpath with
  its part. Each kind has one icon wherever it shows: the sidebar, New, the Overview's modules and
  badges, the top bar's menus, the quick find and the chat's change chips
  (`components/workbench/kinds.ts`), in a color of its own: blue CAD (the one blue), violet
  electronics, magenta documents and drawings, cyan analysis, steel grey manufacturing. Never
  red, amber or green, which say how a check went.
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
