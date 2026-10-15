import { describe, expect, it } from "vite-plus/test";

import { APP_BASE_NAME } from "../../branding";
import {
  engineeringGroupLabel,
  engineeringStepLabel,
  engineeringToolLabel,
} from "./engineeringLabels";

const venv = "/Users/amy/code/text-to-cad-hw/.venv/bin/python -m cadgen.cli";

describe("engineering step labels", () => {
  it("names a study, a CAM job and a board check by what they did to which file", () => {
    expect(
      engineeringStepLabel(`${venv} fea solve parts/STEP/l_bracket.step --study s.json`),
    ).toEqual({
      done: "FEA study on l_bracket.step",
      doing: "Running an FEA study on l_bracket.step",
    });
    expect(engineeringStepLabel(`${venv} cam plan l_bracket.step --job job.json`).done).toBe(
      "CAM plan for l_bracket.step",
    );
    expect(engineeringStepLabel(`${venv} pcb validate PCB/servo_power.kicad_pcb`).done).toBe(
      "Checked the board for servo_power.kicad_pcb",
    );
  });

  it("reads running a model script as building the part, through any chain", () => {
    expect(engineeringStepLabel("cd parts/src && python3 l_bracket.py")).toEqual({
      done: "Built l_bracket",
      doing: "Building l_bracket",
    });
    expect(
      engineeringStepLabel(`${venv.replace(" -m cadgen.cli", "")} "src/gusset plate.py"`).done,
    ).toBe("Worked on the design");
  });

  it("files everyday shell work under plain words", () => {
    expect(engineeringStepLabel("ls -la parts/STEP").done).toBe("Looked through the project");
    expect(engineeringStepLabel("mkdir -p plans").done).toBe("Organized the project's files");
    expect(engineeringStepLabel("git add -A && git commit -m wip").done).toBe(
      "Recorded the project's history",
    );
    expect(engineeringStepLabel("make -j8").done).toBe("Worked on the design");
  });
});

describe("engineering group labels", () => {
  it("counts steps and files without coding words", () => {
    expect(engineeringGroupLabel("Ran 3 commands, changed 2 files")).toBe(
      "3 steps, updated 2 files",
    );
    expect(engineeringGroupLabel("Changed 1 file")).toBe("Updated 1 file");
    expect(engineeringGroupLabel("Read 4 files")).toBe("Looked at 4 files");
    expect(engineeringGroupLabel("Searched code 2 times")).toBe("Searched the project 2 times");
  });

  it("reads the tools on T3's own server as the app's, and later commands as steps taken", () => {
    expect(engineeringGroupLabel("Used t3 code integration and ran 3 commands")).toBe(
      `Used ${APP_BASE_NAME}'s tools and took 3 steps`,
    );
    expect(engineeringGroupLabel("Used t3 code integration")).toBe(`Used ${APP_BASE_NAME}'s tools`);
    expect(engineeringGroupLabel("Changed 2 files and ran 1 command")).toBe(
      "Updated 2 files and took 1 step",
    );
  });
});

describe("engineering tool labels", () => {
  it("names the CAD viewer's tools by what they did, however the provider spelled them", () => {
    expect(engineeringToolLabel("mcp__t3-code__text-to-cad__cad_view")).toEqual({
      done: "Looked at the model",
      doing: "Looking at the model",
    });
    expect(engineeringToolLabel("t3-code.text-to-cad__cad_show")?.done).toBe("Showed the model");
    expect(engineeringToolLabel("cad.cad_open")?.done).toBe("Opened the model in the viewer");
    expect(engineeringToolLabel("Text to cad cad screenshot")?.doing).toBe(
      "Taking a picture of the model",
    );
  });

  it("leaves other tools to their own titles", () => {
    expect(engineeringToolLabel("t3-code.text-to-cad__cad_telemetry")).toBeNull();
    expect(engineeringToolLabel("mcp__other__arcad_show")).toBeNull();
    expect(engineeringToolLabel("t3-code.html_preview")).toBeNull();
    expect(engineeringToolLabel(undefined)).toBeNull();
  });
});
