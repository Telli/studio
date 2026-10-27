// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { HARDWARE_ACTIONS, type HardwareAction } from "./hardwareActions";
import type { ToolboxSection } from "./toolbox";
import { SectionJobs } from "./ToolboxJobs";

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

const jobs = HARDWARE_ACTIONS.filter((action) => action.section === "simulation");
const section: ToolboxSection = { title: "Simulation", actions: jobs, folded: false };

/** A button's accessible name from its content: what is hidden from readers is left out. */
function nameOf(element: Element): string {
  return Array.from(element.childNodes)
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
      if (!(node instanceof HTMLElement)) return "";
      if (node.hidden || node.getAttribute("aria-hidden") === "true") return "";
      return nameOf(node);
    })
    .join("")
    .trim();
}

/** The button a reader finds by that name. */
function tile(name: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (button) => nameOf(button) === name,
  );
  if (!found) throw new Error(`No button named ${name}`);
  return found;
}

/** What a reader hears after the name: the text of the elements `aria-describedby` points to. */
function descriptionOf(element: Element): string {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ")
    .trim();
}

async function renderSection(disabled: boolean, onRun: (action: HardwareAction) => void) {
  await act(async () => {
    root.render(<SectionJobs section={section} disabled={disabled} onRun={onRun} />);
  });
}

describe("SectionJobs tool tiles", () => {
  it("names each tile by its job and describes it by what the job makes", async () => {
    await renderSection(false, () => {});
    for (const job of jobs) {
      expect(descriptionOf(tile(job.label))).toBe(job.gets);
    }
  });

  it("runs the pressed tile's job", async () => {
    const onRun = vi.fn<(action: HardwareAction) => void>();
    await renderSection(false, onRun);
    const strength = jobs.find((job) => job.id === "strength")!;

    await act(async () => tile(strength.label).click());

    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun.mock.calls[0]?.[0].prompt("part.step")).toBe(strength.prompt("part.step"));
  });

  it("runs nothing with no chat to write the job into", async () => {
    const onRun = vi.fn<(action: HardwareAction) => void>();
    await renderSection(true, onRun);

    await act(async () => tile(jobs[0]!.label).click());

    expect(onRun).not.toHaveBeenCalled();
  });
});
