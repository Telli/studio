# Studio

Studio is a CAD app for mechanical engineers where an agent designs the part with you. You
describe a bracket, an enclosure or a sheet-metal part. The agent writes it as code with
[text-to-cad](https://github.com/earthtojake/text-to-cad), and the 3D model, drawings, strength
check and versions sit beside the chat. You can also edit the model by hand.

text-to-cad is the `text-to-cad/` submodule, and as it updates, Studio updates. Studio is MIT
licensed.

- **Download for Mac or Windows:** [texttocad.studio](https://texttocad.studio)
- **Build and run it from source:** [STUDIO.md](STUDIO.md)
- **The rules every change keeps:** [Studio's laws](AGENTS.md#studios-laws)

## Usage data

The app counts which features get used, anonymously, so we can see what works: chats started,
turns finished (provider, model, token counts, how long), projects made from a starter, and CAD
actions such as opening a model, a hand edit, changing a size or comparing versions. It never
sends your prompts, file names or designs. It works the way text-to-cad's own counts do: it is on
once the first launch has told you, nothing counted before that is sent, and **Turn off** on that notice or
**Settings → About → Share usage data** turns it off and deletes what was sent. A no you gave before stays a no. Setting `DO_NOT_TRACK=1` turns it off for the whole machine, and a
CI run (`CI` set) sends nothing. Counts go under a random install id to Studio's own receiver,
[`infra/usage`](infra/usage/README.md), which refuses anything outside this list and keeps the
rest in Studio's own database, not an analytics service; a build sends nothing unless it was made with the receiver's address, so a copy
you build yourself sends nothing. [`AnalyticsService.ts`](apps/server/src/telemetry/AnalyticsService.ts)
sends them, and this is every event it can send (tests fail when the code, the receiver and this
list differ):

- `client.connected`, `client.thread.started` (with the kind of AI it starts with: Claude, Codex and
  the rest), `client.turn.requested`
- `provider.turn.completed`
- `chatgpt.auth.started`, `chatgpt.auth.completed`, `chatgpt.transfer.started`,
  `chatgpt.transfer.completed`
- `claude.signed_in`: Claude went from signed out to signed in (a launch that finds it already
  signed in is not counted)
- `studio.updated`: a launch of another release than the one that ran last, with both versions
- `studio.skill.used`: a skill or job a message asked for, from a Toolbox tile, a job menu or typed
  by name (`$fdm`), named from Studio's own list of jobs and text-to-cad's skills, so a skill you
  added yourself is never named
- `studio.project.created` (by its starter, and whether it was made, imported, restored from a
  backup or copied), `studio.project.trashed`, `studio.project.restored`, `studio.project.deleted`
- `studio.sync.sent` (sent, nothing new to send, or failed), `studio.sync.restored` (a backup
  brought back, or failed), `studio.github.connected`
- `cad.model.opened`, `cad.hand_edit`, `cad.size.changed`, `cad.size.added`,
  `cad.versions.compared`, `cad.version.restored`
- `cad.action.failed`: one of those the CAD tools refused or could not do, named by which it was

With each batch go the app's version, the platform (Mac or Windows), the chip type and the mode
(desktop app or browser), and each event has a random id of its own and the time it was counted.
The receiver adds the country the request came from and keeps no address. What an event may carry
beside its name is listed in [`infra/usage/src/events.mjs`](infra/usage/src/events.mjs).

The CAD tools inside Studio (text-to-cad's) send the counts text-to-cad sends everywhere, under an
install id of their own that nothing links to Studio's. Studio points them at the same receiver and
turns them on and off with the same switch, so turning it off deletes theirs too, and a build without
the receiver's address keeps them off. Each counts what one process saw in a few minutes, and none
names a file, a path or anything typed. The receiver checks them by text-to-cad's own rules
([`infra/usage/src/cad/events.mjs`](infra/usage/src/cad/events.mjs), a copy a test keeps the same):

- `cadtools.tool`, `cadtools.tool_failure`: the CAD tools' calls, how many failed, and why, by a
  word the tools chose
- `cadtools.build`, `cadtools.build_failure`: builds by format (a model, STEP, STL and the rest), how
  they ended and how long they took
- `cadtools.snapshot`, `cadtools.snapshot_failure`: pictures of a model, the same way
- `cadtools.view`, `cadtools.files`, `cadtools.control`: times a CAD view was used, files shown by
  format, and which of the view's tools and settings were used (an export by its format, never a
  value chosen)
- `cadtools.feature`: assemblies, drawings, motion and the like, by name
- `cadtools.health`: the build workers started, crashed or restarted
- `cadtools.exception`: where the CAD tools' own code failed, by the error's type and the lines of
  their code it ran through, never its message; your own code is a bare `<user>`

Apart from these counts and its check for a newer Studio (on GitHub), the app makes a few plain
downloads, and no id goes with any of them: the list of AI models from
[T3 Code](https://github.com/pingdotgg/t3code) on GitHub (at most once an hour),
[LiteLLM](https://github.com/BerriAI/litellm)'s price table on GitHub (it prices the code tools'
usage page), and from Google the icon of a public site that an answer links to or the preview
opens, which tells Google that site's name and never the page.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change request. Changes to the CAD tools go
to [text-to-cad](https://github.com/earthtojake/text-to-cad); changes to the app come here.

## Credits

Studio is built on [text-to-cad](https://github.com/earthtojake/text-to-cad) and
[T3 Code](https://github.com/pingdotgg/t3code).
