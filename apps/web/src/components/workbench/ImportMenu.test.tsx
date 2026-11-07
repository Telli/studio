// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ImportMenu } from "./ImportMenu";
import { StartChoices } from "./StartChoices";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const press = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const menuItems = () =>
  Array.from(document.querySelectorAll('[role="menuitem"]')).map((item) => item.textContent);

describe("Studio's one Import menu", () => {
  it("offers Files or a folder and Scan this computer, and each runs its own action", async () => {
    const actions = { scan: vi.fn(), pick: vi.fn(async () => undefined) };
    await act(async () => root.render(<ImportMenu actions={actions} />));
    await press(container.querySelector("button")!);
    expect(menuItems()).toEqual(["Files or a folder", "Scan this computer"]);
    await press(document.querySelectorAll('[role="menuitem"]')[1]!);
    expect(actions.scan).toHaveBeenCalledOnce();
    expect(actions.pick).not.toHaveBeenCalled();
  });

  it("offers Restore a backup where it makes a project, not where it imports into one", async () => {
    const actions = { scan: vi.fn(), pick: vi.fn(async () => undefined), restore: vi.fn() };
    await act(async () => root.render(<ImportMenu actions={actions} />));
    await press(container.querySelector("button")!);
    expect(menuItems()).toEqual(["Files or a folder", "Scan this computer", "Restore a backup"]);
    await press(document.querySelectorAll('[role="menuitem"]')[2]!);
    expect(actions.restore).toHaveBeenCalledOnce();
    await act(async () =>
      root.render(<ImportMenu actions={actions} hints={{ pick: "Copied", scan: "Scans" }} />),
    );
    await press(container.querySelector("button")!);
    expect(menuItems()).toHaveLength(2);
  });

  it("is what the start page's Import a STEP opens, with the same items, beside New part only", async () => {
    const actions = { scan: vi.fn(), pick: vi.fn(async () => undefined) };
    await act(async () =>
      root.render(<StartChoices onNewPart={vi.fn()} newPartBusy={false} importActions={actions} />),
    );
    expect(container.textContent).not.toContain("Describe it to the AI");
    const card = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.startsWith("Import a STEP"),
    )!;
    await press(card);
    expect(menuItems()).toEqual(["Files or a folder", "Scan this computer"]);
  });

  it("says where each item lands when given hints, and the trigger says into this project", async () => {
    const actions = { scan: vi.fn(), pick: vi.fn(async () => undefined) };
    await act(async () =>
      root.render(
        <ImportMenu
          actions={actions}
          hints={{ pick: "Copied into Phone stand", scan: "Makes new projects" }}
        />,
      ),
    );
    const trigger = container.querySelector("button")!;
    expect(trigger.getAttribute("aria-label")).toBe("Import into this project");
    await press(trigger);
    expect(menuItems()).toEqual([
      "Files or a folderCopied into Phone stand",
      "Scan this computerMakes new projects",
    ]);
  });

  it("leaves Import a STEP disabled where there is no desktop app", async () => {
    await act(async () =>
      root.render(<StartChoices onNewPart={vi.fn()} newPartBusy={false} importActions={null} />),
    );
    const card = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.startsWith("Import a STEP"),
    )!;
    expect(card.disabled).toBe(true);
  });
});
