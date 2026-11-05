import type { DesktopUpdateState } from "@t3tools/contracts";
import type { Atom, AtomRegistry } from "effect/reactivity";

import { APP_BASE_NAME } from "~/branding";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { primaryRunningThreadCountAtom } from "~/state/threads";
import { chatsWorking, getDesktopUpdateInstallConfirmationMessage } from "./desktopUpdate.logic";
import { toastManager } from "./ui/toast";

/** What a held restart shows while it waits, and the two ways out of the wait. */
export interface HeldRestart {
  readonly running: number;
  /** Restarts now, stopping the chats that are working. */
  readonly now: () => void;
  /** Gives up the restart: the update stays downloaded for later. */
  readonly cancel: () => void;
}

/**
 * Restarts for a downloaded update once nothing on this machine is working: the restart stops the
 * app's own server, and every chat it runs with it. With nothing running it restarts at once;
 * otherwise `hold` hears how many are working, and the restart waits for the count to reach zero.
 */
export function restartWhenIdle(input: {
  readonly registry: AtomRegistry.AtomRegistry;
  readonly running: Atom.Atom<number>;
  readonly restart: () => void;
  readonly hold: (held: HeldRestart) => () => void;
}): void {
  const running = input.registry.get(input.running);
  if (running === 0) {
    input.restart();
    return;
  }
  let settled = false;
  let release = () => {};
  const settle = (restart: boolean) => {
    if (settled) return;
    settled = true;
    unsubscribe();
    release();
    if (restart) input.restart();
  };
  const unsubscribe = input.registry.subscribe(input.running, (count) => {
    if (count === 0) settle(true);
  });
  release = input.hold({ running, now: () => settle(true), cancel: () => settle(false) });
}

/** The question before restarting for an update, as this machine's chats stand now. */
export const restartConfirmation = (
  state: Pick<DesktopUpdateState, "availableVersion" | "downloadedVersion">,
) =>
  getDesktopUpdateInstallConfirmationMessage(
    state,
    appAtomRegistry.get(primaryRunningThreadCountAtom),
    APP_BASE_NAME,
  );

/** Restarts for the update when this machine's chats are done, saying so while it waits. */
export function restartForUpdateWhenIdle(restart: () => void): void {
  restartWhenIdle({
    registry: appAtomRegistry,
    running: primaryRunningThreadCountAtom,
    restart,
    hold: ({ running, now, cancel }) => {
      const id = toastManager.add({
        type: "info",
        title: "Update waiting",
        description: `${APP_BASE_NAME} restarts to install it when ${chatsWorking(running)}.`,
        timeout: 0,
        actionProps: { children: "Restart now", onClick: now },
        data: { onClose: cancel },
      });
      return () => toastManager.close(id);
    },
  });
}
