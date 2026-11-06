import type { EnvironmentId, InstalledPlugin } from "@t3tools/contracts";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { type LucideIcon, PlusIcon, PuzzleIcon } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../ui/dialog";
import { Input } from "../../ui/input";
import { ChatPage } from "../ChatPages";
import { findExamples } from "../examples/examples";
import { ExamplesModule } from "../examples/ExamplesModule";
import { useDocumentTemplates } from "../documentTemplates";
import { MENU_ICONS } from "../kinds";
import { useNewDialogStore } from "../newDialogStore";
import type { NewTemplate } from "../newTemplates";
import { OverviewModule } from "../OverviewModules";
import { CARD_GRID } from "../studioLayout";
import { useEngineeringInterface } from "../studioInterface";
import {
  availability,
  findItIn,
  LIBRARY_DOCUMENTS,
  type LibraryEntry,
  librarySkills,
  madeBy,
  makeOneTemplate,
  ownTemplateEntries,
  showsUpAs,
  skillName,
} from "./libraryCatalog";
import { LibraryCard } from "./LibraryCard";
import { LibraryPicture } from "./LibraryPicture";
import {
  filterLibrary,
  LIBRARY_GROUPS,
  type LibraryGroup,
  libraryGroup,
  type LibrarySearch,
} from "./librarySearch";
import { NeedsSkill, PluginsLink } from "./NeedsSkill";
import { SeeTheExample } from "./SeeTheExample";
import { useExamples } from "./useSampleProject";

/** Each group of document types by its place's icon: New's, then each part menu's (`kinds.ts`). */
const GROUP_ICONS: Readonly<Record<LibraryGroup, LucideIcon>> = { New: PlusIcon, ...MENU_ICONS };

/** A group's place on the page, which `group` in the URL scrolls to. */
const groupAnchor = (key: string) => `library-${key}`;

/** An entry's name: a document type's as New or the menus say it, a skill's as `skillLabel` does. */
const entryName = (entry: LibraryEntry, skillLabel: (name: string) => string) =>
  entry.kind === "document" ? entry.name : skillLabel(entry.name);

interface Group {
  readonly key: string;
  readonly title: string;
  readonly icon: LucideIcon;
  readonly entries: ReadonlyArray<LibraryEntry>;
}

/**
 * Studio's Library (`/library`, the one place on the rail for what Studio ships): the examples
 * first (`ExamplesModule`), then every document type Studio makes, grouped where it is found (New,
 * then the part menus Evaluate, Manufacture and Document), then every installed plugin's skills,
 * each a card with a picture of its real example (`LibraryPicture`) and its name. A card opens its
 * detail, kept in the URL (`entry`) so Back closes it; `group` scrolls to its group. Reached from
 * ⌘K, New, the part menus and Settings › Plugins (`libraryHref`).
 */
export function LibraryPage(props: { readonly search: LibrarySearch }) {
  const environmentId = usePrimaryEnvironmentId();
  return environmentId === null ? null : (
    <LibraryContent environmentId={environmentId} search={props.search} />
  );
}

function LibraryContent(props: {
  readonly environmentId: EnvironmentId;
  readonly search: LibrarySearch;
}) {
  const { environmentId, search } = props;
  const navigate = useNavigate();
  const router = useRouter();
  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} })).data
    ?.plugins;
  const ownTemplates = useDocumentTemplates(environmentId).templates;
  const examples = useExamples(environmentId).examples;
  const [query, setQuery] = useState("");
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const shownExamples = findExamples(examples, query);

  const documents = useMemo(
    () => [...LIBRARY_DOCUMENTS, ...ownTemplateEntries(ownTemplates)],
    [ownTemplates],
  );
  const skills = useMemo(() => librarySkills(plugins ?? []), [plugins]);
  const entries = useMemo(() => [...documents, ...skills], [documents, skills]);
  const matching = new Set(filterLibrary(entries, query));
  const groups: ReadonlyArray<Group> = [
    ...LIBRARY_GROUPS.map((group) => ({
      key: group,
      title: group,
      icon: GROUP_ICONS[group],
      entries: documents.filter((entry) => libraryGroup(entry) === group && matching.has(entry)),
    })),
    ...[...new Map(skills.map((skill) => [skill.pluginId, skill.pluginName] as const))].map(
      ([pluginId, pluginName]) => ({
        key: `plugin:${pluginId}`,
        title: `${pluginName} skills`,
        icon: PuzzleIcon,
        entries: skills.filter((skill) => skill.pluginId === pluginId && matching.has(skill)),
      }),
    ),
  ].filter((group) => group.entries.length > 0);

  // Every skill on the page by its one name (`skillName`): cards, details, Made by, what it needs.
  const skillLabel = (name: string) => skillName(name, skills);
  // Under a card's name: why it can't be made now. Nothing until the plugins are known.
  const offNote = (entry: LibraryEntry) => {
    if (plugins === undefined) return null;
    if (entry.kind === "skill") return entry.on ? null : "Turned off";
    const state = availability(entry, plugins);
    return state.on ? null : `Needs the ${skillLabel(state.skill)} skill`;
  };

  const selected = entries.find((entry) => entry.id === search.entry) ?? null;
  // The entry last open, so the detail keeps its content while it closes.
  const [lastOpen, setLastOpen] = useState<string | null>(null);
  if (selected !== null && selected.id !== lastOpen) setLastOpen(selected.id);
  const shown = selected ?? entries.find((entry) => entry.id === lastOpen) ?? null;
  // Opened here, the detail closes with a step back; one a link opened leaves the history as is.
  const openedHere = useRef(false);
  const openEntry = (id: string) => {
    openedHere.current = true;
    void navigate({ to: "/library", search: { ...search, entry: id } });
  };
  const closeEntry = () => {
    if (openedHere.current) {
      openedHere.current = false;
      router.history.back();
      return;
    }
    void navigate({ to: "/library", search: { ...search, entry: undefined }, replace: true });
  };
  // New on the template, back where the library was opened from, else on Home. Offered only where
  // a New will take the ask: a page that linked here, or the engineering interface's Home.
  const engineering = useEngineeringInterface();
  const makeOne = (template: NewTemplate) => {
    useNewDialogStore.getState().ask(template.discipline, template.id);
    if (search.from === undefined) void navigate({ to: "/" });
    else void navigate({ href: search.from });
  };

  // Opened on a group: it comes up to the top, unless it shows near the top already.
  useEffect(() => {
    if (search.group === undefined) return;
    const anchor = document.getElementById(groupAnchor(search.group));
    if (anchor === null) return;
    const top = anchor.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight / 2) anchor.scrollIntoView({ block: "start" });
  }, [search.group]);

  const fold = (key: string) =>
    setFolded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <ChatPage
      title="Library"
      count={entries.length}
      lede="Open an example, or see what the agent can make."
      search={
        <Input
          type="search"
          size="sm"
          placeholder="Search the library"
          aria-label="Search the library"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      }
    >
      {groups.length === 0 && shownExamples.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">Nothing in the library matches that.</p>
      ) : null}
      <div className="@container flex min-w-0 flex-col gap-6">
        <ExamplesModule examples={shownExamples} />
        {groups.map((group) => (
          <div key={group.key} id={groupAnchor(group.key)} className="scroll-mt-6">
            <OverviewModule
              title={group.title}
              icon={group.icon}
              count={group.entries.length}
              folded={folded.has(group.key)}
              onFold={() => fold(group.key)}
            >
              <div className={CARD_GRID}>
                {group.entries.map((entry) => (
                  <LibraryCard
                    key={entry.id}
                    picture={
                      <LibraryPicture
                        entry={entry}
                        environmentId={environmentId}
                        className="border-b border-border"
                      />
                    }
                    name={entryName(entry, skillLabel)}
                    note={offNote(entry)}
                    onOpen={() => openEntry(entry.id)}
                  />
                ))}
              </div>
            </OverviewModule>
          </div>
        ))}
      </div>
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) closeEntry();
        }}
      >
        {shown === null ? null : (
          <EntryDetail
            key={shown.id}
            entry={shown}
            environmentId={environmentId}
            plugins={plugins}
            skillLabel={skillLabel}
            exampleId={
              shown.exampleIn !== null && examples.some((example) => example.id === shown.exampleIn)
                ? shown.exampleIn
                : null
            }
            onMakeOne={search.from !== undefined || engineering ? makeOne : null}
          />
        )}
      </Dialog>
    </ChatPage>
  );
}

/**
 * An entry's detail: its picture large, what it is, then a document type's You give, It asks you
 * first, You get, Made by and Find it in, or a skill's Try asking and Shows up as. See the example
 * opens the page of the example its example is in, where the server ships it; Make one opens New on
 * its template, where it can be made and a New will take the ask. One that can't be made says
 * which skill it needs and why.
 */
function EntryDetail(props: {
  readonly entry: LibraryEntry;
  readonly environmentId: EnvironmentId;
  /** The installed plugins; undefined until they are known. */
  readonly plugins: ReadonlyArray<InstalledPlugin> | undefined;
  readonly skillLabel: (name: string) => string;
  /** The example its example is in (`exampleIn`); null where the server ships none. */
  readonly exampleId: string | null;
  /** Opens New on a template; null where no New would take it. */
  readonly onMakeOne: ((template: NewTemplate) => void) | null;
}) {
  const { entry, plugins, skillLabel, exampleId, onMakeOne } = props;
  const state =
    entry.kind === "document" && plugins !== undefined ? availability(entry, plugins) : null;
  const template =
    entry.kind === "document" && state?.on === true && onMakeOne !== null
      ? makeOneTemplate(entry)
      : null;
  const example = exampleId === null ? null : entry.example;

  const shownAs = entry.kind === "skill" ? showsUpAs(entry.name) : [];
  const rows: ReadonlyArray<readonly [string, ReactNode]> =
    entry.kind === "document"
      ? [
          ["You give", entry.give],
          ...(entry.asks === null ? [] : [["It asks you first", entry.asks] as const]),
          ["You get", entry.gets],
          ["Made by", madeBy(entry, skillLabel).join(", ")],
          ["Find it in", findItIn(entry).join(", ")],
        ]
      : [
          ...(entry.tryAsking === null ? [] : [["Try asking", `“${entry.tryAsking}”`] as const]),
          ...(shownAs.length === 0
            ? []
            : [
                [
                  "Shows up as",
                  shownAs.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  )),
                ] as const,
              ]),
        ];

  return (
    <DialogPopup className="max-w-xl">
      <DialogHeader>
        <DialogTitle>{entryName(entry, skillLabel)}</DialogTitle>
      </DialogHeader>
      <DialogPanel>
        <LibraryPicture
          entry={entry}
          environmentId={props.environmentId}
          className="rounded-lg border border-border"
        />
        <DialogDescription>
          {entry.kind === "document" ? entry.what : entry.description}
        </DialogDescription>
        {rows.length === 0 ? null : (
          <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            {rows.map(([label, value]) => (
              <Fragment key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="min-w-0 text-foreground">{value}</dd>
              </Fragment>
            ))}
          </dl>
        )}
        {state === null || state.on || plugins === undefined ? null : (
          <NeedsSkill needs={state} plugins={plugins} />
        )}
        {entry.kind === "skill" && !entry.on ? (
          <p className="text-sm text-foreground">
            The {entry.pluginName} plugin is turned off. <PluginsLink />
          </p>
        ) : null}
      </DialogPanel>
      {example === null && template === null ? null : (
        <DialogFooter>
          {example === null || exampleId === null ? null : (
            <SeeTheExample sampleId={exampleId} file={example} size="sm" className="sm:me-auto" />
          )}
          {template === null || onMakeOne === null ? null : (
            <Button size="sm" onClick={() => onMakeOne(template)}>
              Make one
            </Button>
          )}
        </DialogFooter>
      )}
    </DialogPopup>
  );
}
