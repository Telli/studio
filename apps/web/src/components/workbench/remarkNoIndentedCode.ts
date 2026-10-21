import type { Processor } from "unified";

function remarkNoIndentedCode(this: Processor): void {
  const data = this.data() as unknown as Record<string, unknown>;
  const extensions = (data["micromarkExtensions"] ??= []) as unknown[];
  extensions.push({ disable: { null: ["codeIndented"] } });
}

/**
 * Remark plugins for Studio's documents: text indented four spaces reads as text, not as a code
 * block. In a PRD or a report an indented line is a step of a list (a template's "4. User
 * insights"), never code; fenced code (```) is still code.
 */
export const DOCUMENT_REMARK_PLUGINS = [remarkNoIndentedCode];
