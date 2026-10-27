import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { StudioInterfaceSetting, StudioInterfaceSettingsPanel } from "./StudioInterfaceSetting";

// The switch is offered only by a Studio brand; the tests act as one, in each interface.
const interfaceIs = vi.hoisted(() => ({
  current: "engineering" as "engineering" | "both" | "code",
}));
vi.mock("./studioInterface", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./studioInterface")>()),
  STUDIO_INTERFACE_AVAILABLE: true,
  useStudioInterface: () => interfaceIs.current,
  useEngineeringInterface: () => interfaceIs.current === "engineering",
}));
// A row's own chrome needs the settings page around it; its title is all these tests read.
vi.mock("../settings/settingsLayout", () => ({
  SettingsPageContainer: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  SettingsSection: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  SettingsRow: ({ title }: { title: string }) => <div data-row={title} />,
}));
afterEach(() => {
  interfaceIs.current = "engineering";
});

describe("the Studio interface switch", () => {
  it("is not a row of Appearance in the engineering interface, which lists it under Advanced", () => {
    expect(renderToStaticMarkup(<StudioInterfaceSetting />)).toBe("");
  });

  it("stays a row of Appearance in both code interfaces", () => {
    for (const current of ["both", "code"] as const) {
      interfaceIs.current = current;
      expect(renderToStaticMarkup(<StudioInterfaceSetting />)).toContain("Studio interface");
    }
  });

  it("has a page of its own, under Advanced, that opens in every interface", () => {
    for (const current of ["engineering", "both", "code"] as const) {
      interfaceIs.current = current;
      expect(renderToStaticMarkup(<StudioInterfaceSettingsPanel />)).toContain("Studio interface");
    }
  });
});
