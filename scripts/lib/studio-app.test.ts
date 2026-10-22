import { describe, expect, it } from "vite-plus/test";

import { STUDIO_APP_ID, studioBuildConfig } from "./studio-app.ts";

const t3Config = {
  appId: "com.t3tools.t3code",
  productName: "T3 Code (Alpha)",
  artifactName: "T3-Code-${version}-${arch}.${ext}",
  extraResources: [
    { from: "apps/desktop/prod-resources/resource-monitor", to: "resource-monitor" },
  ],
  publish: [{ provider: "github" }],
  mac: {
    target: ["dmg", "zip"],
    icon: "icon.icns",
    extendInfo: {
      NSLocalNetworkUsageDescription: "T3 Code connects to devices on your local network.",
      CFBundleDocumentTypes: [{ CFBundleTypeName: "Web page" }],
    },
    protocols: [{ name: "T3 Code", schemes: ["t3code", "t3code-dev"] }],
  },
  dmg: { title: "T3 Code 0.0.45 Installer", background: "dmg/dmg-background-latest.png" },
};

describe("studioBuildConfig", () => {
  it("names and identifies the app as Studio, apart from T3 Code", () => {
    const config = studioBuildConfig(t3Config, { version: "0.1.0", signed: false });
    expect(config.appId).toBe(STUDIO_APP_ID);
    expect(config.productName).toBe("Studio");
    expect(config.artifactName).toBe("Studio-${version}-${arch}.${ext}");
    expect(config.dmg).toEqual({ title: "Studio 0.1.0" });
    expect(JSON.stringify(config)).not.toContain("T3 Code");
  });

  it("carries the bundle as a resource, beside T3 Code's own", () => {
    const config = studioBuildConfig(t3Config, { version: "0.1.0", signed: false });
    expect(config.extraResources).toEqual([
      { from: "apps/desktop/prod-resources/resource-monitor", to: "resource-monitor" },
      { from: "apps/desktop/prod-resources/studio", to: "studio" },
    ]);
  });

  it("is a plain DMG with no update feed, no link schemes and no web-browser claim", () => {
    const config = studioBuildConfig(t3Config, { version: "0.1.0", signed: false });
    const mac = config.mac as Record<string, unknown>;
    expect(config.publish).toBeUndefined();
    expect(mac.target).toEqual(["dmg"]);
    expect(mac.protocols).toEqual([]);
    expect(mac.extendInfo).not.toHaveProperty("CFBundleDocumentTypes");
    expect(mac.icon).toBe("icon.icns");
  });

  it("signs ad hoc without the hardened runtime unless signing was asked for", () => {
    const unsigned = studioBuildConfig(t3Config, { version: "0.1.0", signed: false });
    expect(unsigned.mac).toMatchObject({ identity: "-", hardenedRuntime: false });
    const signed = studioBuildConfig(t3Config, { version: "0.1.0", signed: true });
    expect(signed.mac).not.toHaveProperty("identity");
    expect(signed.mac).not.toHaveProperty("hardenedRuntime");
  });

  it("leaves T3 Code's config as it was", () => {
    const before = JSON.stringify(t3Config);
    studioBuildConfig(t3Config, { version: "0.1.0", signed: false });
    expect(JSON.stringify(t3Config)).toBe(before);
  });
});
