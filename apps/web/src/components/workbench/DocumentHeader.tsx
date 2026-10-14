import { useEngineeringInterface } from "./studioInterface";

/** The document's own title: its first top-level heading, else its file name without the ending. */
export function documentTitle(text: string, relativePath: string): string {
  const heading = /^#\s+(.+?)\s*#*\s*$/m.exec(text)?.[1];
  if (heading) return heading.replace(/[*_`]/g, "").trim();
  const name = relativePath.slice(Math.max(relativePath.lastIndexOf("/"), 0)).replace(/^\//, "");
  return name.replace(/\.(?:md|mdx)$/i, "");
}

/** What kind of document it is, from its name: an engineer files by this. */
export function documentType(relativePath: string): string {
  const name = relativePath.toLowerCase();
  if (/plan/.test(name)) return "Plan";
  if (/brief|requirement|spec/.test(name)) return "Brief";
  if (/report|review|check|study|result|finding/.test(name)) return "Report";
  if (/instruction|procedure|assembly|guide/.test(name)) return "Instructions";
  return "Document";
}

function Cell(props: {
  readonly label: string;
  readonly children: string;
  readonly grow?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col justify-center gap-0.5 border-r border-border px-3 last:border-r-0 ${props.grow ? "flex-1" : "shrink-0"}`}
    >
      <dt className="text-2xs leading-none font-medium tracking-widest text-muted-foreground uppercase">
        {props.label}
      </dt>
      <dd className="truncate text-xs leading-tight text-foreground">{props.children}</dd>
    </div>
  );
}

/**
 * A document's title block in the engineering interface: what it is called,
 * what kind of document it is and where it lives, the way a drawing's title
 * block heads the sheet. Its body below reads as a document (`theme.css`,
 * `[data-document]`), not as a file.
 */
export function DocumentHeader(props: { readonly text: string; readonly relativePath: string }) {
  if (!useEngineeringInterface()) return null;
  return (
    <dl
      data-document-header=""
      className="sticky top-0 z-10 flex h-11 items-stretch border-b border-border bg-background"
    >
      <Cell label="Title" grow>
        {documentTitle(props.text, props.relativePath)}
      </Cell>
      <Cell label="Type">{documentType(props.relativePath)}</Cell>
      <Cell label="File">{props.relativePath}</Cell>
    </dl>
  );
}
