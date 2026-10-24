/**
 * The timeline's rules, pure: what it lists, where its rollback marker stands and where a dragged one
 * would go (`EditTimeline.jsx` draws it). It lists what the Part Navigator lists, in its order and
 * under its titles, so the two are one history seen twice and the marker is the same rollback as
 * the Part Navigator's bar and its Make Current Feature.
 */

import { barIndex, rolledBack } from "./editMode.js";
import { treeTitles } from "./nx.js";

const AUTHORS = Object.freeze(["agent", "you"]);

/**
 * The timeline of a part (`featureTree`) with its rollback bar (`edit.bar`): its features in the
 * Part Navigator's order, sketches of their own among them, each `{ id, kind, title, rolledBack,
 * author, feature }`: its row's id, its kind as the engine names it (for its icon), its title as
 * the Part Navigator numbers it ("Extrude (2)"), whether the bar leaves it out of the part, who made
 * it and the tree's feature itself. `authors` maps ids to "agent" or "you"; whoever it does not
 * name, or names otherwise, has no author (null): nothing is marked that is not known. `marker`: the
 * index of the first item the bar leaves out, past the last when none is. The sketch a feature was made
 * from is listed under the feature by the Part Navigator and is part of it here, as the bar cannot stand
 * between them: only a sketch nothing uses yet is an item of its own. An assembly lists nothing, as its
 * Part Navigator has no rollback bar: its parts are opened to be modeled.
 *
 * @param {ReturnType<typeof import("./editMode.js").featureTree>} tree
 * @param {{ item?: string } | null | undefined} bar
 * @param {Record<string, string> | null} [authors]
 */
export function timelineItems(tree, bar, authors = {}) {
  const features = tree?.assembly ? [] : tree?.features || [];
  const titles = treeTitles(tree);
  const rolled = rolledBack(tree, bar);
  const items = features.map(feature => ({
    id: feature.id,
    kind: feature.kind,
    title: titles.get(feature.id) || feature.title,
    rolledBack: rolled.has(feature.id),
    author: AUTHORS.includes(authors?.[feature.id]) ? authors[feature.id] : null,
    feature,
  }));
  return { items, marker: barIndex(tree, bar) };
}

/**
 * The marker's index for a pointer at `x`: how many of the items' centres (`centers`, left to right,
 * in the pointer's own coordinates) it has passed, so the marker stands between the items either
 * side of it. A pointer on a centre has passed it, as the Part Navigator's bar goes below the row the
 * pointer is past the middle of.
 */
export function slotAtX(x, centers) {
  const ahead = centers.findIndex(center => x < center);
  return ahead < 0 ? centers.length : ahead;
}
