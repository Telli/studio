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
sends your prompts, file names or designs. It works the way text-to-cad's own counts do. Nothing
is sent until you choose Share when the first launch asks, and **Settings → About → Share usage data** turns it
off and deletes what was sent. Setting `DO_NOT_TRACK=1` turns it off for the whole machine, and a
CI run (`CI` set) sends nothing. Counts go under a random install id to Studio's own receiver,
[`infra/usage`](infra/usage/README.md), which refuses anything outside this list and keeps the
rest in Studio's own database, not an analytics service; a build sends nothing unless it was made with the receiver's address, so a copy
you build yourself sends nothing. [`AnalyticsService.ts`](apps/server/src/telemetry/AnalyticsService.ts)
sends them, and this is every event it can send (tests fail when the code, the receiver and this
list differ):

- `client.connected`, `client.thread.started`, `client.turn.requested`
- `provider.turn.completed`
- `chatgpt.auth.started`, `chatgpt.auth.completed`, `chatgpt.transfer.started`,
  `chatgpt.transfer.completed`
- `studio.project.created`
- `cad.model.opened`, `cad.hand_edit`, `cad.size.changed`, `cad.size.added`,
  `cad.versions.compared`, `cad.version.restored`

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change request. Changes to the CAD tools go
to [text-to-cad](https://github.com/earthtojake/text-to-cad); changes to the app come here.

## Credits

Studio is built on [text-to-cad](https://github.com/earthtojake/text-to-cad) and
[T3 Code](https://github.com/pingdotgg/t3code).
