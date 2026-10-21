/**
 * Home's ways in for someone new (`StudioHome`): a few projects to start with one press, each a
 * description the agent starts from as if typed; a PRD-first start, which leaves the box to finish
 * the sentence; and a sample project, which the agent builds in front of them so each part of
 * Studio has something in it: a part, its strength check, its drawing and its PRD.
 */

export interface ExampleStart {
  readonly label: string;
  readonly description: string;
}

export const EXAMPLE_STARTS: ReadonlyArray<ExampleStart> = [
  {
    label: "A wall bracket for a 2 kg shelf",
    description:
      "A wall bracket that holds a 2 kg shelf, screwed into a stud wall, 3D printed in PETG.",
  },
  {
    label: "An enclosure for an Arduino Uno",
    description:
      "A snap-fit enclosure for an Arduino Uno, with openings for its USB and power jacks, 3D printed.",
  },
  {
    label: "A phone stand",
    description:
      "A desk stand that holds a phone at 60 degrees, upright or sideways, cut from 3 mm acrylic.",
  },
];

/** The box's words for a PRD-first start; the person finishes the sentence. */
export const PRD_START = "Start with a PRD (product requirements document) for ";

export const SAMPLE_PROJECT: ExampleStart = {
  label: "Try a sample project",
  description:
    "A sample project to learn Studio with: a mounting bracket for an MG996R servo, bent from 2 mm aluminium sheet. Model the bracket, run a strength check with a 20 N load at the servo horn, make its engineering drawing, and write a one-page PRD for it, explaining each step in a sentence as you go.",
};
