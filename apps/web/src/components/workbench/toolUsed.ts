const TOOL_LINE = /^Tool: ([^\n]+)\n+/;

/**
 * A job a tool started, opening on the line that names the tool. The chat draws that line as a chip
 * (`toolUsed`); the agent reads it, and a client that doesn't know it shows it as it stands.
 */
export function withToolLine(tool: string, prompt: string): string {
  return `Tool: ${tool}\n\n${prompt}`;
}

/** The tool a message came from, and the message without its line; null for one typed by hand. */
export function toolUsed(text: string): { readonly tool: string; readonly message: string } | null {
  const line = TOOL_LINE.exec(text);
  if (line === null) return null;
  return { tool: line[1]!, message: text.slice(line[0].length) };
}
