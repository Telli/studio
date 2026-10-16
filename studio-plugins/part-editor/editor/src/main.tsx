import { createRoot } from "react-dom/client";

import { App } from "./App";
import { createBridge } from "./bridge";

const bridge = createBridge();
const root = document.getElementById("root")!;

void bridge
  .initialize()
  .then((context) => {
    const page = document.documentElement;
    page.dataset.theme = context.theme ?? "dark";
    for (const [name, value] of Object.entries(context.styles?.variables ?? {})) {
      page.style.setProperty(name, value);
    }
    createRoot(root).render(<App bridge={bridge} context={context} />);
  })
  .catch((error: unknown) => {
    root.textContent = `The part editor could not reach Studio: ${error instanceof Error ? error.message : String(error)}`;
  });
