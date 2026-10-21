import { describe, expect, it } from "vite-plus/test";

import { backupFolder, backupPlace } from "./useBackup";

describe("backup", () => {
  it("backs a project up into a folder named for it, inside the one chosen", () => {
    expect(backupFolder("/Users/amy/Library/CloudStorage/GoogleDrive-a/My Drive/", "Roomba")).toBe(
      "/Users/amy/Library/CloudStorage/GoogleDrive-a/My Drive/Roomba",
    );
    expect(backupFolder("/Volumes/Backup", "Clip: v2/final")).toBe(
      "/Volumes/Backup/Clip- v2-final",
    );
    expect(backupFolder("/Volumes/Backup", "  ")).toBe("/Volumes/Backup/Project");
  });

  it("names a backup's place by its last two folders", () => {
    expect(backupPlace("/Users/amy/Library/CloudStorage/GoogleDrive-a/My Drive/Roomba")).toBe(
      "My Drive/Roomba",
    );
  });
});
