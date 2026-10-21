import { describe, expect, it } from "vite-plus/test";

import { DOCUMENT_TEMPLATES, NEW_TEMPLATES } from "./newTemplates";
import { newProjectName } from "./useStartProject";

const template = (id: string) => NEW_TEMPLATES.find((entry) => entry.id === id)!;
const document = (id: string) => DOCUMENT_TEMPLATES.find((entry) => entry.id === id)!;

describe("a project started from New on Home", () => {
  it("is named by the name given in New, else as new work of its kind", () => {
    expect(newProjectName({ template: template("part"), name: "servo_bracket" })).toBe(
      "Servo bracket",
    );
    expect(newProjectName({ template: template("part"), name: "Part" })).toBe("New part");
    expect(newProjectName({ template: template("board"), name: " " })).toBe("New board");
    expect(newProjectName({ template: document("fmea"), name: "FMEA" })).toBe("New FMEA");
    expect(newProjectName({ template: document("prd"), name: "PRD" })).toBe(
      "New product requirements (PRD)",
    );
  });
});
