/**
 * Studio as a Mac app (`scripts/build-studio-app.sh`): what T3 Code's desktop build changes when
 * it is handed the Studio bundle (`T3CODE_DESKTOP_STUDIO_BUNDLE`), a folder holding the CAD tools,
 * a Python of their own and the settings the app starts with (`studio.json`). The bundle is copied
 * to the app's `Contents/Resources/studio`, which `apps/desktop/src/studio/studioAppBundle.ts`
 * reads on each start. Everything else is T3 Code's own build.
 */

/** Studio's own identity, apart from T3 Code's, so the two can be installed side by side. */
export const STUDIO_APP_ID = "com.amywork777.studio";
export const STUDIO_PRODUCT_NAME = "Studio";
/** Whose app it is, for the copyright line in Finder's Get Info. */
export const STUDIO_OWNER = "Amy Zhou";
/** Studio's icon, from text-to-cad's brand kit (`brand/README.md`). */
export const STUDIO_MAC_ICON_PNG = "brand/app-icon.png";
/** The bundle's folder, in the app's Resources and in the build's staged resources. */
export const STUDIO_RESOURCES_DIR = "studio";

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};

/**
 * T3 Code's staged package.json, named Studio. Electron names the running app from its
 * `productName` (else its `name`, T3 Code's `t3code`) before any of the app's code runs, and macOS
 * keeps the app's saved secrets in the keychain under that name ("<name> Safe Storage"). Named
 * `t3code`, Studio asked for T3 Code's keychain item, which needs the login password to open.
 */
export function studioPackageJson<T extends object>(
  packageJson: T,
): T & { readonly productName: string } {
  return { ...packageJson, productName: STUDIO_PRODUCT_NAME };
}

/**
 * T3 Code's electron-builder config, made Studio's: its name, id, copyright and artifact name; a
 * DMG only, plain, with no update feed (a new version is a new download); none of T3 Code's link
 * schemes or its claim to be a web browser; and the bundle as a resource. Unsigned builds are
 * signed ad hoc, since an Apple silicon Mac runs only signed code, without the hardened runtime,
 * which notarization needs and which would keep the CAD tools' Python from loading its libraries.
 */
export function studioBuildConfig(
  config: Readonly<Record<string, unknown>>,
  input: { readonly version: string; readonly signed: boolean },
): Record<string, unknown> {
  const next = record(config);
  delete next.publish;
  next.appId = STUDIO_APP_ID;
  next.productName = STUDIO_PRODUCT_NAME;
  // Otherwise it is built from the package's author, T3 Tools.
  next.copyright = `Copyright © ${STUDIO_OWNER}`;
  next.artifactName = "Studio-${version}-${arch}.${ext}";
  next.extraResources = [
    ...(Array.isArray(next.extraResources) ? next.extraResources : []),
    { from: `apps/desktop/prod-resources/${STUDIO_RESOURCES_DIR}`, to: STUDIO_RESOURCES_DIR },
  ];
  const mac = record(next.mac);
  const extendInfo = record(mac.extendInfo);
  delete extendInfo.CFBundleDocumentTypes;
  next.mac = {
    ...mac,
    target: ["dmg"],
    category: "public.app-category.graphics-design",
    extendInfo: {
      ...extendInfo,
      NSLocalNetworkUsageDescription:
        "Studio talks to its own CAD tools and AI agents on this Mac.",
      NSScreenCaptureUsageDescription:
        "Studio captures the active window when you use the window capture shortcut.",
    },
    protocols: [],
    ...(input.signed ? {} : { identity: "-", hardenedRuntime: false }),
  };
  if (next.dmg !== undefined) {
    const dmg = record(next.dmg);
    delete dmg.background;
    next.dmg = { ...dmg, title: `Studio ${input.version}` };
  }
  return next;
}
