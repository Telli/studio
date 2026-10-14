import { pluginFileHandlers, type PluginViewChoice } from "@t3tools/client-runtime/state/plugins";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import {
  BoxIcon,
  CircuitBoardIcon,
  FileCogIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  ImageIcon,
  PencilRulerIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useComposerHandleContext } from "~/composerHandleContext";
import { useWorkspaceMutationRefresh } from "~/hooks/useWorkspaceMutationRefresh";
import { cn } from "~/lib/utils";
import { useRightPanelStore } from "~/rightPanelStore";
import { pluginEnvironment } from "~/state/plugins";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { pluginAppSurface } from "../plugins/pluginSurfaces";
import { Input } from "../ui/input";
import { BRIEF_JSON, parseBrief } from "./briefFolder";
import { readTunnelDataUrl, readTunnelJson } from "./partContext";
import { ProjectBriefRow } from "./ProjectBrief";
import { groupProjectFiles, type ProjectFile, type ProjectGroup } from "./projectFiles";

const GROUP_ICONS: Record<ProjectGroup, typeof BoxIcon> = {
  Models: BoxIcon,
  "Boards and wiring": CircuitBoardIcon,
  Drawings: PencilRulerIcon,
  "Studies and jobs": FileCogIcon,
  Documents: FileTextIcon,
  "Fabrication files": FileSpreadsheetIcon,
  Images: ImageIcon,
  References: FileIcon,
};

/** Pictures the viewer's library took, by workspace path; one fetch per page and picture. */
const pictureCache = new Map<string, string | null>();

function usePictures(input: {
  readonly threadRef: ScopedThreadRef;
  readonly cwd: string;
  readonly cad: PluginViewChoice | null;
  readonly paths: ReadonlyArray<string>;
}): ReadonlyMap<string, string> {
  const { threadRef, cwd, cad } = input;
  const request = useAtomCommand(pluginEnvironment.request, { reportFailure: false });
  const [pictures, setPictures] = useState<ReadonlyMap<string, string>>(new Map());
  const wanted = input.paths.join("\n");

  useEffect(() => {
    if (cad === null || wanted === "") return;
    let cancelled = false;
    const route = async (url: string) => {
      const result = await request({
        environmentId: threadRef.environmentId,
        input: {
          threadId: threadRef.threadId,
          pluginId: cad.pluginId,
          server: cad.view.server,
          method: "tools/call",
          params: { name: "cad_http", arguments: { method: "GET", url } },
        },
      });
      return result._tag === "Success" ? result.value.result : null;
    };
    void (async () => {
      const recents = await readTunnelJson(await route("/__cad/recents")).catch(() => null);
      const list =
        typeof recents === "object" && recents !== null && "recents" in recents
          ? (recents as { recents: Array<{ path?: unknown; thumbnail?: unknown }> }).recents
          : [];
      const root = cwd.replace(/[\\/]+$/, "");
      const found = new Map<string, string>();
      for (const path of wanted.split("\n")) {
        const absolute = `${root}/${path}`;
        const entry = list.find((recent) => recent.path === absolute);
        if (typeof entry?.thumbnail !== "string") continue;
        const key = `${absolute}\n${entry.thumbnail}`;
        if (!pictureCache.has(key)) {
          pictureCache.set(
            key,
            readTunnelDataUrl(
              await route(`/__cad/thumbnail?name=${encodeURIComponent(entry.thumbnail)}`),
            ),
          );
        }
        const picture = pictureCache.get(key);
        if (picture) found.set(path, picture);
      }
      if (!cancelled) setPictures(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [request, threadRef.environmentId, threadRef.threadId, cwd, cad, wanted]);

  return pictures;
}

function FileTile(props: {
  readonly file: ProjectFile;
  readonly picture: string | undefined;
  readonly onOpen: () => void;
}) {
  const { file } = props;
  const Icon = GROUP_ICONS[file.group];
  return (
    <button
      type="button"
      onClick={props.onOpen}
      className="group flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-background text-left outline-none transition-colors duration-150 hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <span className="flex aspect-[4/3] items-center justify-center border-b border-border bg-muted/50">
        {props.picture ? (
          <img src={props.picture} alt="" className="size-full object-contain p-2" />
        ) : (
          <Icon className="size-7 text-muted-foreground/60" aria-hidden="true" />
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
        <span className="truncate text-xs font-medium text-foreground">{file.name}</span>
        <span className="truncate text-2xs text-muted-foreground">
          {file.kind}
          {file.folder === "" ? "" : ` · ${file.folder}`}
        </span>
      </span>
    </button>
  );
}

/**
 * The project page, the engineering interface's Project tab (in place of the
 * file explorer): the project's name and brief, then everything it holds,
 * filed as an engineer files it (models, boards, drawings, studies and jobs,
 * documents, fabrication files), each a tile that opens in the viewer or as a
 * document. References are the brief and what it gathered. Source stays in
 * the code interface's explorer.
 */
export function ProjectPage(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly projectName: string;
  readonly threadRef: ScopedThreadRef;
  readonly workspaceMutationId: string | null;
}) {
  const { environmentId, cwd, threadRef } = props;
  const [tab, setTab] = useState<"files" | "references">("files");
  const [query, setQuery] = useState("");
  const composerRef = useComposerHandleContext();
  const listing = useEnvironmentQuery(
    projectEnvironment.listEntries({ environmentId, input: { cwd } }),
  );
  useWorkspaceMutationRefresh({
    mutationId: props.workspaceMutationId,
    refresh: listing.refresh,
    resourceKey: `project-page:${cwd}`,
  });
  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} })).data
    ?.plugins;
  const storedBrief = useEnvironmentQuery(
    projectEnvironment.readFile({ environmentId, input: { cwd, relativePath: BRIEF_JSON } }),
  ).data?.contents;
  const links = (parseBrief(storedBrief)?.links ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const paths = useMemo(
    () =>
      (listing.data?.entries ?? [])
        .filter((entry) => entry.kind === "file" && entry.ignored !== true)
        .map((entry) => entry.path),
    [listing.data],
  );
  const groups = useMemo(() => groupProjectFiles(paths, query), [paths, query]);
  const shown = groups.filter(({ group }) =>
    tab === "references" ? group === "References" : group !== "References",
  );
  const referenceCount = groups.find(({ group }) => group === "References")?.files.length ?? 0;
  const cad = useMemo(
    () => (plugins === undefined ? null : (pluginFileHandlers(plugins, "model.step")[0] ?? null)),
    [plugins],
  );
  const pictures = usePictures({
    threadRef,
    cwd,
    cad,
    paths: shown.flatMap(({ files }) =>
      files.filter((file) => file.group === "Models").map((file) => file.path),
    ),
  });

  const open = (file: ProjectFile) => {
    const panels = useRightPanelStore.getState();
    const viewer = plugins === undefined ? undefined : pluginFileHandlers(plugins, file.path)[0];
    if (viewer !== undefined) panels.openPluginApp(threadRef, pluginAppSurface(viewer, file.path));
    else panels.openFile(threadRef, file.path);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-project-page="">
      <header className="border-b border-border px-5 pt-5 pb-3">
        <div className="text-2xs font-medium tracking-widest text-muted-foreground uppercase">
          Project
        </div>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="min-w-0 truncate text-xl font-semibold text-foreground">
            {props.projectName}
          </h1>
          <div role="tablist" aria-label="Project contents" className="flex gap-1">
            {(
              [
                ["files", "Files"],
                ["references", referenceCount > 0 ? `References ${referenceCount}` : "References"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "h-7 rounded-md px-2.5 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  tab === id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {composerRef === null ? null : (
          <ProjectBriefRow environmentId={environmentId} cwd={cwd} composerRef={composerRef} />
        )}
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tab === "files" ? "Find a part, board or document" : "Find a reference"}
          aria-label="Find in the project"
          className="mt-3"
        />
      </header>

      <div className="flex flex-col gap-6 px-5 py-4">
        {shown.map(({ group, files }) => (
          <section key={group} aria-label={group}>
            <h2 className="sticky top-0 z-10 mb-2 flex items-baseline gap-2 bg-background py-1 text-2xs font-medium tracking-widest text-muted-foreground uppercase">
              {group}
              <span className="tabular-nums text-muted-foreground/70">{files.length}</span>
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
              {files.map((file) => (
                <FileTile
                  key={file.path}
                  file={file}
                  picture={pictures.get(file.path)}
                  onOpen={() => open(file)}
                />
              ))}
            </div>
          </section>
        ))}
        {tab === "references" && links.length > 0 ? (
          <section aria-label="Links">
            <h2 className="mb-2 text-2xs font-medium tracking-widest text-muted-foreground uppercase">
              Links
            </h2>
            <ul className="flex flex-col border-t border-border">
              {links.map((link) => (
                <li key={link} className="truncate border-b border-border py-1.5 text-xs">
                  {/^https?:\/\//.test(link) ? (
                    <a href={link} target="_blank" rel="noopener noreferrer" className="underline">
                      {link}
                    </a>
                  ) : (
                    link
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {shown.length === 0 && !(tab === "references" && links.length > 0) ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            {listing.data === undefined
              ? "Reading the project"
              : query.trim() !== ""
                ? "Nothing matches that."
                : tab === "files"
                  ? "Nothing here yet. The models, boards and documents the agent makes show up here."
                  : "No references yet. Add sketches, photos, datasheets or links in the brief."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
