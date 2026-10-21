import { describe, expect, it } from "vite-plus/test";

import { APP_BASE_NAME } from "../../branding";
import {
  engineeringFilesLabel,
  engineeringGroupLabel,
  engineeringStepLabel,
  engineeringToolLabel,
} from "./engineeringLabels";

const venv = "/Users/amy/code/text-to-cad-hw/.venv/bin/python -m cadgen.cli";

describe("engineering step labels", () => {
  it("names a study, a CAM job and a board check by what they did to which part", () => {
    expect(
      engineeringStepLabel(`${venv} fea solve parts/STEP/l_bracket.step --study s.json`),
    ).toEqual({
      done: "FEA study on the L bracket",
      doing: "Running an FEA study on the L bracket",
    });
    expect(engineeringStepLabel(`${venv} cam plan l_bracket.step --job job.json`).done).toBe(
      "CAM plan for the L bracket",
    );
    expect(engineeringStepLabel(`${venv} pcb validate PCB/servo_power.kicad_pcb`).done).toBe(
      "Checked the servo power board",
    );
    expect(engineeringStepLabel(`${venv} pcb gerber "PCB/servo_power.kicad_pcb"`).done).toBe(
      "Wrote the Gerbers for the servo power board",
    );
    expect(engineeringStepLabel(`${venv} pcb validate`).done).toBe("Checked the board");
  });

  it("reads running a model script as building the part, through any chain", () => {
    expect(engineeringStepLabel("cd parts/src && python3 l_bracket.py")).toEqual({
      done: "Built the L bracket",
      doing: "Building the L bracket",
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

describe("engineering file labels", () => {
  it("names what a step read or changed by the parts and documents they are", () => {
    expect(engineeringFilesLabel("Looked at", ["/w/parts/servo_bracket.step"])).toBe(
      "Looked at the servo bracket",
    );
    expect(engineeringFilesLabel("Updated", ["drawings/bracket.dxf", "a.step", "b.step"])).toBe(
      "Updated the bracket drawing and 2 more",
    );
    expect(engineeringFilesLabel("Looked at", ["src/util.ts"])).toBe("Looked at util.ts");
    expect(
      engineeringFilesLabel("Updated", ["parts/src/l_bracket.py", "parts/STEP/l_bracket.step"]),
    ).toBe("Updated the L bracket");
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
    expect(
      engineeringGroupLabel("Ran 3 commands, changed 3 files", [
        "parts/src/l_bracket.py",
        "parts/STEP/l_bracket.step",
        "drawings/l_bracket.dxf",
      ]),
    ).toBe("3 steps, updated the L bracket");
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

describe("the skills' tools and exports in an engineer's words", () => {
  it("names a check or an export by what it does, never as building a tool", () => {
    expect(
      engineeringStepLabel("python skills/dfam-check/scripts/dfam_tool.py measure parts/clip.stl")
        .done,
    ).toBe("Checked the clip for 3D printing");
    expect(engineeringStepLabel("python scripts/download_step_part.py M3 screw").done).toBe(
      "Found a standard part",
    );
    expect(engineeringStepLabel("cadgen stl build parts/clip.step").done).toBe(
      "Exported the clip as STL",
    );
    expect(engineeringStepLabel("cadgen pcb drc board.kicad_pcb").done).toBe("Checked the board");
    expect(engineeringStepLabel("python scripts/helpers/fit.py").done).toBe("Worked on the design");
    expect(engineeringStepLabel("cadgen tidy").done).toBe("Worked on the design");
  });
});
