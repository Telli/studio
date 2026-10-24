import { createPromptContext, formatPromptReference, parsePromptReference, referencePart, resolvePromptMessage, textPart } from "@text-to-cad/core/prompt";

const stem = path => String(path || "").split("/").pop().replace(/\.[^.]+$/, "") || "view";
const stemOf = resource => stem(resource.kind === "url" ? new URL(resource.url).pathname : resource.path);
// Awaited the first time something reads it: a file is fetched only by a host that carries its bytes.
const lazy = start => {
  let started = null;
  return { then: (resolve, reject) => (started ??= Promise.resolve().then(start)).then(resolve, reject) };
};

/**
 * A paste into the note, line by line: each line that is a reference and nothing else — a file's
 * absolute path and the ids in it, `/models/base.step#o1.f2`, as Copy References and a chip's click
 * write one — is that reference (into any file); a paste that is the annotation as its chip copies
 * it (its annotation JSON, whole) is `[{ annotation }]`; every other line stays text. A reference
 * within a sentence is the sentence's. A line that is what one of the box's chips copied (`copied`:
 * what it copied, to the chip — an annotation's file path) is `{ chip, token }`.
 *
 * @param {string} pasted
 * @returns {Array<string | import("@text-to-cad/core/prompt").PromptReference | { annotation: object }>}
 */
export function pastedLines(pasted, copied = null) {
  const text = String(pasted || "");
  // The annotation, as its chip copies it: its annotation file's JSON, over several lines.
  const whole = parsedJson(text);
  if (whole && !Array.isArray(whole) && Array.isArray(whole.marks) && typeof whole.units === "string") return [{ annotation: whole }];
  return text.split(/\r?\n/).map(line => (copied?.has(line.trim()) ? { chip: copied.get(line.trim()), token: line.trim() } : null)
    ?? parsePromptReference(line) ?? line);
}

const parsedJson = text => {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  try { return JSON.parse(trimmed); } catch { return null; }
};

/** A reference as one line of text, the way Copy References writes it: what tells two apart. */
export const referenceToken = reference => formatPromptReference(reference);

/** The selection a Quick Edit attaches: what is picked in the file, not the file itself, which it always attaches. */
export const quickEditSelection = references => references.filter(reference => reference.target.kind !== "whole-resource");

/**
 * A Quick Edit as one prompt context: what the person wrote (no part for an empty note: Add to
 * context carries none), the file on screen (always), the
 * selection in it (`references`, in the prompt grammar), the marks drawn on a face as shapes in its
 * coordinates (`marks`, the text `faceShapes.js` words them in: a `marks` text part, none without any), and — once the host has made them
 * (`files`) — the current and drawn views with the annotation, inline
 * when small or named by the saved .snapshot.json path. No pictures are rendered or attached. Built at the press.
 *
 * @param {{ resource: object, references?: object[], text?: string, views?: { label: string }[],
 *   files?: Promise<{ snapshot?: string, inline?: string }> | null,
 *   read?: (path: string) => Promise<Blob>, marks?: string }} quickEdit
 */
export function createQuickEditContext({ resource, references = [], text, views = [], files = null, read = null, marks = "" }) {
  const note = String(text || "").trim();
  const parts = [
    ...(note ? [textPart(note, "text")] : []),
    referencePart({ resource: { ...resource }, target: { kind: "whole-resource" } }, "file"),
    ...quickEditSelection(references).map((reference, index) => referencePart({ ...reference, resource: { ...reference.resource } }, `reference-${index}`)),
    ...(marks ? [textPart(marks, "marks")] : []),
  ];
  if (files && views.length) {
    const name = stemOf(resource);
    const made = pick => { const path = files.then(pick); path.catch(() => {}); return path; };
    const path = made(result => result.snapshot || "");
    const inlineText = made(result => typeof result.inline === "string"
      ? `Snapshot JSON (cadgen snapshot --job):\n\`\`\`json\n${result.inline}\n\`\`\`` : null);
    parts.push({ id: "snapshot", kind: "attachment", label: "Snapshot (cadgen snapshot --job)",
      name: `${name}.snapshot.json`, mimeType: "application/json", path, inlineText,
      content: lazy(() => files.then(result => typeof result.inline === "string"
        ? new Blob([result.inline], { type: "application/json" }) : read(result.snapshot))), about: ["file"] });
  }
  return createPromptContext(parts);
}

/**
 * A Quick Edit as the person copies it: its references by their files' absolute paths, and its
 * snapshot as inline JSON or the path it was saved at.
 * @returns {Promise<string>}
 */
export async function copiedQuickEdit(context) {
  return resolvePromptMessage(context);
}

/**
 * What a Quick Edit's `prompt` (the shell's `quickEditPrompt`) attaches at a press, as `createQuickEditContext` takes it: the views
 * it carries, the files the host makes of them (none without views, or where the host makes none), how to read one, and the
 * marks drawn on a face, in words (`marks()`: "" without any, or where the view keeps none). Read within the press, the same for
 * every way a Quick Edit goes and for Add to context, so they carry the same.
 *
 * @param {{ views(): { label: string }[], files(views: { label: string }[]): Promise<object> | null, read(path: string): Promise<Blob>,
 *   marks?(): string } | null | undefined} prompt
 */
export function promptAttachments(prompt) {
  const views = prompt?.views() ?? [];
  const files = views.length ? prompt.files(views) : null;
  void files?.catch(() => {});
  return { views, files, read: prompt?.read, marks: prompt?.marks?.() || "" };
}

/**
 * Why a delivery did not go, in the words Quick Edit shows under its note: the host's own, else "The prompt did not go."; empty once
 * it went. Only a failed or cancelled receipt is a failure.
 */
export const deliveryFailure = result => (result && (result.status === "failed" || result.status === "cancelled")
  ? result.message || "The prompt did not go." : "");

/**
 * Whether the host has a chat box to fill: the prompt destination (`usePromptDestination()`) is a composer that can take context for
 * the person's next message. Quick Edit offers Queue where it holds, and the workspace Add to context; neither is offered elsewhere.
 *
 * @param {{ kind?: string, available?: boolean } | null | undefined} destination
 */
export const canAddToContext = destination => destination?.kind === "composer" && Boolean(destination.available);

/**
 * Add to context: the picks (`references`, in the prompt grammar) go into the host's chat box as context for the person's next
 * message, with no note and nothing sent. It is a Queue without the note: the file on screen, the picks, the marks on a face, and
 * the views and files the Quick Edit `prompt` would attach (`promptAttachments`; pass them only where Queue would, and no picture is
 * made for it).
 * Made and handed over inside the press, as Queue is, so the host binds its destination in the gesture. Never throws: a context that
 * cannot be made, or a host that cannot take it, is a rejection. Settles with the host's receipt (`deliveryFailure` reads it).
 *
 * @param {{ promptContext: import("@text-to-cad/core/prompt").PromptContextPort }} host
 * @param {{ resource: object, references: object[], views?: { label: string }[], files?: Promise<object> | null,
 *   read?: ((path: string) => Promise<Blob>) | null, marks?: string }} input
 * @returns {Promise<import("@text-to-cad/core/prompt").PromptDeliveryResult>}
 */
export function addToContext(host, { resource, references, views = [], files = null, read = null, marks = "" }) {
  try {
    return Promise.resolve(host.promptContext.deliver(createQuickEditContext({ resource, references, text: "", views, files, read, marks })));
  } catch (error) {
    return Promise.reject(error);
  }
}
