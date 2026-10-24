/**
 * Home's way in for someone new (`StudioHome`): a sample project. Where the desktop app can copy
 * it, that is the finished one Studio ships, with this description as its purpose
 * (`useSampleProject`); elsewhere the agent builds it in front of them from this description, so
 * each part of Studio has something in it: a part, its strength check, its drawing and its PRD.
 * Everything else starts from the box or from New, as in a project.
 */

export interface ExampleStart {
  readonly label: string;
  readonly description: string;
}

export const SAMPLE_PROJECT: ExampleStart = {
  label: "Try a sample project",
  description:
    "A sample project to learn Studio with: a mounting bracket for an MG996R servo, bent from 2 mm aluminium sheet. Model the bracket, run a strength check with a 20 N load at the servo horn, make its engineering drawing, and write a one-page PRD for it, explaining each step in a sentence as you go.",
};
