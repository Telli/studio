// @effect-diagnostics nodeBuiltinImport:off - reads and writes studio-job-skills/ on disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { HARDWARE_ACTIONS } from "./hardwareActions";
import { JOB_SKILL_JOBS, jobOfSkill, jobSkillFiles } from "./jobSkills";

const ROOT = NodePath.join(import.meta.dirname, "..", "..", "..", "..", "..");
/** The job skills as Studio ships them. `STUDIO_WRITE_JOB_SKILLS=1` writes them from the jobs. */
const FOLDER = NodePath.join(ROOT, "studio-job-skills");
const JAKES = NodePath.join(ROOT, "text-to-cad", "skills");

const skillsIn = (folder: string) =>
  NodeFS.existsSync(folder)
    ? NodeFS.readdirSync(folder)
        .filter((name) => NodeFS.existsSync(NodePath.join(folder, name, "SKILL.md")))
        .toSorted()
    : [];

if (process.env.STUDIO_WRITE_JOB_SKILLS === "1") {
  for (const name of skillsIn(FOLDER)) {
    NodeFS.rmSync(NodePath.join(FOLDER, name), { recursive: true });
  }
  for (const job of JOB_SKILL_JOBS) {
    for (const [file, text] of Object.entries(jobSkillFiles(job))) {
      const path = NodePath.join(FOLDER, job.id, file);
      NodeFS.mkdirSync(NodePath.dirname(path), { recursive: true });
      NodeFS.writeFileSync(path, text);
    }
  }
}

describe("each job of a skill with several as a skill of its own", () => {
  it("makes one of every job of the skills that do more than one", () => {
    const several = new Set(
      HARDWARE_ACTIONS.flatMap((job) =>
        job.skill !== null && HARDWARE_ACTIONS.filter((o) => o.skill === job.skill).length > 1
          ? [job.skill]
          : [],
      ),
    );
    expect(several).toEqual(new Set(["cad", "cam", "fea", "pcb", "print3d", "robot-simulation"]));
    expect(JOB_SKILL_JOBS.map((job) => job.id)).toContain("urdf");
    expect(JOB_SKILL_JOBS.map((job) => job.id)).not.toContain("sendcutsend");
    expect(jobOfSkill("bambu")?.skill).toBe("print3d");
    expect(jobOfSkill("cad")).toBeNull();
  });

  it("ships them as the jobs write them (STUDIO_WRITE_JOB_SKILLS=1 writes them)", () => {
    expect(skillsIn(FOLDER)).toEqual(JOB_SKILL_JOBS.map((job) => job.id).toSorted());
    for (const job of JOB_SKILL_JOBS) {
      for (const [file, text] of Object.entries(jobSkillFiles(job))) {
        expect(NodeFS.readFileSync(NodePath.join(FOLDER, job.id, file), "utf8")).toBe(text);
      }
    }
  });

  it("names none the way one of text-to-cad's own skills is named", () => {
    const jakes = new Set(skillsIn(JAKES));
    expect(jakes.has("cad")).toBe(true);
    expect(JOB_SKILL_JOBS.filter((job) => jakes.has(job.id))).toEqual([]);
  });

  it("fits what the chat reads of each: a name of 160 characters, a prompt of 300", () => {
    for (const job of JOB_SKILL_JOBS) {
      const face = jobSkillFiles(job)["agents/openai.yaml"] ?? "";
      const prompt = /default_prompt: (".*")/.exec(face)?.[1] ?? "";
      expect(JSON.parse(prompt).length, job.id).toBeLessThanOrEqual(300);
      expect(job.label.length).toBeLessThanOrEqual(160);
      expect(job.id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });
});
