/** A schema 1 batch around `events`, for the tests. */
export const batchOf = (events, extra = {}) => ({
  schema: 1,
  install: "0b7e4c5a-3c2d-4f6e-9a1b-2c3d4e5f6a7b",
  version: "0.1.5",
  platform: "darwin",
  arch: "arm64",
  mode: "desktop",
  events,
  ...extra,
});
