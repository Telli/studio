import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, StudioSyncRestoreInput } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { GithubIcon, HardDriveDownloadIcon } from "lucide-react";
import { useState } from "react";

import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { waitForProject } from "~/state/entities";
import { useEnvironmentQuery } from "~/state/query";
import { sourceControlEnvironment } from "~/state/sourceControl";
import { studioProjectsEnvironment } from "~/state/studioProjects";
import { useAtomCommand } from "~/state/use-atom-command";
import { GitHubSignIn } from "../settings/GitHubSignIn";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { toastManager } from "../ui/toast";
import { Choice, plainError } from "./BackupDialog";
import { copyName } from "./examples/examples";
import { useRestoreDialogStore } from "./importDialogStore";
import { showProject } from "./overviewPanel";
import { readStudioImport } from "./studioImportBridge";
import { MODULE_HEADING } from "./studioLayout";
import { useTrashedProjects } from "./trash/useTrash";
import { backupPlaceLabel, restoredName } from "./useBackup";
import { useImportProjects } from "./useImportProjects";
import { useStudioProjects } from "./useStudioProjects";

/**
 * Restore a backup, from Import's menu: the way back from Back up, on this computer or a new one.
 * The server brings the backup into a new folder (`StudioSync.restore`) and it becomes a project as
 * Import makes one, with the brief the backup kept. The chats stay behind.
 */
function RestoreDialog(props: {
  readonly environmentId: EnvironmentId;
  readonly onClose: () => void;
}) {
  const { environmentId, onClose } = props;
  const discoveryQuery = useEnvironmentQuery(
    sourceControlEnvironment.discovery({ environmentId, input: {} }),
  );
  const github = discoveryQuery.data?.sourceControlProviders.find(
    (provider) => provider.kind === "github",
  );
  const account = github === undefined ? null : Option.getOrNull(github.auth.account);
  const signedIn =
    github?.status === "available" && github.auth.status !== "unauthenticated" && account !== null;
  const pickFolder = readStudioImport()?.pickFolder;

  const restore = useAtomCommand(studioProjectsEnvironment.syncRestore, { reportFailure: false });
  const canRestore = useAtomValue(
    studioProjectsEnvironment.syncRestore.permissionAtom(environmentId),
  );
  const runImport = useImportProjects(environmentId);
  const handleNewThread = useNewThreadHandler();
  const projects = useStudioProjects(environmentId);
  const trashed = useTrashedProjects(environmentId);

  const [choice, setChoice] = useState<"github" | "folder">("github");
  const [typed, setTyped] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [typedName, setTypedName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = typed ?? (account === null ? "" : `${account}/`);
  const named = copy.includes("/") ? copy.split("/").at(-1)! : "";
  const from = choice === "github" ? named : (folder ?? "");
  const name = typedName ?? restoredName(from);
  const ready =
    name.trim() !== "" &&
    (choice === "github" ? signedIn && named !== "" : folder !== null) &&
    canRestore;

  const bringBack = async () => {
    const source: StudioSyncRestoreInput["source"] =
      choice === "github"
        ? { kind: "github", repository: copy.trim() }
        : { kind: "folder", folder: folder! };
    // A restore beside the original, or over one in Trash, never makes two of one name.
    const title = copyName(name, [
      ...Object.values(projects).map((project) => project.name),
      ...Object.values(trashed).map((project) => project.name),
    ]);
    const result = await restore({ environmentId, input: { name: title, source } });
    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    const { made, first } = await runImport({
      projects: [
        {
          folder: result.value.folder,
          name: title,
          files: [],
          ...(result.value.brief === null ? {} : { brief: result.value.brief }),
        },
      ],
      placements: [],
      newProjectName: title,
    });
    if (made === 0)
      throw new Error("The backup came back, but Studio could not add it as a project.");
    toastManager.add({
      type: "success",
      title: `Restored ${title}`,
      description:
        result.value.brief === null
          ? "Every version came with it."
          : "Its brief and every version came with it.",
    });
    onClose();
    if (first === null) return;
    const projectRef = scopeProjectRef(environmentId, first);
    const project = await waitForProject(projectRef).catch(() => null);
    const draft = project === null ? null : await handleNewThread(projectRef).catch(() => null);
    if (draft !== null) showProject(scopeThreadRef(environmentId, draft.threadId));
  };

  const choose = (next: "github" | "folder") => {
    setChoice(next);
    setError(null);
  };

  const run = () => {
    setBusy(true);
    setError(null);
    void bringBack()
      .catch((cause: unknown) => setError(plainError(cause)))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Restore a backup</DialogTitle>
          <DialogDescription>
            A backed up project comes back as a new project on this computer, with its brief and all
            its versions. Its chats stay on the computer they were made on.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="flex flex-col gap-3">
            <div role="radiogroup" aria-label="Where the backup is" className="flex flex-col gap-2">
              <Choice
                selected={choice === "github"}
                disabled={false}
                onSelect={() => choose("github")}
                icon={GithubIcon}
                title="GitHub"
                description="A private copy on your GitHub account."
                note={signedIn ? null : "Not signed in to GitHub on this computer yet."}
              />
              <Choice
                selected={choice === "folder"}
                disabled={pickFolder === undefined}
                onSelect={() => choose("folder")}
                icon={HardDriveDownloadIcon}
                title="A folder that syncs"
                description="Your Google Drive, Dropbox or iCloud Drive folder, or a drive."
                note={pickFolder === undefined ? "Needs Studio's desktop app." : null}
              />
            </div>
            {choice === "github" ? (
              signedIn ? (
                <label className="flex flex-col gap-1.5">
                  <span className={MODULE_HEADING}>Project on GitHub</span>
                  <Input
                    value={copy}
                    onChange={(event) => setTyped(event.target.value)}
                    placeholder="account/name"
                    autoFocus
                  />
                </label>
              ) : (
                <GitHubSignIn environmentId={environmentId} onSignedIn={discoveryQuery.refresh} />
              )
            ) : (
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void pickFolder?.("Restore a backup", "Restore this").then((picked) => {
                      if (picked === null) return;
                      setFolder(picked);
                      setError(null);
                    })
                  }
                >
                  Choose the folder
                </Button>
                {folder === null ? null : (
                  <span className="min-w-0 truncate text-sm text-muted-foreground">
                    {backupPlaceLabel({ kind: "folder", folder })}
                  </span>
                )}
              </div>
            )}
            {choice === "github" && !signedIn ? null : (
              <label className="flex flex-col gap-1.5">
                <span className={MODULE_HEADING}>Project name</span>
                <Input value={name} onChange={(event) => setTypedName(event.target.value)} />
              </label>
            )}
            {error === null ? null : <p className="text-xs text-destructive">{error}</p>}
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !ready} onClick={run}>
            {busy ? "Restoring" : "Restore"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/** Restore a backup where Import's menu is: a fresh dialog each time it opens. */
export function RestoreDialogHost(props: { readonly environmentId: EnvironmentId }) {
  const open = useRestoreDialogStore((store) => store.open);
  const close = useRestoreDialogStore((store) => store.close);
  return open ? <RestoreDialog environmentId={props.environmentId} onClose={close} /> : null;
}
