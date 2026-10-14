import type { ChatComposerHandle } from "../chat/ChatComposer";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A picture's file name from its title ("CAD view · bracket.step" is `cad-view-bracket-step.png`). */
export function viewImageName(title: unknown, index: number): string {
  const slug =
    typeof title === "string"
      ? title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 60)
      : "";
  return `${slug || `view-${index + 1}`}.png`;
}

/** What a view adds to the chat, split into the composer's text and its attachments. */
export function readViewContext(content: ReadonlyArray<unknown>): {
  readonly text: string;
  readonly images: ReadonlyArray<{
    readonly name: string;
    readonly data: string;
    readonly mimeType: string;
  }>;
} {
  const texts: string[] = [];
  const images: Array<{ name: string; data: string; mimeType: string }> = [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    if (block.type === "text" && typeof block.text === "string" && block.text.trim() !== "") {
      texts.push(block.text.trim());
    } else if (block.type === "image" && typeof block.data === "string") {
      const meta = isRecord(block._meta) ? block._meta : {};
      images.push({
        name: viewImageName(meta["openai/title"], images.length),
        data: block.data,
        mimeType: typeof block.mimeType === "string" ? block.mimeType : "image/png",
      });
    }
  }
  return { text: texts.join("\n\n"), images };
}

/**
 * Puts what the viewer added (its "Add to chat": the person's words, the file
 * and the references they picked, a picture of the view) into the composer,
 * where it can be read and edited before it goes to the agent.
 */
export function addViewContextToComposer(
  composer: ChatComposerHandle | null,
  content: ReadonlyArray<unknown>,
) {
  if (composer === null) return;
  const { text, images } = readViewContext(content);
  if (text !== "") composer.insertTextAtEnd(text, { ensureLeadingBoundary: true });
  if (images.length > 0) {
    composer.addDroppedFiles(
      images.map(
        (image) =>
          new File([Uint8Array.from(atob(image.data), (char) => char.charCodeAt(0))], image.name, {
            type: image.mimeType,
          }),
      ),
    );
  }
  composer.focusAtEnd();
}
