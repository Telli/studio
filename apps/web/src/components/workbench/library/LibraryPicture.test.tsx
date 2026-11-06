// @vitest-environment jsdom

import { BoxIcon } from "lucide-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { PictureOrGlyph } from "./LibraryPicture";

let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<PictureOrGlyph url="/part.webp" icon={BoxIcon} />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const glyph = () => container.querySelector("svg");
const picture = () => container.querySelector("img");

describe("PictureOrGlyph", () => {
  it("holds the box with the glyph until the picture has loaded", async () => {
    expect(glyph()).not.toBeNull();

    await act(async () => picture()!.dispatchEvent(new Event("load")));

    expect(glyph()).toBeNull();
    expect(picture()).not.toBeNull();
  });

  it("keeps the glyph when the picture cannot load", async () => {
    await act(async () => picture()!.dispatchEvent(new Event("error")));

    expect(glyph()).not.toBeNull();
    expect(picture()).toBeNull();
  });
});
