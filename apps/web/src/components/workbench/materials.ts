/**
 * The material library the project setup offers, the way a CAD tool's
 * material dialog groups its library: the common grades by family. Anything
 * else is typed in as it is; the agent reads the name.
 */
export const MATERIAL_LIBRARY: ReadonlyArray<{
  readonly family: string;
  readonly materials: ReadonlyArray<string>;
}> = [
  {
    family: "Aluminum",
    materials: ["6061-T6 aluminum", "7075-T6 aluminum", "5052-H32 aluminum", "A356 cast aluminum"],
  },
  {
    family: "Steel",
    materials: [
      "1018 steel",
      "4140 steel",
      "304 stainless steel",
      "316L stainless steel",
      "17-4 PH stainless steel",
    ],
  },
  {
    family: "Other metals",
    materials: ["Ti-6Al-4V titanium", "C360 brass", "C110 copper", "Sterling silver", "14k gold"],
  },
  {
    family: "Plastics",
    materials: [
      "PLA",
      "PETG",
      "ABS",
      "ASA",
      "Nylon (PA12)",
      "Polycarbonate",
      "Acetal (POM)",
      "TPU",
    ],
  },
  {
    family: "Resins",
    materials: ["Standard resin", "Tough resin", "Flexible resin", "Castable resin"],
  },
  { family: "Sheet and board", materials: ["Acrylic", "Plywood", "FR-4"] },
];

/** The library narrowed to the materials whose name or family holds the search, families kept in order. */
export function filterMaterials(query: string): typeof MATERIAL_LIBRARY {
  const needle = query.trim().toLowerCase();
  if (needle === "") return MATERIAL_LIBRARY;
  return MATERIAL_LIBRARY.flatMap(({ family, materials }) => {
    const matches = family.toLowerCase().includes(needle)
      ? materials
      : materials.filter((material) => material.toLowerCase().includes(needle));
    return matches.length === 0 ? [] : [{ family, materials: matches }];
  });
}
