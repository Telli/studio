import { transitionCameraToViewPreset } from "../kit/camera/runtimeCamera.js";
import { requestSceneFrame } from "../kit/viewport/sceneFrames.js";
import { buildEdgeChainGraph } from "./workbench/edgeChainSelection.js";
"use client";

import { SelectModeMenu, STEP_MEASURE_MODES, STEP_SELECT_DEFAULT, stepSelectModes } from "./components/workbench/SelectionModes.jsx";
import { pickModeOf } from "../kit/tools/select/selectFilter.js";
import { selects } from "../kit/tools/select/selectFilter.js";
import { NO_CONNECTED_SELECTION, connectedSelectionApplies, selectGeometryMode } from "./workbench/selectionFilter.js";
import { positionValuesAreDefault } from "../kit/inspector/kinematicsControls.jsx";
import { filterSelectionReferences, toggleReferenceGroupSelection, connectedReferenceIds } from "./workbench/selectionFilter.js";
import { buildTangentFaceGraph } from "./workbench/tangentFaceSelection.js";
import { createHoverStore } from "./workbench/hoverStore.js";

import * as THREE from "three";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { hasAuthoredMaterials } from "@text-to-cad/core/common/inspectEnvironment.js";
import { displayRecordsBounds, mergeBoundsList } from "@text-to-cad/core/lib/viewer/autoZoom.js";
import { referenceExplodedViewMatrix } from "@text-to-cad/core/lib/viewer/referenceGeometry.js";
import { VIEWER_PICK_MODE } from "@text-to-cad/core/lib/viewer/constants.js";
import { runtimeModelKeyMatches, toNumber } from "@text-to-cad/core/lib/viewer/modelRuntime.js";
import { normalizePartIdList } from "@text-to-cad/core/lib/viewer/partVisualState.js";
import RendererShell from "../kit/shell/RendererShell.jsx";
import { usePreviewState, useRendererShell } from "../kit/shell/useRendererShell.js";
import StepSceneLayers, { releaseStepRuntime } from "./scene/StepSceneLayers.jsx";
import StepPreviewLayers from "./scene/StepPreviewLayers.jsx";
import { displayRecordExplodedViewTranslation } from "./scene/useStepExplode.js";
import { createStepScene, stepSceneView } from "./scene/stepScene.js";
import { lookSubjectForReference } from "./scene/lookAtReference.js";
import { useStepViewPolicy, viewDrawsHairlines } from "./scene/useStepViewPolicy.js";
import {
  viewerHiddenPartIdsForRenderPane, viewerPickModeForRenderPane, viewerSelectedPartIdsForRenderPane,
  viewerSelectorRuntimeForRenderPane
} from "./workbench/viewerPickMode.js";
import { viewportMenuEntries } from "./components/workbench/AssemblyContextMenuItems.js";
import { useViewportLod } from "./render/useViewportLod.js";
import { lodSceneMayMove, sampleLodCamera } from "./render/lodCameraSample.js";
import { registerLodDisplaySource } from "./render/lodSceneAdoption.js";
import { ALL_VIEW_FEATURES, STEP_PART_VIEW_FEATURES } from "@text-to-cad/core/common/viewSettings.js";
import { useModelTools } from "../kit/tools/model-effects/ModelTools.jsx";
import { useStepPanels, useStepSelectionChips } from "./components/workbench/StepPanels.js";
import { stepMotionSources, useStepMotion } from "./workbench/useStepMotion.js";
import { useStepPreviewMotion } from "./workbench/useStepPreviewMotion.js";
import { useSettledValue } from "./workbench/settledValue.js";
import { animationControlsHaveContent } from "../kit/tools/playbar/AnimationTimeControl.js";
import { useCadAssets } from "./components/workbench/hooks/useCadAssets.js";
import { useEditingPreview } from "./components/workbench/hooks/useEditingPreview.js";
import { useViewportQualityStatus } from "./components/workbench/hooks/useViewportQualityStatus.js";
import { editingBuildActive } from "./workbench/editingPreview.js";
import { MeasurementsBar } from "../kit/tools/measure/measurementChips.jsx";
import { measureSelectHandlers } from "../kit/tools/measure/measureSelection.js";
import { useCadWorkspaceSelection } from "./components/workbench/hooks/useCadWorkspaceSelection.js";
import { useCadWorkspaceSelectors } from "./components/workbench/hooks/useCadWorkspaceSelectors.js";
import { useAppliedViewSettings } from "../kit/view-settings/useAppliedViewSettings.js";
import { useViewSettings } from "../kit/view-settings/useViewSettings.js";
import { previewSceneQuality } from "../kit/viewport/previewViewScene.js";
import {
  ASSET_STATUS,
  CAD_TOOL_MODES,
  REFERENCE_STATUS,
  TAB_TOOL_MODE
} from "./workbench/constants.js";
import { useStepView } from "./workbench/useStepView.js";
import {
  buildViewerMeshAlert,
  buildViewerEditAlert
} from "./workbench/viewerAlerts.js";
import {
  buildNormalizedReferenceState,
  buildReferenceCacheKey,
  copyTextLines,
  computeNextSelectionIds,
  orderedStringListEqual,
  parseAssemblyPartReferenceSelectionId,
  topologyCompositionKeyMatches,
  topologyCompositionServes,
  uniqueStringList
} from "./workbench/referenceSelection.js";
import {
  entryAssetHash,
  entryHasMesh,
  entryHasReferences,
  entryMeshAssetSignature
} from "@text-to-cad/core/lib/entryAssets.js";
import {
  hasMeshGeometry,
  hasStepGlbByteCost,
  isLargeMeshData,
  isLargeStepGlbEntry
} from "@text-to-cad/core/lib/render/meshCost.js";
import { createAnimationClock, AnimationClockProvider } from "./workbench/animationClockStore.js";
import { useMeasureSession } from "../kit/tools/measure/useMeasureSession.js";
import MeasureFilterMenu from "../kit/tools/measure/MeasureFilterMenu.jsx";
import { MEASURE_FILTER_DEFAULT } from "../kit/tools/measure/measureFilter.js";
import { fileKey } from "./workbench/entryPaths.js";
import {
  stepModuleTopologyOccurrenceIds
} from "./workbench/topologyCapabilities.js";
import { stepJointHandles, stepPosableDofs } from "./workbench/jointHandles.js";
import { useArtifact } from "./components/workbench/hooks/useArtifact.js";
import { artifactEndsLoad, artifactFreshnessKey } from "./workbench/artifactResolution.js";
import {
  rootAssemblyInspectionNodeId,
  buildAssemblyLeafToNodePickMap,
  descendantLeafPartIds,
  findAssemblyNode,
  findAssemblyNodes,
  flattenAssemblyNodes,
  flattenAssemblyLeafParts,
  leafPartIdsForAssemblySelection,
  resolveAssemblyPickedPartId
} from "@text-to-cad/core/lib/assembly/meshData.js";
import {
  assemblyNodeContainsNode,
  minimalAssemblyIsolationNodeIds,
  selectableViewerNodeIdsForExpandedTree
} from "./workbench/assemblyIsolation.js";
import {
  assignStepTreeTopologyReferencePartIds,
  buildStepTreeRoot,
  buildStepTreeRootWithTopology,
  STEP_MODEL_ROOT_ID,
  STEP_MODEL_RENDER_PART_ID
} from "@text-to-cad/core/lib/step/stepTree.js";
import {
  normalizeStepModuleParameterValues,
  resolveStepModuleFeatures
} from "@text-to-cad/core/common/stepModule.js";
import {
  meshStateIsComplete,
  retainsPreviousStepMesh
} from "./components/workbench/hooks/packageProgressiveLoad.js";
import { meshLoadErrorForViewer, shouldStartMeshLoad } from "./components/workbench/hooks/meshLoadTarget.js";
import { useViewerHost } from "../../host/context.js";
import { useWorkspaceDocument } from "../workspace/useWorkspaceDocument.js";
import { createCadPromptContext } from "./file-view/promptContext.js";
import { modelMenuDescriptor, partMenuDescriptor, topologyMenuDescriptor } from "./file-view/stepMenus.js";
import { selectionCopyPayload } from "./file-view/stepCopy.js";
import { referenceLabel, referencesFromCopyText, resolveSelectorSelection } from "./file-view/hostReference.js";
import { applySourceAppearanceToMeshData, sourceAppearanceGeometry } from "@text-to-cad/core/common/sourceSidecar.js";
import EditBrowser, { floatsCard } from "./edit/EditBrowser.jsx";
import DraftAnalysisLayer from "./edit/DraftAnalysisLayer.jsx";
import PreviewLayer from "./edit/PreviewLayer.jsx";
import EditDimensions from "./edit/EditDimensions.jsx";
import EditLayoutSwitch from "./edit/EditLayoutSwitch.jsx";
import EditRibbon from "./edit/EditRibbon.jsx";
import EditTimeline from "./edit/EditTimeline.jsx";
import EditSelectionBar from "./edit/EditSelectionBar.jsx";
import { featureAsk } from "./edit/featureAsk.jsx";
import { boundsCorners, facePick, featurePick, pickedReferences, quickEditLetsGo, quickEditShown, selectionBarActions } from "./edit/selectionBar.js";
import { faceChipName, faceReference, shownFaces } from "./edit/faceChips.js";
import { chosenThrough, useAsked, useChosenFeature } from "./edit/selectionBarState.js";
import { useAddToContext } from "./edit/useAddToContext.js";
import { faceShapesOf, faceShapesText } from "../kit/tools/annotate/faceShapes.js";
import { parseCadRefSelector, parseCadRefToken } from "@text-to-cad/core/lib/cadRefs.js";
import { DRAWING_TOOL_ICONS, ToolIcon } from "./edit/cadIcons.jsx";
import { drawingToolVariant } from "../../annotation/toolbar.jsx";
import SketchOverlay from "./edit/SketchOverlay.jsx";
import SheetEditor from "./edit/SheetEditor.jsx";
import SketchesLayer from "./edit/SketchesLayer.jsx";
import ImportedBody from "./edit/ImportedBody.jsx";
import ValueCallout from "./edit/ValueCallout.jsx";
import { NxIconSprite } from "../../lib/nxIcons.generated.jsx";
import { WORKSPACE_SELECTION_COLOR, editLayoutState, useEditLayout } from "./edit/editLayout.js";
import { editLayoutHost } from "../../tab-store/editLayoutHost.js";
import { useHostFocus } from "./edit/useHostFocus.js";
import { openedFrom, rememberOpenedFrom } from "./edit/openedFrom.js";
import {
  ORIGIN_PLANES,
  editCommand,
  featureNames,
  featureTree,
  treeFeatures,
  mirrorOutline,
  nextSketchName,
  notASketch,
  originAxis,
  planeOutline,
  rolledBack,
  selectionDimensions,
  selectionItems,
  sizeName,
  sketchTreeId,
  sketchView,
  treeSketch,
  STANDARD_VIEWS
} from "./edit/editMode.js";
import { useEditMode } from "./edit/useEditMode.js";
import { useEditShortcuts } from "./edit/useEditShortcuts.js";
import { stepPartNameFromFile } from "@text-to-cad/core/lib/step/productName.js";
// The geometry modes that pick faces or edges, never the part (`selectGeometryMode`).
const TOPOLOGY_FILTERS = new Set(["faces", "edges", "topology"]);
// The shape a geometry mode gives the model tree: one that picks no geometry leaves the
// person's own tree, as All does; Faces and Edges together open it as either does.
const treeShape = mode => (mode === "none" ? "all" : mode === "topology" ? "faces" : mode);
const EMPTY_MATERIAL_OVERRIDES = Object.freeze({});
const EMPTY_ID_SET = new Set();
const TOPOLOGY_EXPANSION_INTERVAL_MS = 150;
// --- zoom to selection -------------------------------------------------------
// What a selection occupies NOW: the boxes of its references, from the selector runtime as
// posed, merged with the boxes of its parts, from the records on screen (explosion included).
/**
 * The store URL of a rollback bar's tree, from the part's own (`/__cad/store?file=<tree>`, which a
 * tunneled host writes absolute): the same route, naming the bar's tree, with no document of its own.
 */
function rollbackStoreUrl(url, tree) {
  const absolute = /^[a-z][a-z\d+.-]*:\/\//i.test(url);
  const parsed = new URL(url, "http://viewer.invalid");
  parsed.searchParams.set("file", tree);
  parsed.searchParams.delete("documentHash");
  return absolute ? parsed.toString() : `${parsed.pathname}${parsed.search}`;
}

function pointBounds(center) {
  if (!Array.isArray(center) && !ArrayBuffer.isView(center)) return null;
  const point = [toNumber(center[0]), toNumber(center[1]), toNumber(center[2])];
  return { min: point, max: [...point] };
}

function selectorReferenceForId(selectorRuntime, referenceId) {
  const id = String(referenceId || "").trim();
  if (!id || !selectorRuntime) return null;
  return selectorRuntime.referenceMap?.get?.(id) ||
    selectorRuntime.faceReferenceMap?.get?.(id) ||
    selectorRuntime.edgeReferenceMap?.get?.(id) ||
    selectorRuntime.referenceByDisplaySelector?.get?.(id) ||
    selectorRuntime.referenceByNormalizedSelector?.get?.(id) ||
    null;
}

function selectorReferenceBounds(selectorRuntime, referenceIds = []) {
  const boundsList = [];
  for (const referenceId of normalizePartIdList(referenceIds)) {
    const reference = selectorReferenceForId(selectorRuntime, referenceId);
    const bbox = reference?.pickData?.bbox || reference?.bbox || null;
    const bounds = mergeBoundsList([bbox]) || pointBounds(reference?.pickData?.center || reference?.center);
    if (bounds) boundsList.push(bounds);
  }
  return mergeBoundsList(boundsList);
}

function displayRecordBoundsForPartIds(runtime, partIds = []) {
  const normalizedPartIds = normalizePartIdList(partIds);
  if (!normalizedPartIds.length || !Array.isArray(runtime?.displayRecords)) return null;
  const translationByRecord = new Map();
  for (const record of runtime.displayRecords) {
    const translation = displayRecordExplodedViewTranslation(THREE, record);
    if (translation.lengthSq() > 1e-12) translationByRecord.set(record, translation);
  }
  return displayRecordsBounds(runtime.displayRecords, { partIds: new Set(normalizedPartIds), translationByRecord });
}

import {
  DEFAULT_LARGE_FILE_STATE,
  EMPTY_LIST,
  entryWithoutRenderAssets,
  normalizeLargeFileState
} from "./file-view/fileViewState.js";
import {
  addReferenceLookupKeys,
  buildStepTreeCopyReferenceMap,
  collectStepTreeAssemblyNodeIds,
  collectStepTreeRevealExpansionIds,
  collectStepTreeSubtreeIds,
  collectStepTreeTopologyLoadableNodeIds,
  expandedVisibleStepTreeTopologyNodeIds,
  referencesForExpandedStepTree,
  stepTreeTopologyOwnersForSelectors,
  copyableStepTreeNodeForWorkspace,
  findStepTreeTopologyNodeIdForReference
} from "./file-view/stepTreeSelection.js";
import { TOOL_SHORTCUTS } from "../kit/tools/toolShortcuts.js";

/**
 * State whose current value event handlers read synchronously (a pick, then a menu built from
 * it, in one gesture): every write goes through one setter that updates the ref and the state
 * together, so the two can never disagree and nothing re-syncs them after a render.
 */
function useSyncedState(initial) {
  const [value, setValue] = useState(initial);
  const ref = useRef(value);
  const set = useCallback((next) => {
    const resolved = typeof next === "function" ? next(ref.current) : next;
    ref.current = resolved;
    setValue(resolved);
  }, []);
  return [value, set, ref];
}

// The shared renderer consumes one prepared entry. FileViewer owns navigation
// and persistence; the connection owns catalog subscriptions.
export default function StepSurface({ view, data }) {
  const clock = useMemo(() => createAnimationClock(), []);
  return <AnimationClockProvider value={clock}><StepSurfaceBody view={view} data={data} /></AnimationClockProvider>;
}


// `view` is the host's view props exactly as every shell renderer takes them, and `data` the
// prepared document: the workspace half of it (the prompt resource, the host's command and
// preference stores, the shell's services) is `useWorkspaceDocument`'s, as it is for every
// renderer on the shell.
function StepSurfaceBody({ view, data }) {
  const { client, entry, renderSession: cadRenderSession } = data;
  const workspace = useWorkspaceDocument({ view, data });
  const { resource: documentResource, services, acknowledgeCommand } = workspace;
  const selectReference = workspace.commands.selectReference;
  const state = view.state;
  const colorScheme = view.appearance?.colorScheme;
  const host = useViewerHost();
  const resolvedColorSchemeMode = colorScheme === "dark" ? "dark" : "light";
  const storeSnapshot = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const selectedKey = fileKey(entry);
  const liveEntry = workspace.entry;
  const catalogHydrated = storeSnapshot.hydrated;
  const catalogError = storeSnapshot.error || "";
  const [selectedReferenceIds, setSelectedReferenceIds, selectedReferenceIdsRef] = useSyncedState([]);
  const [largeFileState, setLargeFileState] = useState(() => normalizeLargeFileState(DEFAULT_LARGE_FILE_STATE));
  // Hover lives in a store, not in this component's state: a hover change re-renders the
  // viewport's layers, which draw it, and nothing else (`workbench/hoverStore.js`).
  const [hoverStore] = useState(createHoverStore);
  const {
    setModelReferenceId: setHoveredModelReferenceId,
    setModelPartId: setHoveredModelPartId,
    setListPartId: setHoveredListPartId
  } = hoverStore;
  // What Select picks, its menu's mode (`kit/tools/select/selectFilter.js`): All (Parts, Faces,
  // Edges, Position's knobs, the annotations and measurements), or one of them alone.
  // `selectionFilter` is how the geometry ticked is picked (`selectGeometryMode`); how a face or
  // edge pick grows (Group faces, Group edges) is independent of it.
  const [selectFilter, setSelectFilter] = useState(STEP_SELECT_DEFAULT);
  const selectionFilter = selectGeometryMode(selectFilter);
  // What Measure snaps to, its own filter (`kit/tools/measure/measureFilter.js`): Vertices, Edges
  // and Faces, every kind when a file opens.
  const [measureFilter, setMeasureFilter] = useState(MEASURE_FILTER_DEFAULT);
  const [connectedSelection, setConnectedSelection] = useState(NO_CONNECTED_SELECTION);
  // A press under a face or edge filter on an assembly part whose faces are not loaded yet:
  // `{ partId, clientX, clientY, pointerType, multiSelect }`, replayed once they can be picked.
  const [pendingTopologyPick, setPendingTopologyPick] = useState(null);
  // Measure's press on an assembly part whose faces and edges were not loaded: pressed again there once they are.
  const [pendingMeasurePick, setPendingMeasurePick] = useState(null);
  const [selectedPartIds, setSelectedPartIds, selectedPartIdsRef] = useSyncedState([]);
  const [selectedRenderPartIdByAssemblyPartId, setSelectedRenderPartIdByAssemblyPartId, selectedRenderPartIdByAssemblyPartIdRef] = useSyncedState({});
  const [expandedStepTreeNodeIds, setExpandedStepTreeNodeIds] = useState([]);
  const [activeTreeNodeScrollKey, setActiveTreeNodeScrollKey] = useState("");
  const [hiddenPartIds, setHiddenPartIds] = useState([]);
  const [isolatedAssemblyNodeIds, setIsolatedAssemblyNodeIds] = useState([]);
  // What the viewport's menu is ABOUT while it is up (the part stays marked); the menu itself,
  // its gesture and its dismissal are the shell's (`kit/shell/ViewportContextMenu.jsx`). The ref
  // is how the press that asks for the menu's entries reads the descriptor it just resolved.
  const [viewerContextMenu, setViewerContextMenuState] = useState(null);
  const viewerContextMenuRef = useRef(null);
  const setViewerContextMenu = useCallback((next) => {
    viewerContextMenuRef.current = next;
    setViewerContextMenuState(next);
  }, []);
  const { display: displaySettings, scene: desiredScene, store: viewSettingsStore } = useViewSettings(resolvedColorSchemeMode);
  // The viewport's handle, and the ONE coordinator that drives it. Both are this
  // renderer's: what it loads, and how much detail it asks for, is decided from the
  // RESOLVED view — long before it can describe its own load to the shell.
  const viewerRef = useRef(null);
  // ONE scene per mounted file, made HERE rather than in the viewport: the shell hook is
  // handed a scene, and it runs in this function, above the viewport it mounts.
  const [stepScene] = useState(() => createStepScene(THREE));
  const viewUpdate = useAppliedViewSettings(desiredScene, selectedKey, viewerRef, viewSettingsStore);
  // Preview, held here because the gates below run before the shell hook; the shell writes it.
  const preview = usePreviewState();
  const previewing = preview.previewing;
  // The scene as this mode's render profile draws it: preview raises the LOD's detail with the rest.
  // What the editor's viewport draws; Preview is a view of its own and draws itself.
  const resolvedScene = viewUpdate.scene;
  const [stepUpdateInProgress, setStepUpdateInProgress] = useState(false);
  // Edit mode's rollback bar: the body above a feature, as a tree of the store the server published
  // ({ tree, kind }), drawn and picked in place of the part's while the bar is up. Set below, once
  // edit mode has read the part; the entry is swapped as the same file's next revision is.
  const [rollbackTree, setRollbackTree] = useState(null);
  // The viewport's own alert, kept HERE: this renderer folds it into an alert of its own
  // (`viewerAlert` below) and hands the shell the composed result.
  const [viewerRuntimeAlert, setViewerRuntimeAlert] = useState(null);
  const rendering = resolvedScene.render.enabled;
  const resolvedThemeSettings = resolvedScene.theme;
  const resolvedMaterialOverrides = resolvedScene.materialOverrides || EMPTY_MATERIAL_OVERRIDES;
  // The tool in hand is never saved: a STEP opens in Select.
  const [tabToolMode, setTabToolMode] = useState(CAD_TOOL_MODES.defaultMode);

  const {
    meshState,
    lodPackage,
    applyComponentLodBatch,
    prepareComponentLodPayload,
    onMeshSourceAdoption,
    componentLodNeedsSelectors,
    meshLoadInProgress,
    meshLoadTargetFile,
    meshLoadTargetHash,
    meshLoadProgress,
    status,
    setStatus,
    error,
    setError,
    referenceState,
    setReferenceState,
    referenceStatus,
    setReferenceStatus,
    setReferenceError,
    cancelReferenceLoad,
    loadMeshForEntry,
    loadReferencesForEntry,
    fatalLoadFailure,
    clearFatalLoadFailure
  } = useCadAssets({
    initialEntry: liveEntry,
    client,
    tessellationCache: cadRenderSession.tessellationCache,
    entryHasMesh,
    entryHasReferences,
    buildNormalizedReferenceState,
  });

  const editingFile = liveEntry ? fileKey(liveEntry) : selectedKey;
  const editingAvailable = /\.st(?:ep|p)$/i.test(editingFile || "");
  // The build feed: status only ("Updating model…", a failed build). The view shows the saved file.
  const editingPreview = useEditingPreview(editingFile, { client,
    enabled: editingAvailable,
  });
  const editingHasView = entryHasMesh(liveEntry);
  // Unified render-artifact status for the selected entry: ready (render) | generating (loading) |
  // error (fatal). A missing/stale cache is not an issue — it just triggers a (re)build. Replaces
  // the per-entry step-source-status fetch, the mesh-stripping merge, and the build effect. It is
  // asked again when this file's entry changes, never for the rest of the catalog
  // (`artifactFreshnessKey`), and a build of a model already on screen is left to the build feed.
  const selectedArtifact = useArtifact(
    liveEntry ? fileKey(liveEntry) : "",
    {
      freshnessKey: artifactFreshnessKey(liveEntry, storeSnapshot),
      shown: editingHasView,
      client,
    }
  );
  const selectedArtifactGenerating = selectedArtifact.status === "compiling" && !editingHasView;
  // The in-flight build's own report of where it is (null until it reports, and for
  // every loading state that is not an artifact build). Only meaningful while
  // generating — a stale frame must not outlive the build that produced it.
  const selectedArtifactProgress = selectedArtifactGenerating ? selectedArtifact.progress : null;
  // The name copied refs give this file, so they still say which file they belong to when
  // pasted into a prompt spanning several: its absolute path.
  const referencePath = view.file.path;
  // While the artifact is missing/stale/building/broken, hide the (possibly stale) render assets so
  // the viewer shows a loading or error state and renders only the fresh artifact once ready.
  const viewedEntry = useMemo(
    () => {
      const base = !liveEntry || selectedArtifact.status === "compiled" || entryHasMesh(liveEntry)
        ? liveEntry
        : entryWithoutRenderAssets(liveEntry);
      if (!base) {
        return base;
      }
      return referencePath ? { ...base, fileRefPrefix: referencePath } : base;
    },
    [liveEntry, selectedArtifact.status, referencePath]
  );
  // While rolled back, the same file drawn from the bar's tree: its own mesh and faces and edges,
  // none of the part's appearance, pose or motion.
  const selectedEntry = useMemo(() => (rollbackTree && viewedEntry?.url ? {
    ...viewedEntry, url: rollbackStoreUrl(viewedEntry.url, rollbackTree.tree), hash: rollbackTree.tree, kind: rollbackTree.kind,
    appearanceHash: undefined, poseUrl: undefined, animationHash: undefined,
  } : viewedEntry), [viewedEntry, rollbackTree]);
  // This renderer is only ever handed a STEP (its `matches`, index.ts), keyed per file, and an
  // entry is always present: so every capability a STEP has (parts, topology, Measure, a
  // sidecar's parameters, the Select and Annotate tools) is simply on here, and nothing below asks
  // the format again.
  // The URL's path IS the directory, so there is nothing to select and no state to
  // reconcile — the Viewer always has exactly one directory, the one it was opened at.
  // Where this entry's motion comes from; the motion itself is `useStepMotion`'s, below.
  const {
    moduleUrl: selectedStepModuleUrl, sourceAnimation: selectedSourceAnimation, animationKey: selectedAnimationSourceKey
  } = stepMotionSources(selectedEntry);
  const selectedEntryHasMesh = entryHasMesh(selectedEntry);
  const selectedEntryHasReferences = entryHasReferences(selectedEntry);
  // The selected entry's render artifact is (re)building -> show the loading state. Replaces the
  // old !entryHasMesh + buildable-code derivation.
  const selectedMeshHash = entryMeshAssetSignature(selectedEntry);
  const selectedMeshMatches =
    !!meshState &&
    !!selectedEntry &&
    meshState.file === fileKey(selectedEntry) &&
    meshState.meshHash === selectedMeshHash;
  // useCadAssets keeps the complete scene while a same-file STEP revision loads
  // (a part's or an assembly's). Keep that predecessor on screen until the new
  // one is published: an edit is an update, never the loading screen again.
  // Reference matching remains hash-strict below, so its stale topology cannot
  // be picked while the replacement geometry/selectors are loading.
  // Before that, while the rewritten file's next revision is still being built, the entry has no
  // mesh at all: the model on screen stays through that too (`awaitingSameFileRevision`), so a
  // rebuild is only ever an update, never the loading screen again. A model with motion is no
  // exception: its new revision's module poses the new mesh once that is published.
  const retainingPreviousStepMesh = retainsPreviousStepMesh(meshState, selectedEntry,
    { entryHasMesh: selectedEntryHasMesh, meshHash: selectedMeshHash });
  const retainedPreviousStepMeshError = retainingPreviousStepMesh &&
    meshState?.assemblyBackgroundErrorMeshHash === selectedMeshHash
    ? String(meshState?.assemblyBackgroundError || "").trim()
    : "";
  // While it is held, the model on screen is the previous revision: the next one is listed as a bare
  // part with no mesh until it is built, and stays listed so when its build fails. The view describes
  // the model it shows -- its kind, its tree, its parts (`meshState`) -- never the listing of a
  // revision that has none, which left the tree one row under a model that had not changed.
  const isAssemblyView = (retainingPreviousStepMesh ? meshState?.kind : selectedEntry?.kind) === "assembly";
  // What this file's view opts into: a B-rep model takes every Display section, preset and surface
  // style, and an assembly Explode too. A part file has none, as it has no Model tree: one part
  // separates nothing. The shell configures the store with it (`features`).
  const viewFeatures = isAssemblyView ? ALL_VIEW_FEATURES : STEP_PART_VIEW_FEATURES;
  const shownMeshCurrent = selectedMeshMatches || retainingPreviousStepMesh;
  // A rebuild still running holds the view: what is picked now would not outlive its revision. One
  // that failed leaves the previous revision on screen for good, with nothing coming to replace it:
  // that is the model to work with -- picked from, hidden, isolated -- until the file is fixed.
  const previousRevisionStands = retainingPreviousStepMesh && selectedArtifact.status === "failed";
  const stepInteractionBlocked = (stepUpdateInProgress || retainingPreviousStepMesh) && !previousRevisionStands;
  const selectedAssemblyStructureReady = isAssemblyView && shownMeshCurrent && !!meshState?.assemblyStructureReady;
  const selectedAssemblyInteractionReady = isAssemblyView && shownMeshCurrent && !!meshState?.assemblyInteractionReady;
  const selectedAssemblyHydrationFailed =
    selectedEntry?.kind === "assembly" &&
    !!meshState?.assemblyBackgroundError &&
    (selectedMeshMatches || !!retainedPreviousStepMeshError);
  const selectedMeshData = (selectedMeshMatches || retainingPreviousStepMesh) ? meshState.meshData : null;
  const selectedSourceAppearance = selectedEntry?.sourceSidecar
    ? selectedEntry.sourceSidecar.appearance || null
    : selectedMeshData?.appearance || null;
  const selectedDisplayMeshData = useMemo(() => {
    return registerLodDisplaySource(
      applySourceAppearanceToMeshData(selectedMeshData, selectedSourceAppearance),
      selectedMeshData
    );
  }, [selectedMeshData, selectedSourceAppearance]);
  const handleDisplayMeshAdoption = useCallback((source, ok, detail) =>
    onMeshSourceAdoption(sourceAppearanceGeometry(source), ok, detail), [onMeshSourceAdoption]);
  const selectedMeshPartial = selectedMeshMatches && !meshStateIsComplete(meshState);

  // ---- motion: the kinematics module and Position, the routines and playback -------------------
  // One motion at a time: Explode, Position and a routine's frame replace each other. Taking
  // One of four at a time: Explode, the routine, Position and Clip each move the model's parts or
  // cut its box, and whichever is SET off its default — its value changed, never merely its tool
  // taken up or its panel pressed — puts the other three back at theirs. A frame left by the
  // Animation section stays on the model, as a pose does. Position and the routine are the motion
  // hook's (a joint moved rewinds the routine; the routine played puts the pose back); Explode and
  // Clip are the view settings', so the hook says when one of its two was used and they go off
  // here, and Explode or Clip set puts the hook's two at rest and the other off (below). Preview's
  // pose and routine are its own (`useStepPreviewMotion`), on its own scene.
  const explodeAppliedRef = useRef(false);
  const clipAppliedRef = useRef(false);
  const motionHost = useMemo(() => ({
    onUse: () => {
      if (explodeAppliedRef.current) viewSettingsStore.patch({ exploded: { enabled: false, amount: 0 } });
      if (clipAppliedRef.current) viewSettingsStore.patch({ clip: { enabled: false, axis: "x", invert: false } });
    }
  }), [viewSettingsStore]);
  const motion = useStepMotion({
    entry: selectedEntry, fileKey: selectedKey, resources: client.resources,
    meshData: selectedMeshData, meshPartial: selectedMeshPartial,
    readStored: () => session.readStored(), clipboard: host.clipboard,
    reportError: (message) => shellRef.current?.reportActionError(message), host: motionHost
  });
  const {
    definition: selectedStepModuleDefinition, loading: selectedStepModuleLoading,
    topologyRequired: selectedStepModuleTopologyRequired, parameterValues: stepModuleParameterValues,
    animationState, animationRuntime: selectedAnimationRuntime, animationError: selectedAnimationError
  } = motion;

  const assemblyRoot = selectedAssemblyStructureReady
    ? selectedMeshData?.assemblyRoot || null
    : null;
  // An assembly tree already contains its occurrence metadata. Display-only
  // tessellation changes must not invalidate tree consumers through meshData.
  const stepPartMeshData = assemblyRoot ? null : selectedMeshData;
  const stepTreeRoot = useMemo(() => buildStepTreeRoot({
    selectedEntry,
    assemblyRoot,
    meshData: stepPartMeshData
  }), [assemblyRoot, selectedEntry, stepPartMeshData]);
  const assemblyLeafParts = useMemo(() => {
    return Array.isArray(selectedMeshData?.parts) ? selectedMeshData.parts : flattenAssemblyLeafParts(assemblyRoot);
  }, [assemblyRoot, selectedMeshData?.parts]);
  const stepLeafParts = useMemo(() => {
    if (isAssemblyView) {
      return assemblyLeafParts;
    }
    if (!stepTreeRoot) {
      return [];
    }
    return [{
      id: STEP_MODEL_RENDER_PART_ID,
      label: stepTreeRoot.displayName || stepTreeRoot.name || "STEP part",
      name: stepTreeRoot.displayName || stepTreeRoot.name || "STEP part",
      nodeType: "part",
      bounds: selectedMeshData?.bounds || null
    }];
  }, [assemblyLeafParts, isAssemblyView, selectedMeshData?.bounds, stepTreeRoot]);
  const stepTreeNodes = useMemo(() => flattenAssemblyNodes(stepTreeRoot), [stepTreeRoot]);
  const validAssemblySelectionIds = useMemo(
    () => stepTreeNodes.map((node) => String(node?.id || "").trim()).filter(Boolean),
    [stepTreeNodes]
  );
  const validAssemblySelectionIdSet = useMemo(
    () => new Set(validAssemblySelectionIds),
    [validAssemblySelectionIds]
  );
  const assemblyRootNodeId = useMemo(
    () => rootAssemblyInspectionNodeId(assemblyRoot),
    [assemblyRoot]
  );
  const focusedAssemblyNodeIds = useMemo(() => {
    if (!isAssemblyView || !assemblyRoot || !isolatedAssemblyNodeIds.length) {
      return [];
    }
    return minimalAssemblyIsolationNodeIds(assemblyRoot, isolatedAssemblyNodeIds, {
      rootId: assemblyRootNodeId
    });
  }, [
    assemblyRoot,
    assemblyRootNodeId,
    isolatedAssemblyNodeIds,
    isAssemblyView
  ]);
  const loadableStepTreeTopologyNodeIds = useMemo(() => (
    isAssemblyView && selectedEntryHasReferences
      ? collectStepTreeTopologyLoadableNodeIds(stepTreeRoot)
      : []
  ), [
    isAssemblyView,
    selectedEntryHasReferences,
    stepTreeRoot
  ]);
  const loadableStepTreeTopologyNodeIdSet = useMemo(
    () => new Set(loadableStepTreeTopologyNodeIds),
    [loadableStepTreeTopologyNodeIds]
  );
  // What the viewport picks, and whose faces and edges load, by Select's filter, whatever the tree
  // has open: Parts and the topology modes reach every part, an assembly the tree keeps shut too (a
  // pick opens its owners in the tree), Parts loading no topology; with Parts and Faces or Edges, or
  // no geometry ticked, the tree's own open rows are what a press can take.
  const stepTreeAssemblyIds = useMemo(() => (stepTreeRoot ? collectStepTreeAssemblyNodeIds(stepTreeRoot) : EMPTY_LIST), [stepTreeRoot]);
  const pickExpandedStepTreeNodeIds = useMemo(() => {
    const shape = treeShape(selectionFilter);
    if (shape === "all") return expandedStepTreeNodeIds;
    return shape === "parts" ? stepTreeAssemblyIds : uniqueStringList([...expandedStepTreeNodeIds, ...stepTreeAssemblyIds]);
  }, [selectionFilter, expandedStepTreeNodeIds, stepTreeAssemblyIds]);
  const expandedStepTreeTopologyNodeIds = useMemo(() => expandedVisibleStepTreeTopologyNodeIds(
    stepTreeRoot, pickExpandedStepTreeNodeIds,
    { isolatedNodeIds: focusedAssemblyNodeIds, hiddenPartIds, isAssemblyView }
  ), [stepTreeRoot, pickExpandedStepTreeNodeIds, focusedAssemblyNodeIds, hiddenPartIds, isAssemblyView]);
  const requestedStepTreeTopologyNodeIds = useMemo(() => {
    if (!isAssemblyView || !selectedEntryHasReferences) {
      return [];
    }
    return uniqueStringList(
      [
        ...expandedStepTreeTopologyNodeIds,
        ...stepModuleTopologyOccurrenceIds(selectedStepModuleDefinition)
      ]
        .map((id) => String(id || "").trim())
        .filter((id) => id && loadableStepTreeTopologyNodeIdSet.has(id))
    );
  }, [
    expandedStepTreeTopologyNodeIds,
    isAssemblyView,
    loadableStepTreeTopologyNodeIdSet,
    selectedStepModuleDefinition,
    selectedEntryHasReferences,
  ]);
  const viewerSelectableAssemblyNodeIds = useMemo(
    () => (isAssemblyView
      ? selectableViewerNodeIdsForExpandedTree(assemblyRoot, pickExpandedStepTreeNodeIds, {
        rootId: assemblyRootNodeId,
        isolatedNodeIds: focusedAssemblyNodeIds,
        topologyNodeIds: requestedStepTreeTopologyNodeIds
      })
      : []),
    [
      assemblyRoot,
      assemblyRootNodeId,
      pickExpandedStepTreeNodeIds,
      focusedAssemblyNodeIds,
      isAssemblyView,
      requestedStepTreeTopologyNodeIds
    ]
  );
  const viewerSelectableAssemblyNodeIdSet = useMemo(
    () => new Set(viewerSelectableAssemblyNodeIds),
    [viewerSelectableAssemblyNodeIds]
  );
  const assemblyParts = useMemo(() => {
    return viewerSelectableAssemblyNodeIds.length
      ? findAssemblyNodes(assemblyRoot, viewerSelectableAssemblyNodeIds)
        .filter(Boolean)
        .map((node) => ({
          ...node,
          leafPartIds: descendantLeafPartIds(node)
        }))
      : [];
  }, [
    assemblyRoot,
    viewerSelectableAssemblyNodeIds
  ]);
  const assemblyPickPartIdMap = useMemo(() => {
    return buildAssemblyLeafToNodePickMap(assemblyParts);
  }, [assemblyParts]);
  const assemblyPartsLoaded = isAssemblyView
    ? selectedAssemblyStructureReady
    : selectedMeshMatches && !!selectedMeshData;
  const supportsPartSelection = assemblyPartsLoaded && stepLeafParts.length > 0;
  const assemblyPartMap = useMemo(() => {
    const map = new Map();
    for (const node of stepTreeNodes) {
      map.set(node.id, node);
    }
    for (const part of stepLeafParts) {
      map.set(part.id, part);
    }
    return map;
  }, [stepLeafParts, stepTreeNodes]);
  useEffect(() => {
    if (!isAssemblyView) {
      setIsolatedAssemblyNodeIds((current) => (current.length ? [] : current));
      return;
    }
    // An assembly whose root is still on its way keeps what it has: a restored isolation waits
    // for the root it names, and is reduced against it — or dropped — once it arrives.
    if (!assemblyRoot) return;
    setIsolatedAssemblyNodeIds((current) => {
      const next = minimalAssemblyIsolationNodeIds(assemblyRoot, current, {
        rootId: assemblyRootNodeId
      });
      return orderedStringListEqual(next, current) ? current : next;
    });
  }, [
    assemblyRoot,
    assemblyRootNodeId,
    isAssemblyView
  ]);
  const validAssemblyLeafIds = useMemo(
    () => stepLeafParts.map((part) => String(part?.id || "").trim()).filter(Boolean),
    [stepLeafParts]
  );
  const validAssemblyLeafIdSet = useMemo(
    () => new Set(validAssemblyLeafIds),
    [validAssemblyLeafIds]
  );
  const resolvePickedAssemblyPartId = useCallback((partId) => {
    return resolveAssemblyPickedPartId(partId, {
      pickPartIdMap: assemblyPickPartIdMap,
      validLeafPartIds: validAssemblyLeafIdSet
    });
  }, [assemblyPickPartIdMap, validAssemblyLeafIdSet]);
  const renderPartIdsForAssemblySelection = useCallback((partId, fallbackPartId = "") => {
    if (String(partId || "").trim() === STEP_MODEL_ROOT_ID) {
      return [STEP_MODEL_RENDER_PART_ID];
    }
    return leafPartIdsForAssemblySelection(partId, {
      assemblyPartMap,
      fallbackPartId,
      validLeafPartIds: validAssemblyLeafIdSet
    });
  }, [assemblyPartMap, validAssemblyLeafIdSet]);
  const renderPartIdForAssemblySelection = useCallback((partId, fallbackPartId = "") => {
    return renderPartIdsForAssemblySelection(partId, fallbackPartId)[0] || "";
  }, [renderPartIdsForAssemblySelection]);
  useLayoutEffect(() => {
    const hiddenLeafIds = new Set(
      (Array.isArray(hiddenPartIds) ? hiddenPartIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    );
    if (!hiddenLeafIds.size) {
      return;
    }
    setExpandedStepTreeNodeIds((current) => {
      let changed = false;
      const next = current.filter((nodeId) => {
        const leafIds = renderPartIdsForAssemblySelection(nodeId)
          .map((id) => String(id || "").trim())
          .filter(Boolean);
        const shouldCollapse = leafIds.length > 0 && leafIds.every((id) => hiddenLeafIds.has(id));
        if (shouldCollapse) {
          changed = true;
          return false;
        }
        return true;
      });
      return changed ? next : current;
    });
  }, [
    hiddenPartIds,
    renderPartIdsForAssemblySelection
  ]);
  // A render-artifact status nothing will load from — a fatal error (not building), or one settled
  // as compiled over an entry that still names no tree — stops the loading spinner so the alert
  // surfaces (`artifactEndsLoad`).
  const artifactBlocksRender = artifactEndsLoad(selectedArtifact, editingHasView);
  const viewerLoading =
    (selectedArtifactGenerating || !artifactBlocksRender) &&
    status !== ASSET_STATUS.ERROR &&
    ((!selectedMeshMatches && !retainedPreviousStepMeshError) ||
      status === ASSET_STATUS.LOADING || selectedStepModuleLoading);
  const effectiveViewerLoading = viewerLoading || selectedArtifactGenerating;
  // The file explorer spins the entry the viewer is actually working on. Artifact
  // generation is only half of that -- a built package still has to be fetched and
  // decoded, and an entry sitting un-built is NOT loading (nothing loads in a static
  // list), so this is deliberately the SELECTED entry while the viewer is busy rather
  // than "every entry without an artifact".
  const assemblyTreeLoading =
    isAssemblyView &&
    selectedMeshMatches &&
    !assemblyPartsLoaded &&
    !selectedAssemblyHydrationFailed;
  const activeMeshLoadProgress = meshLoadInProgress && meshLoadTargetFile === fileKey(selectedEntry)
    ? meshLoadProgress : null;
  const selectedLoadProgress = selectedArtifactProgress || activeMeshLoadProgress || null;
  // The revision half of the shell's presentation token: what is being shown, and whether it
  // is all of it yet. The shell builds the token and hands it to the viewport.
  const presentationRevisionKey = `${selectedMeshData ? meshState?.meshHash || selectedMeshHash : selectedMeshHash}:${selectedMeshPartial ? "partial" : "complete"}`;

  const viewerAlert = useMemo(() => {
    const editFailure = buildViewerEditAlert(editingPreview.state, Boolean(selectedMeshData && !selectedMeshPartial));
    if (editFailure) return editFailure;
    if (catalogError && !selectedMeshData) return {
      severity: "error", kind: "status", title: "Couldn’t open the model",
      message: "The viewer couldn’t retrieve this file’s information.",
      recovery: "Try again. If this continues, check that the viewer is running.",
      details: catalogError, reload: true,
    };
    if (viewerRuntimeAlert?.blocking) {
      return viewerRuntimeAlert;
    }
    if (!selectedEntry || viewerLoading || selectedArtifactGenerating) {
      return null;
    }
    const meshAlert = buildViewerMeshAlert(
      selectedEntry,
      !!selectedMeshData,
      meshLoadErrorForViewer({
        fatalError: status === ASSET_STATUS.ERROR ? error : "",
        hydrationFailed: selectedAssemblyHydrationFailed,
        backgroundError: meshState?.assemblyBackgroundError,
      }),
      selectedMeshData && !selectedMeshPartial &&
        !editingBuildActive(editingPreview.state) &&
        ["network", "timeout", "status"].includes(selectedArtifact.failure?.kind)
        ? null : selectedArtifact,
      { partial: selectedMeshPartial }
    );
    return meshAlert || viewerRuntimeAlert;
  }, [
    editingPreview.state,
    catalogError,
    error,
    meshState?.assemblyBackgroundError,
    selectedAssemblyHydrationFailed,
    selectedEntry,
    selectedArtifact,
    selectedArtifactGenerating,
    selectedMeshPartial,
    selectedMeshData,
    status,
    viewerLoading,
    viewerRuntimeAlert
  ]);
  const focusedAssemblyTopologyActive = Boolean(
    isAssemblyView &&
    requestedStepTreeTopologyNodeIds.length > 0 &&
    viewerSelectableAssemblyNodeIds.length < 1
  );
  const viewerInAssemblyMode =
    isAssemblyView &&
    viewerSelectableAssemblyNodeIds.length > 0;
  const viewerMode = viewerInAssemblyMode ? "assembly" : "part";

  // What the context menu's "Zoom to selection" frames, as it stands right now. It is
  // read when a menu descriptor is built — on the press, or when a tree row's menu
  // opens — so every place that menu appears offers the same item over the same target.
  const zoomSelectionRef = useRef({ partIds: EMPTY_LIST, referenceIds: EMPTY_LIST, available: false });
  const selectedEntryBuildSnapshotRef = useRef({
    fileRef: "",
    stepHash: ""
  });
  // This is the displayed render revision, so same-file saves cannot inherit
  // a predecessor's scheduler or benchmark milestones.
  const viewportQualityModelKey = `${selectedEntry?.file || ""}:${selectedMeshHash || selectedEntry?.hash || ""}`;
  // Viewport LOD (design/unified-tessellation.md Phase 5): camera-settle
  // driven re-tessellation of the components that project the worst error.
  // The viewport's own seams, filled in when it mounts: the live WebGL runtime, the layers'
  // published selector runtime, and "what reference is under this point" for the menu.
  const runtimeRefRef = useRef(null);
  const layersApiRef = useRef(null);
  const pickAtRef = useRef(null);
  // Where on the model a point of the screen lands (`scene/useStepPicking.js`), and edit mode's
  // Hole, waiting to hear where its face was clicked (set once edit mode is read, below).
  const pointAtRef = useRef(null);
  const holePointRef = useRef(null);
  // Whether a click on the face already picked keeps it picked: Hole adds a hole at each click on its face.
  const keepFaceRef = useRef(false);
  // Edit mode's command whose box takes many (Fillet's edges, Shell's faces), set once it is read.
  const choosingManyRef = useRef(false);
  // What a click on the model's background lets go of besides the selection: the feature chosen (`dropFeature`), set once
  // it is made. A click, as the viewport tells one from a drag: an orbit to look at the feature chosen keeps it.
  const backgroundClickRef = useRef(null);
  const topologyAtRef = useRef(null);
  const measureAtRef = useRef(null);
  const lodSelectedPartIdsRef = useRef(EMPTY_LIST);
  // Declared here, above the LOD scheduler that is handed it: it reads only refs, so it is
  // safe this early, and a `const` read before its declaration is a TDZ crash, not undefined.
  // The camera detail is loaded for: the view on screen, Preview's while it is open (its own
  // viewport, `previewRuntimeRefRef`), where nothing is selected.
  const previewRuntimeRefRef = useRef(null);
  const sampleViewportLodCamera = useCallback((options) => {
    const previewOpen = preview.now();
    const runtime = (previewOpen ? previewRuntimeRefRef : runtimeRefRef).current?.current;
    if (!runtimeModelKeyMatches(runtime, selectedKey)) return null;
    return sampleLodCamera(THREE, runtime, { ...options, selectedPartIds: previewOpen ? EMPTY_LIST : lodSelectedPartIdsRef.current });
  }, [selectedKey, preview.now]);
  // The detail asked for is the view on screen's: Preview raises it a tier (`previewViewScene.js`).
  const lodQuality = previewing ? previewSceneQuality(resolvedScene.quality) : resolvedScene.quality;
  const { onCameraMoved: onLodCameraMoved } = useViewportLod({
    resources: client.resources,
    sampleCamera: sampleViewportLodCamera,
    modelKey: viewportQualityModelKey,
    quality: lodQuality,
    lodPackage,
    tessellationCache: cadRenderSession.tessellationCache,
    applyComponentLodBatch,
    prepareComponentLodPayload,
    componentLodNeedsSelectors,
    // Capability, not just the current pose: a paused/disabled module can move
    // an offscreen part without a camera event when re-enabled.
    dynamicScene: lodSceneMayMove({ kinematics: selectedStepModuleDefinition, kinematicsLoading: selectedStepModuleLoading,
      animation: selectedSourceAnimation, exploded: resolvedScene.display?.exploded?.enabled })
  });
  // Publishes the readiness moments (first geometry, standard detail) that harnesses read.
  useViewportQualityStatus({
    modelKey: viewportQualityModelKey,
    quality: lodQuality,
    file: selectedEntry?.file || "",
    hasGeometry: Boolean(selectedMeshData),
    // A progressive assembly's first paint is a real preview, but more
    // components can still arrive. It must not look fully refined yet.
    modelComplete: !selectedMeshPartial && !meshLoadInProgress,
    // The scheduler installs its snapshot after React commits this package.
    // Its current scope must match this package before it can finish quality.
    lodExpectedComponentCount: Array.isArray(lodPackage?.components) ? lodPackage.components.length : 0
  });
  const handleViewerAlertChange = useCallback((nextAlert) => {
    setViewerRuntimeAlert(nextAlert || null);
  }, []);


  const resetSelectionForStepUpdate = useCallback(() => {
    setSelectedPartIds([]);
    setSelectedReferenceIds([]);
    setSelectedRenderPartIdByAssemblyPartId({});
    setHoveredModelReferenceId("");
    setHoveredListPartId("");
    setHoveredModelPartId("");
  }, []);

  // A routine that failed to load has no Animation section to say so in: the viewport's card says so, one
  // the person can put away (the geometry is all there).
  const annotationAlert = useMemo(() => (selectedAnimationError ? {
    severity: "warning", blocking: false,
    summary: "Animation unavailable",
    title: "Animation unavailable",
    message: "The geometry is visible, but its animation could not be loaded, so preview has no routine to play.",
    details: `File: ${fileKey(selectedEntry)}\n${selectedAnimationError}`,
  } : null), [selectedAnimationError, selectedEntry]);


  // ---- this STEP's own slices of the file's view -------------------------------------------
  // The view is written soon after anything in them changes. The selection, the tool, the
  // measurements and the routine are not in it: every open starts those afresh.
  const scheduleRecordSave = useCallback(() => { shellRef.current?.scheduleStateSave(); }, []);
  const session = useStepView({
    // Saved under the part's own revision, never a rollback's.
    state: view.state, entry: viewedEntry,
    tree: { expandedStepTreeNodeIds, hiddenPartIds, isolatedAssemblyNodeIds },
    parameterValues: stepModuleParameterValues, largeFileState,
    scheduleSave: scheduleRecordSave,
    // Everything this file was left with, once, before the first paint.
    restore(restored) {
      setExpandedStepTreeNodeIds(restored.tree.expandedStepTreeNodeIds);
      setHiddenPartIds(restored.tree.hiddenPartIds);
      setIsolatedAssemblyNodeIds(restored.tree.isolatedAssemblyNodeIds);
      setLargeFileState(normalizeLargeFileState(restored.largeFile));
      motion.restore(restored);
    }
  });

  useEffect(() => {
    const fileRef = fileKey(selectedEntry);
    const stepHash = String(selectedEntry?.hash || entryAssetHash(selectedEntry, "topology") || "").trim();
    if (!fileRef) {
      selectedEntryBuildSnapshotRef.current = {
        fileRef: "",
        stepHash: ""
      };
      setStepUpdateInProgress(false);
      return;
    }

    const previous = selectedEntryBuildSnapshotRef.current;
    const sameEntry = previous.fileRef === fileRef;
    const stepChanged = sameEntry && !!previous.stepHash && !!stepHash && previous.stepHash !== stepHash;

    if (stepChanged) {
      resetSelectionForStepUpdate();
      // Ink drawn over the previous revision does not describe this one: the annotation goes, and its
      // history with it, so Undo cannot bring it back over the new model. Annotate stays the tool.
      shellRef.current?.frame.annotation.discard();
      setStepUpdateInProgress(true);
    } else if (!sameEntry) {
      setStepUpdateInProgress(false);
    }

    selectedEntryBuildSnapshotRef.current = {
      fileRef,
      // A rewritten STEP is listed with no hash until it is built: the revision on screen stays the
      // last one, so the build that lands after the gap still reads as an update.
      stepHash: stepHash || (sameEntry ? previous.stepHash : "")
    };
  }, [
    resetSelectionForStepUpdate,
    selectedEntry
  ]);

  useEffect(() => {
    if (!stepUpdateInProgress) {
      return;
    }
    if (!selectedEntry) {
      setStepUpdateInProgress(false);
      return;
    }
    if (retainedPreviousStepMeshError) {
      setStepUpdateInProgress(false);
      return;
    }
    if (selectedMeshMatches && status !== ASSET_STATUS.LOADING) {
      setStepUpdateInProgress(false);
    }
  }, [retainedPreviousStepMeshError, selectedEntry, selectedMeshMatches, status, stepUpdateInProgress]);

  // An annotation lives in the mounted editor and nowhere else, and a routine belongs
  // to its file, so a file change always ends those sessions: neither Annotate nor
  // preview carries over onto another file.
  useEffect(() => {
    setViewerRuntimeAlert(null);
  }, [selectedKey]);

  // The render-artifact (re)build + freshness flow now lives entirely in useArtifact (see
  // selectedArtifact above): it GETs /__cad/artifact for freshness and POSTs to (re)build when
  // missing/stale, reporting ready | generating | error. The old build effect + step-source-status
  // fetch effect that this replaced have been removed.

  useEffect(() => {
    if (!shouldStartMeshLoad({
      inProgress: meshLoadInProgress,
      targetFile: meshLoadTargetFile,
      targetHash: meshLoadTargetHash,
      entryFile: fileKey(selectedEntry),
      entryHash: selectedMeshHash,
      selectedMeshMatches,
      isAssembly: isAssemblyView,
      interactionReady: selectedAssemblyInteractionReady,
      hydrationFailed: selectedAssemblyHydrationFailed,
      failedTargetFile: meshState?.file,
      failedTargetHash: meshState?.assemblyBackgroundErrorMeshHash,
      fatalFailure: fatalLoadFailure,
    })) {
      return;
    }
    loadMeshForEntry(selectedEntry).catch((err) => {
      setStatus(ASSET_STATUS.ERROR);
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [
    isAssemblyView,
    loadMeshForEntry,
    meshLoadInProgress,
    meshLoadTargetFile,
    meshLoadTargetHash,
    meshState?.file,
    meshState?.assemblyBackgroundErrorMeshHash,
    fatalLoadFailure,
    selectedAssemblyHydrationFailed,
    selectedAssemblyInteractionReady,
    selectedEntry,
    selectedMeshMatches
  ]);

  // A load that failed outright is not retried by itself (`shouldStartMeshLoad`), except once a
  // build of this same revision ends (`built`): a store that lost an object of the tree answers
  // 404 for the descriptor until the compile the status started restores it, at the same hashes,
  // so the entry does not move and the load above would otherwise wait for Reload.
  useEffect(() => {
    if (selectedArtifact.built) clearFatalLoadFailure();
  }, [selectedArtifact.built, clearFatalLoadFailure]);

  // Stable key over the expanded tree nodes whose topology should be loaded. An assembly's
  // reference state is COMPLETE when it was composed for exactly this expanded set; until it is,
  // the loader keeps loading (only the newly-needed components). A single part has no tree; its
  // loaded key is "*".
  const requestedTopologyKey = useMemo(() => (isAssemblyView
    ? requestedStepTreeTopologyNodeIds.slice().sort().join("|")
    : "*"), [isAssemblyView, requestedStepTreeTopologyNodeIds]);
  const requestedTopologyIdSet = useMemo(() => new Set(requestedStepTreeTopologyNodeIds), [requestedStepTreeTopologyNodeIds]);
  // Never another file or revision: a new hash invalidates what is loaded.
  const selectedReferencesCurrent =
    !!referenceState &&
    !!selectedEntry &&
    selectedEntryHasReferences &&
    referenceState.fileRef === fileKey(selectedEntry) &&
    referenceState.referenceHash === buildReferenceCacheKey(selectedEntry);
  const selectedReferencesComplete = selectedReferencesCurrent &&
    topologyCompositionKeyMatches(referenceState.loadedTopologyKey, requestedTopologyKey);
  // What is loaded stays pickable while more loads: an assembly composition serves the request
  // while every part it holds is still requested (`topologyCompositionServes`), and the bigger
  // composition replaces it when it lands.
  const selectedReferencesMatch = selectedReferencesCurrent &&
    topologyCompositionServes(referenceState, requestedTopologyKey, requestedTopologyIdSet);
  const selectedSelectorRuntime = selectedReferencesMatch ? referenceState?.selectorRuntime || null : null;
  // The parts whose faces and edges the live composition holds.
  const selectedTopologyLoadedIdSet = useMemo(() => (
    selectedReferencesMatch && Array.isArray(referenceState?.loadedTopologyIds)
      ? new Set(referenceState.loadedTopologyIds)
      : selectedReferencesMatch ? requestedTopologyIdSet : EMPTY_ID_SET
  ), [selectedReferencesMatch, referenceState, requestedTopologyIdSet]);
  // A step module resolves its selectors only once all of its own parts are in.
  const selectedStepModuleSelectorRuntime = selectedReferencesComplete || (
    isAssemblyView && stepModuleTopologyOccurrenceIds(selectedStepModuleDefinition)
      .every((id) => !requestedTopologyIdSet.has(id) || selectedTopologyLoadedIdSet.has(id))
  ) ? selectedSelectorRuntime : null;
  const artifactRevision = buildReferenceCacheKey(selectedEntry);

  // The selection filter is the person's for as long as the file is open: another file starts with
  // every kind ticked, an update of this one keeps it (its tree is shaped by it again below,
  // `changeSelectFilter`).
  useEffect(() => {
    setSelectFilter(STEP_SELECT_DEFAULT);
  }, [selectedKey]);
  // The pose runtime combines the sidecar definition with the Position values.
  const selectedStepParameterRuntime = useMemo(() => {
    if (
      !selectedStepModuleDefinition ||
      (selectedStepModuleTopologyRequired && !selectedStepModuleSelectorRuntime)
    ) {
      return null;
    }
    return {
      definition: selectedStepModuleDefinition,
      parameterValues: normalizeStepModuleParameterValues(selectedStepModuleDefinition, stepModuleParameterValues),
      selectorRuntime: selectedStepModuleSelectorRuntime,
      cadPath: selectedStepModuleDefinition.cadPath || stepMotionSources(selectedEntry).cadPath,
      sourceUrl: selectedStepModuleUrl
    };
  }, [
    selectedEntry,
    selectedStepModuleSelectorRuntime,
    selectedStepModuleDefinition,
    selectedStepModuleTopologyRequired,
    selectedStepModuleUrl,
    stepModuleParameterValues
  ]);
  // Preview's own pose and routine, on its own scene (`StepPreviewLayers`): the model at rest each
  // time Preview opens, moved and played by Preview's Position and Animation sections — the
  // tools view's are never touched.
  const previewMotion = useStepPreviewMotion({ definition: selectedStepModuleDefinition, clips: motion.clips,
    meshPartial: selectedMeshPartial, open: previewing });
  const selectedStepPartRootActive = !isAssemblyView && pickExpandedStepTreeNodeIds.includes(STEP_MODEL_ROOT_ID);
  const plainStepReferencePickingEnabled = selectedEntryHasReferences && !isAssemblyView;
  const plainStepReferencePickingRequested =
    plainStepReferencePickingEnabled &&
    (selectedStepPartRootActive || selectedStepModuleTopologyRequired);
  const assemblyStepTreeTopologyLoadingEnabled =
    selectedEntryHasReferences &&
    isAssemblyView &&
    requestedStepTreeTopologyNodeIds.length > 0;
  const selectedTopologyExplicitlyEnabled = largeFileState.selectableTopologyEnabled === true;
  const selectedTopologyLargeByCost = Boolean(
    isLargeStepGlbEntry(selectedEntry) ||
    (selectedMeshMatches && isLargeMeshData(selectedMeshData))
  );
  const selectedTopologyWaitingForMeshCost = Boolean(
    plainStepReferencePickingRequested &&
    !hasStepGlbByteCost(selectedEntry) &&
    !selectedMeshMatches
  );
  const referenceLoadingExplicitlyRequested = selectedStepPartRootActive || selectedStepModuleTopologyRequired;
  const selectedTopologyDeferredByCost = Boolean(
    plainStepReferencePickingRequested &&
    selectedTopologyLargeByCost &&
    !selectedTopologyExplicitlyEnabled &&
    !referenceLoadingExplicitlyRequested
  );
  const topLevelReferenceSelectionActive =
    selectedStepPartRootActive ||
    plainStepReferencePickingRequested;
  const referenceLoadingEnabled =
    (
      selectedStepPartRootActive ||
      assemblyStepTreeTopologyLoadingEnabled ||
      (
        plainStepReferencePickingRequested &&
        !selectedTopologyDeferredByCost &&
        !selectedTopologyWaitingForMeshCost
      )
    );

  useEffect(() => {
    if (!selectedEntry) {
      cancelReferenceLoad();
      return;
    }
    if (!selectedEntryHasReferences) {
      cancelReferenceLoad();
      setReferenceState(null);
      setReferenceStatus(REFERENCE_STATUS.DISABLED);
      setReferenceError("");
      return;
    }
    if (!referenceLoadingEnabled) {
      cancelReferenceLoad();
      setReferenceState(null);
      setReferenceStatus(REFERENCE_STATUS.IDLE);
      setReferenceError("");
      return;
    }
    // Complete: nothing to load — but an assembly's loader still hears the request, so a batch
    // in flight for parts no longer wanted is not published over it. The loader unions requests
    // and never cancels its own work for them (useCadAssets' loadReferencesForEntry).
    if (selectedReferencesComplete && !isAssemblyView) {
      return;
    }
    loadReferencesForEntry(selectedEntry, requestedStepTreeTopologyNodeIds).catch((err) => {
      setReferenceStatus(REFERENCE_STATUS.ERROR);
      setReferenceError(err instanceof Error ? err.message : String(err));
    });
  }, [
    cancelReferenceLoad,
    isAssemblyView,
    loadReferencesForEntry,
    referenceLoadingEnabled,
    rendering,
    requestedStepTreeTopologyNodeIds,
    selectedEntry,
    selectedEntryHasReferences,
    selectedReferencesComplete
  ]);

  const {
    currentReferences,
    activeReferenceMap,
    selectedReferences,
    selectedParts
  } = useCadWorkspaceSelectors({
    selectedReferencesMatch,
    referenceState,
    supportsPartSelection,
    assemblyParts,
    assemblyPartMap,
    selectedReferenceIds,
    selectedPartIds
  });

  // The Reference pane shows every selected element: topology references
  // (faces/edges/shapes) plus selected components and subassemblies.
  const selectedReferenceItems = useMemo(
    () => [...(selectedReferences || []), ...(selectedParts || [])],
    [selectedReferences, selectedParts]
  );

  useCadWorkspaceSelection({
    supportsPartSelection,
    assemblyPartsLoaded,
    setSelectedReferenceIds,
    setHoveredModelReferenceId,
    assemblyParts,
    validAssemblyPartIds: validAssemblySelectionIds,
    validHiddenPartIds: validAssemblyLeafIds,
    setSelectedPartIds,
    parseAssemblyPartReferenceSelectionId,
    setHiddenPartIds,
    setHoveredListPartId,
    setHoveredModelPartId
  });

  useEffect(() => {
    // A tree still on its way keeps what is expanded: a restored expansion waits for the tree it
    // names, and is reduced to the nodes that tree has — or dropped — once it arrives.
    const rootId = String(stepTreeRoot?.id || "").trim();
    if (!rootId) return;
    const validIds = new Set(validAssemblySelectionIds);
    setExpandedStepTreeNodeIds((current) => {
      const filtered = current.filter((id) => validIds.has(id));
      return orderedStringListEqual(filtered, current) ? current : filtered;
    });
  }, [selectedKey, stepTreeRoot, validAssemblySelectionIds]);

  const isFaceReference = useCallback((reference) => (
    String(reference?.selectorType || "").trim() === "face"
  ), []);
  const isEdgeReference = useCallback((reference) => (
    String(reference?.selectorType || "").trim() === "edge"
  ), []);
  const isViewerTopologyReference = useCallback((reference) => (
    isFaceReference(reference) || isEdgeReference(reference)
  ), [isEdgeReference, isFaceReference]);
  const isStepTopologyReference = useCallback((reference) => {
    const selectorType = String(reference?.selectorType || "").trim();
    return selectorType === "occurrence" ||
      selectorType === "shape" ||
      selectorType === "face" ||
      selectorType === "edge" ||
      selectorType === "vertex";
  }, []);
  const referencePartId = useCallback((reference) => {
    const explicitPartId = String(reference?.partId || "").trim();
    if (explicitPartId) {
      return explicitPartId;
    }
    if (!isAssemblyView && reference?.selectorType === "occurrence") return STEP_MODEL_ROOT_ID;
    return parseAssemblyPartReferenceSelectionId(reference?.id)?.partId || "";
  }, [isAssemblyView]);

  const assemblyStepTreeTopologyReferences = useMemo(() => {
    if (!isAssemblyView || !selectedReferencesMatch) {
      return [];
    }
    return assignStepTreeTopologyReferencePartIds(stepTreeRoot, currentReferences);
  }, [
    currentReferences,
    isAssemblyView,
    selectedReferencesMatch,
    stepTreeRoot
  ]);
  const focusedAssemblyRenderPartIds = useMemo(() => {
    if (!isAssemblyView || !focusedAssemblyNodeIds.length) {
      return [];
    }
    return uniqueStringList(
      focusedAssemblyNodeIds
        .flatMap((nodeId) => [
          nodeId,
          ...renderPartIdsForAssemblySelection(nodeId)
        ])
        .map((partId) => String(partId || "").trim())
        .filter(Boolean)
    );
  }, [
    focusedAssemblyNodeIds,
    isAssemblyView,
    renderPartIdsForAssemblySelection
  ]);
  const focusedAssemblyPartReferences = useMemo(() => {
    if (!isAssemblyView || !focusedAssemblyRenderPartIds.length) {
      return [];
    }
    const focusedPartIdSet = new Set(focusedAssemblyRenderPartIds);
    return assemblyStepTreeTopologyReferences.filter((reference) => (
      focusedPartIdSet.has(referencePartId(reference)) &&
      isStepTopologyReference(reference)
    ));
  }, [
    assemblyStepTreeTopologyReferences,
    focusedAssemblyRenderPartIds,
    isAssemblyView,
    isStepTopologyReference,
    referencePartId
  ]);
  const effectiveVisibleReferences = useMemo(() => {
    if (isAssemblyView && focusedAssemblyTopologyActive) {
      return focusedAssemblyPartReferences;
    }
    return currentReferences;
  }, [
    currentReferences,
    focusedAssemblyPartReferences,
    focusedAssemblyTopologyActive,
    isAssemblyView
  ]);
  const stepTreeTopologyReferences = useMemo(() => {
    if (isAssemblyView) {
      return requestedStepTreeTopologyNodeIds.length
        ? assemblyStepTreeTopologyReferences
        : [];
    }
    return currentReferences;
  }, [
    assemblyStepTreeTopologyReferences,
    currentReferences,
    isAssemblyView,
    requestedStepTreeTopologyNodeIds
  ]);
  const displayStepTreeRoot = useMemo(() => buildStepTreeRootWithTopology({
    root: stepTreeRoot,
    references: stepTreeTopologyReferences,
    fallbackPartId: isAssemblyView ? "" : STEP_MODEL_ROOT_ID,
    topologyPartIds: isAssemblyView ? requestedStepTreeTopologyNodeIds : null
  }), [
    isAssemblyView,
    requestedStepTreeTopologyNodeIds,
    stepTreeRoot,
    stepTreeTopologyReferences
  ]);
  const topologyTarget = useMemo(() => {
    if (!isAssemblyView) return { id: STEP_MODEL_ROOT_ID, partId: "", label: selectedEntry?.name || selectedEntry?.label || "Model" };
    const ids = uniqueStringList([...selectedPartIds, ...selectedReferences.map(referencePartId)]);
    if (ids.length !== 1 || !loadableStepTreeTopologyNodeIdSet.has(ids[0])) return null;
    const node = copyableStepTreeNodeForWorkspace({ assemblyPartMap, displayStepTreeRoot, stepTreeRoot, nodeId: ids[0] });
    return { id: ids[0], partId: ids[0], label: node?.displayName || node?.name || ids[0] };
  }, [isAssemblyView, selectedEntry, selectedPartIds, selectedReferences, referencePartId, loadableStepTreeTopologyNodeIdSet, assemblyPartMap, displayStepTreeRoot, stepTreeRoot]);
  const isolatedStepTreeSelectableNodeIds = useMemo(() => {
    if (!isAssemblyView || !focusedAssemblyNodeIds.length) {
      return null;
    }
    const treeRootForIsolation = displayStepTreeRoot || stepTreeRoot;
    return uniqueStringList(
      focusedAssemblyNodeIds.flatMap((nodeId) => collectStepTreeSubtreeIds(treeRootForIsolation, nodeId))
    );
  }, [
    displayStepTreeRoot,
    focusedAssemblyNodeIds,
    isAssemblyView,
    stepTreeRoot
  ]);
  const stepTreeCopyReferenceMap = useMemo(
    () => buildStepTreeCopyReferenceMap(displayStepTreeRoot),
    [displayStepTreeRoot]
  );
  const effectiveSelectorRuntime = retainingPreviousStepMesh ? null : selectedSelectorRuntime;

  const effectiveActiveReferenceMap = useMemo(() => {
    const map = new Map(activeReferenceMap);
    for (const reference of Array.from(map.values())) {
      addReferenceLookupKeys(map, reference);
    }
    for (const reference of effectiveVisibleReferences) {
      addReferenceLookupKeys(map, reference);
    }
    return map;
  }, [activeReferenceMap, effectiveVisibleReferences]);

  const renderPartIdsForWholeTopologyReference = useCallback((referenceId) => {
    const normalizedReferenceId = String(referenceId || "").trim();
    if (!normalizedReferenceId) {
      return [];
    }
    const reference = effectiveActiveReferenceMap.get(normalizedReferenceId);
    const selectorType = String(reference?.selectorType || "").trim();
    if (selectorType !== "occurrence" && selectorType !== "shape") {
      return [];
    }
    const partId = referencePartId(reference);
    if (isAssemblyView) {
      return partId ? renderPartIdsForAssemblySelection(partId) : [];
    }
    const renderPartId = partId && partId !== STEP_MODEL_ROOT_ID
      ? partId
      : STEP_MODEL_RENDER_PART_ID;
    return renderPartId ? [renderPartId] : [];
  }, [
    effectiveActiveReferenceMap,
    isAssemblyView,
    referencePartId,
    renderPartIdsForAssemblySelection
  ]);

  const viewerPickableReferences = useMemo(() => {
    if (stepInteractionBlocked) {
      return [];
    }
    if (isAssemblyView) return referencesForExpandedStepTree(
      assemblyStepTreeTopologyReferences, expandedStepTreeTopologyNodeIds, referencePartId
    );
    return pickExpandedStepTreeNodeIds.includes(STEP_MODEL_ROOT_ID) ? effectiveVisibleReferences : [];
  }, [
    assemblyStepTreeTopologyReferences,
    effectiveVisibleReferences,
    expandedStepTreeTopologyNodeIds,
    pickExpandedStepTreeNodeIds,
    referencePartId,
    isAssemblyView,
    stepInteractionBlocked,
  ]);
  // The parts whose faces and edges can be picked right now.
  const pickableTopologyPartIds = useMemo(() => new Set(viewerPickableReferences.map(referencePartId)),
    [viewerPickableReferences, referencePartId]);
  // Collapsing a part (including isolation exit) removes its exact topology.
  // Drop those selections too, rather than leaving invisible IDs in Copy/shortcuts.
  useEffect(() => {
    if (viewerLoading || stepInteractionBlocked || !stepTreeRoot || !selectedReferenceIds.length) return;
    const expandedOwners = new Set(expandedStepTreeTopologyNodeIds);
    const next = selectedReferenceIds.filter(id => {
      const partId = parseAssemblyPartReferenceSelectionId(id)?.partId;
      const owners = partId ? [isAssemblyView ? partId : STEP_MODEL_ROOT_ID]
        : stepTreeTopologyOwnersForSelectors(stepTreeRoot, [id], { isAssemblyView });
      return owners.every(owner => expandedOwners.has(owner));
    });
    if (next.length === selectedReferenceIds.length) return;
    setSelectedReferenceIds(next);
  }, [viewerLoading, stepInteractionBlocked, stepTreeRoot, selectedReferenceIds,
    expandedStepTreeTopologyNodeIds, isAssemblyView]);

  const viewerPickableFaces = useMemo(
    () => viewerPickableReferences.filter((reference) => isFaceReference(reference)),
    [isFaceReference, viewerPickableReferences]
  );
  const viewerPickableEdges = useMemo(
    () => viewerPickableReferences.filter((reference) => isEdgeReference(reference)),
    [isEdgeReference, viewerPickableReferences]
  );
  const hasViewerPickableTopology = Boolean(viewerPickableFaces.length || viewerPickableEdges.length);
  // Measuring needs a mesh to hit. Topology, when loaded, upgrades STEP hits
  // from free points to edge and face snaps.
  const measureModeActive = tabToolMode === TAB_TOOL_MODE.MEASURE &&
    Boolean(selectedMeshData) &&
    !stepInteractionBlocked &&
    !viewerLoading;
  const measure = useMeasureSession({ fileKey: selectedKey, revision: selectedEntry?.hash, picking: measureModeActive });
  const measureMeasurements = measure.measurements;

  const filteredViewerReferences = useMemo(() => filterSelectionReferences(viewerPickableReferences, selectFilter),
    [viewerPickableReferences, selectFilter]);
  const filteredViewerFaces = useMemo(() => filteredViewerReferences.filter(isFaceReference), [filteredViewerReferences, isFaceReference]);
  const filteredViewerEdges = useMemo(() => filteredViewerReferences.filter(isEdgeReference), [filteredViewerReferences, isEdgeReference]);
  // What the tool in hand may pick: Measure what its filter ticks, every face where Faces is and
  // every edge where Edges or Vertices is (a vertex is an edge's end, `useStepPicking.js`), whatever
  // Select's filter says; Select what the selection filter allows.
  const measurableFaces = useMemo(() => (measureFilter.includes("face") ? viewerPickableReferences.filter(isFaceReference) : EMPTY_LIST),
    [measureFilter, viewerPickableReferences, isFaceReference]);
  const measurableEdges = useMemo(() => (measureFilter.includes("edge") || measureFilter.includes("vertex")
    ? viewerPickableReferences.filter(isEdgeReference) : EMPTY_LIST), [measureFilter, viewerPickableReferences, isEdgeReference]);
  const viewerPickableFacesForTool = measureModeActive ? measurableFaces : filteredViewerFaces;
  const viewerPickableEdgesForTool = measureModeActive ? measurableEdges : filteredViewerEdges;
  const measureToolDisabled = viewerLoading || !selectedMeshData;
  const topologySelectionActive =
    (isAssemblyView && requestedStepTreeTopologyNodeIds.length > 0) ||
    topLevelReferenceSelectionActive;
  const referenceSelectionUnavailable = (
    selectedEntryHasReferences &&
    topologySelectionActive &&
    !viewerInAssemblyMode &&
    !selectedTopologyDeferredByCost &&
    (
      referenceStatus === REFERENCE_STATUS.DISABLED ||
      referenceStatus === REFERENCE_STATUS.ERROR ||
      (
        referenceStatus === REFERENCE_STATUS.READY &&
        !!effectiveSelectorRuntime &&
        !hasViewerPickableTopology
      )
    )
  );
  const referenceSelectionPending = (
    selectedEntryHasReferences &&
    topologySelectionActive &&
    !viewerInAssemblyMode &&
    !selectedTopologyDeferredByCost &&
    !referenceSelectionUnavailable &&
    !retainedPreviousStepMeshError &&
    (
      stepInteractionBlocked ||
      referenceStatus === REFERENCE_STATUS.IDLE ||
      // Loading more of an assembly leaves what is loaded selectable: only a missing runtime waits
      // (a load with nothing usable yet has none).
      !effectiveSelectorRuntime
    )
  );
  const promptResource = useMemo(() => ({ ...documentResource,
    revision: String(selectedEntry?.documentHash || selectedEntry?.hash || documentResource.revision || '')
  }), [documentResource, selectedEntry?.documentHash, selectedEntry?.hash]);
  // Rebuilds keep the previous same-file mesh visible until its replacement is
  // ready. Observe that mesh's document revision while interaction is blocked.
  const displayedResourceRef = useRef(promptResource);
  if (!retainingPreviousStepMesh) displayedResourceRef.current = promptResource;
  const viewportAnimation = motion.animationControls;
  // The routine owns the tools view's model while its frame is on it, playing or kept (the
  // Animation section's); a kept frame, paused past its start, is what a prompt's view records.
  const animationOwnsPose = animationControlsHaveContent(viewportAnimation) && viewportAnimation?.enabled !== false;
  const animationKept = animationOwnsPose && viewportAnimation?.playing !== true && Number(viewportAnimation?.elapsedSec) > 0;

  // Pose: drag the joints by their handles. Present only where something can be
  // driven (a STEP's mate DOFs). The handles are rebuilt from the pose on screen,
  // so sliders, presets, Reset and a handle up the chain all carry them along.
  const stepPoseDefinition = selectedStepModuleDefinition;
  const poseAvailable = stepPosableDofs(stepPoseDefinition).length > 0;
  // Its knobs are Select's, while Select picks Position.
  const positionShown = poseAvailable && tabToolMode === TAB_TOOL_MODE.REFERENCES && selects(selectFilter, "position");

  const shellRef = useRef(null);
  // The two things only a STEP can answer about its viewport. Both read the live runtime's own
  // scene graph, so neither can live on the kit's handle: the LOD sampler reports projection
  // parameters and nearest eligible occurrence distances (numeric samples retain no scene
  // objects), and the selection's bounds are the boxes of its references AS POSED merged with
  // the boxes of its parts as they sit on screen, explosion included.
  const zoomToFitSelection = useCallback(({ partIds = [], referenceIds = [], animate = true } = {}) => {
    const runtime = runtimeRefRef.current?.current;
    const bounds = mergeBoundsList([
      selectorReferenceBounds(layersApiRef.current?.activeSelectorRuntime, referenceIds),
      displayRecordBoundsForPartIds(runtime, partIds)
    ]);
    return bounds ? Boolean(viewerRef.current?.zoomToBounds(bounds, { animate })) : false;
  }, []);

  // ---- what the viewport is, before the shell mounts one ------------------------------------
  // The STEP scene is one object for as long as this file is open; what is INSIDE it changes in
  // place. The viewport is handed a view of it only once there is geometry to look at.
  const keepsAuthoredFinish = useMemo(() => hasAuthoredMaterials(selectedDisplayMeshData), [selectedDisplayMeshData]);
  const sceneView = useMemo(() => stepSceneView(stepScene, keepsAuthoredFinish), [stepScene, keepsAuthoredFinish]);
  const viewportIsLoading = viewerLoading && !retainingPreviousStepMesh;
  const viewportScene = !viewportIsLoading && hasMeshGeometry(selectedDisplayMeshData) ? sceneView : null;
  // The WebGL runtime under the scene. A scene owns GPU-backed work the LOD publisher is counting
  // on, so every way a runtime can go away is named to it exactly once — and this is that place.
  const meshSourceAdoptionRef = useRef(onMeshSourceAdoption);
  meshSourceAdoptionRef.current = onMeshSourceAdoption;
  const stepRuntimeLifecycle = useMemo(() => ({
    onRelease(runtime, { handoff }) {
      const source = releaseStepRuntime(runtime, stepScene);
      meshSourceAdoptionRef.current?.(source, false, { disposed: true, terminal: !handoff, handoff });
    },
    onContextLost() { meshSourceAdoptionRef.current?.(null, false); },
    // A replacement runtime that cannot initialize has no future scene that can finish an
    // in-flight LOD handoff.
    onInitializationError() { meshSourceAdoptionRef.current?.(null, false, { disposed: true, terminal: true }); }
  }), [stepScene]);
  const viewPolicy = { wireframeMode: viewDrawsHairlines(resolvedThemeSettings, resolvedScene.display), edgesVisible: false };

  // ---- the live surface, the prompt and Escape, as stable seams -------------------------------
  // Each of these is answered from further down this function, where the selection, the tree and
  // the menus are. They are bound through refs so the shell sees one unchanging set of commands,
  // and every one of them reads the view as it stands when it is CALLED.
  const stepLiveStateRef = useRef(() => ({}));
  const stepLiveCommandsRef = useRef({});
  const stepLiveCommands = useMemo(() => Object.fromEntries(
    ["select", "clearSelection"].map(name => [name, (...args) => stepLiveCommandsRef.current[name]?.(...args)])
  ), []);
  const promptReferencesRef = useRef(() => EMPTY_LIST);
  // The ink drawn on a face, as shapes on it in the part's units, for what goes to the agent (`faceShapes.js`).
  const faceMarksRef = useRef(() => "");
  // A face by the feature that made it (`edit/faceChips.js`'s `faceChipName`), where that is known of the faces on screen: set
  // where edit mode's state is read, below, and asked when a reference is named.
  const faceNameRef = useRef(() => null);
  const escapeRef = useRef(() => false);
  // A double-click on a face in the workspace, taken by the feature that made it where that is known (set
  // below, where edit mode is read): true when it was.
  const faceDoubleRef = useRef(() => false);
  // A right-click on a face in the workspace: what its feature offers first (set below, where edit mode is read).
  const faceMenuRef = useRef(() => []);
  // A modeling command's dialog open (edit mode's, set below where it is read): Escape cancels it, as
  // SolidWorks' Esc cancels the PropertyManager open.
  const [commandHeld, setCommandHeld] = useState(false);
  // Escape has something to do here whenever there is a selection to clear, a tool other than
  // Select in hand, or a command open.
  const escapeActive = selectedPartIds.length > 0 || selectedReferenceIds.length > 0 || focusedAssemblyNodeIds.length > 0
    || tabToolMode !== TAB_TOOL_MODE.REFERENCES || measure.selected.length > 0 || commandHeld;


  // ---- the shell --------------------------------------------------------------------------
  // Everything this renderer needs from its host that is not about its scene. It is called
  // HERE, in the middle of this function, and not at the top: the hook needs a load report,
  // and what this renderer's load IS depends on the resolved view above it. Nothing about
  // hook order says otherwise — there is one function, and no early return in it.
  // Measure's results, as Quick Edit's chips and the marks a note's views are drawn with.
  const shell = useRendererShell({
    previewable: true, preview,
    view, services, resource: promptResource, modelKey: selectedKey, revisionKey: presentationRevisionKey,
    features: viewFeatures, toolModes: CAD_TOOL_MODES, tool: { mode: tabToolMode, set: setTabToolMode },
    scene: viewportScene,
    viewSettings: { display: displaySettings, scene: desiredScene, store: viewSettingsStore, applied: viewUpdate },
    viewerRef,
    load: {
      // `busy` is the shell's "nothing to show yet", and the viewport DETACHES the scene while
      // it is true. So it is exactly the gate the old STEP viewport kept: loading, and not
      // holding the previous revision on screen. A model arriving in pieces, a rebuild behind a
      // retained mesh and an artifact still generating all have something to show — they are
      // `updating`, which keeps the chip saying so without taking the model off the screen.
      busy: viewportIsLoading,
      updating: !viewportIsLoading && (effectiveViewerLoading || selectedMeshPartial),
      progress: selectedLoadProgress || (editingPreview.state.phase ? { phase: editingPreview.state.phase, detail: editingPreview.state.detail } : null),
      alert: viewerAlert || (!selectedMeshData && catalogError ? catalogError : null) || annotationAlert,
      editPending: editingBuildActive(editingPreview.state),
      finding: !catalogHydrated
    },
    // The routines, which the shell plays in preview.
    animation: viewportAnimation,
    live: {
      commands: stepLiveCommands,
      // What the viewport is SHOWING, which is not always what is loading: a rebuild that
      // keeps its predecessor on screen reports the predecessor's revision.
      resource: () => displayedResourceRef.current,
      state: () => stepLiveStateRef.current()
    },
    promptReferences: () => promptReferencesRef.current(),
    promptContext: createCadPromptContext,
    marks: items => faceMarksRef.current(items),
    // A prompt's view: the one motion on screen — the pose Position holds off its default, or the
    // routine's kept frame (Explode is the view settings') — the parts hidden, and those isolated
    // (a snapshot ghosts the rest, as isolation dims it).
    viewState: () => ({
      kinematics: !animationOwnsPose && !positionValuesAreDefault(stepModuleParameterValues,
        selectedStepModuleDefinition?.defaultParameterValues) ? stepModuleParameterValues : null,
      animation: animationKept ? { clip: viewportAnimation.activeClipId, time: Number(viewportAnimation.elapsedSec) } : null,
      hide: hiddenPartIds, focus: isolatedAssemblyNodeIds
    }),
    escape: { active: escapeActive, handle: () => escapeRef.current() },
    rendererState: session.rendererState,
    onCameraSettled: () => onLodCameraMoved(),
    // Delete takes the measurements Select picked, beside the annotations the shell deletes.
    deleteSelection: measure.removeSelected,
    preserveInteractionPixelRatio: viewPolicy.wireframeMode || viewPolicy.edgesVisible,
    runtimeLifecycle: stepRuntimeLifecycle,
    onRuntimeAlert: handleViewerAlertChange,
  });
  // A measurement taken, deleted or cleared is a step of the view's one history, with the ink's.
  measure.history.current = shell.frame.history;
  shellRef.current = shell;
  const reportActionError = shell.reportActionError;

  // Explode or Clip set — Explode's amount taken off zero, Clip turned on, never merely its tool
  // taken up — puts the pose back at its default, the routine at rest and the other one off. Only a
  // change on this file is setting it: another file opening exploded or cut is that file's view.
  const exploded = desiredScene.view.exploded;
  const explodeApplied = Boolean(exploded?.enabled && exploded.amount > 0);
  explodeAppliedRef.current = explodeApplied;
  const clipApplied = Boolean(desiredScene.view.clip?.enabled);
  clipAppliedRef.current = clipApplied;
  const viewMotionSeen = useRef({ file: selectedKey, explode: explodeApplied, clip: clipApplied });
  const resetMotion = motion.resetMotion;
  useEffect(() => {
    const seen = viewMotionSeen.current;
    viewMotionSeen.current = { file: selectedKey, explode: explodeApplied, clip: clipApplied };
    if (seen.file !== selectedKey) return;
    const explodeSet = explodeApplied && !seen.explode, clipSet = clipApplied && !seen.clip;
    if (!explodeSet && !clipSet) return;
    resetMotion();
    if (explodeSet && clipApplied) viewSettingsStore.patch({ clip: { enabled: false, axis: "x", invert: false } });
    else if (clipSet && explodeApplied) viewSettingsStore.patch({ exploded: { enabled: false, amount: 0 } });
  }, [explodeApplied, clipApplied, selectedKey, resetMotion, viewSettingsStore]);
  const selectedWholeTopologyReferencePartIds = useMemo(() => (
    uniqueStringList(
      selectedReferenceIds.flatMap((referenceId) => renderPartIdsForWholeTopologyReference(referenceId))
    )
  ), [
    renderPartIdsForWholeTopologyReference,
    selectedReferenceIds
  ]);
  const viewerSelectedPartIds = useMemo(() => {
    if (!isAssemblyView) {
      return uniqueStringList([
        ...(selectedPartIds.includes(STEP_MODEL_ROOT_ID) ? [STEP_MODEL_RENDER_PART_ID] : []),
        ...selectedWholeTopologyReferencePartIds,
      ]);
    }
    return uniqueStringList(
      [
        ...selectedPartIds.flatMap((id) => {
          const normalizedId = String(id || "").trim();
          return renderPartIdsForAssemblySelection(
            normalizedId,
            selectedRenderPartIdByAssemblyPartId[normalizedId]
          );
        }),
        ...selectedWholeTopologyReferencePartIds
      ]
    );
  }, [
    focusedAssemblyNodeIds,
    isAssemblyView,
    renderPartIdsForAssemblySelection,
    selectedPartIds,
    selectedRenderPartIdByAssemblyPartId,
    selectedWholeTopologyReferencePartIds
  ]);
  // What the viewport draws as hovered, from the hover store's snapshot: the parts to light
  // and the reference to outline. The viewport's layers call it with each hover change
  // (`scene/StepSceneLayers.jsx`); it changes identity only with what it resolves THROUGH —
  // the menu that marks a part while it is up, the assembly's part mapping, preview.
  const resolveViewerHover = useCallback((hover) => {
    const hoveredModelReferenceId = hover.modelReferenceId;
    const hoveredListPartId = hover.listPartId;
    const hoveredModelPartId = hover.modelPartId;
    const hoveredReferenceId = hoveredModelReferenceId || "";
    const hoveredPartId = hoveredListPartId || hoveredModelPartId || "";
    const hoveredWholeTopologyReferencePartIds = uniqueStringList(renderPartIdsForWholeTopologyReference(hoveredModelReferenceId));
    const viewerHoveredPartIds = (() => {
      const contextMenuNodeId = String(viewerContextMenu?.nodeId || "").trim();
      if (isAssemblyView && contextMenuNodeId) {
        const contextRenderPartId = String(viewerContextMenu?.renderPartId || "").trim();
        const highlightedPartIds = renderPartIdsForAssemblySelection(contextMenuNodeId, contextRenderPartId);
        return highlightedPartIds.length ? highlightedPartIds : contextMenuNodeId;
      }
      if (hoveredWholeTopologyReferencePartIds.length) {
        return hoveredWholeTopologyReferencePartIds;
      }
      if (!isAssemblyView || !hoveredPartId) {
        return hoveredPartId;
      }
      const normalizedTreeHoveredPartId = String(hoveredListPartId || "").trim();
      if (normalizedTreeHoveredPartId) {
        const highlightedPartIds = renderPartIdsForAssemblySelection(normalizedTreeHoveredPartId);
        return highlightedPartIds.length ? highlightedPartIds : normalizedTreeHoveredPartId;
      }
      const normalizedHoveredPartId = String(hoveredModelPartId || hoveredPartId || "").trim();
      const hoveredSelectionId = resolvePickedAssemblyPartId(normalizedHoveredPartId);
      const highlightedPartIds = renderPartIdsForAssemblySelection(hoveredSelectionId, normalizedHoveredPartId);
      return highlightedPartIds.length ? highlightedPartIds : hoveredPartId;
    })();
    const effectiveHoveredReferenceId = String(viewerContextMenu?.referenceId || "").trim() || hoveredReferenceId;
    return {
      hoveredPartId: viewerHoveredPartIds,
      hoveredReferenceId: !retainingPreviousStepMesh ? effectiveHoveredReferenceId : ""
    };
  }, [
    isAssemblyView,
    renderPartIdsForAssemblySelection,
    renderPartIdsForWholeTopologyReference,
    resolvePickedAssemblyPartId,
    retainingPreviousStepMesh,
    viewerContextMenu
  ]);
  const viewerAssemblyRenderParts = useMemo(() => {
    if (!isAssemblyView || !selectedAssemblyInteractionReady) {
      return EMPTY_LIST;
    }
    return assemblyLeafParts;
  }, [
    assemblyLeafParts,
    isAssemblyView,
    selectedAssemblyInteractionReady
  ]);

  // What the references resolve through when they are copied (`file-view/stepCopy.js`).
  const copyContext = useMemo(() => ({
    entry: selectedEntry, isAssemblyView, copyReferenceMap: stepTreeCopyReferenceMap, referenceMap: effectiveActiveReferenceMap,
    assemblyPartMap, displayRoot: displayStepTreeRoot, root: stepTreeRoot
  }), [assemblyPartMap, displayStepTreeRoot, effectiveActiveReferenceMap, isAssemblyView, selectedEntry, stepTreeCopyReferenceMap, stepTreeRoot]);
  const copySelectionPayload = useMemo(
    () => selectionCopyPayload(copyContext, { referenceIds: selectedReferenceIds, partIds: selectedPartIds }),
    [copyContext, selectedPartIds, selectedReferenceIds]
  );
  // Every copied line funnels through `copyTextLines`, here and in every other copy path below, so
  // the file prefix is applied at one point rather than threaded through each builder.
  const fileRefPrefix = selectedEntry?.fileRefPrefix || "";
  const canonicalCopySelectionLines = useMemo(
    () => copyTextLines(copySelectionPayload.lines, fileRefPrefix),
    [copySelectionPayload.lines, fileRefPrefix]
  );
  const copySelectedReferences = useCallback(async () => {
    const text = canonicalCopySelectionLines.join("\n");
    if (!text || stepInteractionBlocked) return false;
    try { await host.clipboard.writeText(text); return true; }
    catch (error) { shellRef.current?.reportActionError(error instanceof Error ? error.message : "Could not copy reference"); return false; }
  }, [canonicalCopySelectionLines, stepInteractionBlocked, host.clipboard]);
  // What Annotate's ink touches at a point of the view: the part, with the face and the edge under
  // it as prompt references, as copying a selection of them writes them.
  const inkTouches = useCallback((clientX, clientY) => {
    const found = topologyAtRef.current?.(clientX, clientY);
    if (!found?.part) return [];
    const refOf = id => (id ? copyTextLines(selectionCopyPayload(copyContext, { referenceIds: [id], partIds: [] }).lines, fileRefPrefix)[0] || "" : "");
    const touches = [found.face, found.edge].map(refOf).filter(Boolean).map(ref => ({ part: found.part, ref }));
    return touches.length ? touches : [{ part: found.part }];
  }, [copyContext, fileRefPrefix]);
  // The tip teaches reference syntax, so it fires on the first pick that yields
  // a reference to copy — a component, a subassembly, or a face/edge. Gating it
  // on topology alone would hide it from anyone who only ever clicks parts.
  const expandStepTreeAroundNode = useCallback((nodeId, {
    expandSelf = false,
    includeVisualOnlyAncestors = true
  } = {}) => {
    const normalizedNodeId = String(nodeId || "").trim();
    const treeRootForExpansion = displayStepTreeRoot || stepTreeRoot;
    if (!normalizedNodeId || !treeRootForExpansion) {
      return;
    }
    const idsToExpand = collectStepTreeRevealExpansionIds(treeRootForExpansion, normalizedNodeId, {
      expandSelf,
      includeVisualOnlyAncestors
    });
    if (!idsToExpand.length) {
      return;
    }
    setExpandedStepTreeNodeIds(current => idsToExpand.every(id => current.includes(id))
      ? current : uniqueStringList([...current, ...idsToExpand]));
  }, [displayStepTreeRoot, stepTreeRoot]);

  const revealStepTreeNode = useCallback((nodeId, {
    expandSelf = false,
    expandAncestors = false,
    source = "viewer"
  } = {}) => {
    const normalizedNodeId = String(nodeId || "").trim();
    if (!normalizedNodeId) {
      return;
    }
    // The picked row is scrolled to in the model tree, which an assembly shows whenever Select is up.
    setActiveTreeNodeScrollKey(source === "viewer" || source === "reference" ? `${source}:${Date.now()}:${normalizedNodeId}` : "");
    if (expandAncestors || expandSelf || source === "reference") {
      expandStepTreeAroundNode(normalizedNodeId, { expandSelf });
    }
  }, [
    expandStepTreeAroundNode
  ]);

  const ensureSelectTool = useCallback(() => {
    if (shellRef.current?.toolMode !== TAB_TOOL_MODE.REFERENCES) shellRef.current?.selectTool(TAB_TOOL_MODE.REFERENCES);
  }, []);

  const toggleReferenceSelection = useCallback((referenceId, { multiSelect = false, source = "viewer" } = {}) => {
    if (stepInteractionBlocked) {
      return;
    }
    ensureSelectTool();
    if (source !== "viewer") {
      setActiveTreeNodeScrollKey("");
    }
    const normalizedReferenceId = String(referenceId || "").trim();
    const selectedReference = effectiveActiveReferenceMap.get(normalizedReferenceId);
    const selectedReferencePartId = referencePartId(selectedReference);
    const next = !multiSelect && selectedPartIdsRef.current.length
      ? (normalizedReferenceId ? [normalizedReferenceId] : [])
      : computeNextSelectionIds(selectedReferenceIdsRef.current, normalizedReferenceId, { multiSelect });
    if (!multiSelect && selectedPartIdsRef.current.length) {
      setSelectedPartIds([]);
      setSelectedRenderPartIdByAssemblyPartId({});
    }
    setSelectedReferenceIds(next);
    if (next.includes(normalizedReferenceId)) {
      const selectedReferenceTreeNodeId = findStepTreeTopologyNodeIdForReference(displayStepTreeRoot, normalizedReferenceId);
      revealStepTreeNode(selectedReferenceTreeNodeId || selectedReferencePartId, { source });
    }
  }, [
    displayStepTreeRoot,
    effectiveActiveReferenceMap,
    focusedAssemblyNodeIds,
    isAssemblyView,
    referencePartId,
    revealStepTreeNode,
    stepInteractionBlocked,
  ]);

  const clearReferenceSelection = useCallback(() => {
    setSelectedReferenceIds([]);
  }, []);

  // Copy is clipboard-only; what goes to the agent goes through Quick Edit.
  const deliverReferenceText = useCallback((text) => host.clipboard.writeText(text), [host.clipboard]);
  const referencesForHost = useCallback((text) =>
    referencesFromCopyText(text, fileKey(selectedEntry)).map((reference) => {
      const label = referenceLabel(reference.selector, displayStepTreeRoot || stepTreeRoot);
      return { ...reference, ...(label ? { label } : {}) };
    }), [selectedEntry, displayStepTreeRoot, stepTreeRoot]);
  // A reference into this file as the view names it, for its pill in Quick Edit's note, its kind's
  // glyph first: a part or subassembly by its tree name (the solid's, "cam"), a face, an edge or a
  // solid compactly, by its part and its number ("◧ cam 3"), several of one kind on one part counted
  // ("◧ cam ×4"). A face the engine says a feature made goes by that feature instead, as the Part
  // Navigator numbers it ("◧ Hole (6) 12": `faceNameRef`).
  // "" for one into another file, or one it has no name for.
  const nameReference = useCallback(reference => {
    if (reference?.resource?.path !== promptResource.path || reference.target?.kind !== "cad-selector") return "";
    const made = faceNameRef.current(reference);
    if (made) return made;
    const root = displayStepTreeRoot || stepTreeRoot;
    const KINDS = { f: "face", e: "edge", v: "vertex", s: "solid" };
    const named = reference.target.selectors.map(selector => {
      const own = referenceLabel(selector, root);
      const match = String(selector).match(/^(.+)\.([fevs])(\d+)$/);
      if (own) return { own, kind: match ? KINDS[match[2]] : "solid" };
      // A part file's one part has no node of its own in the tree: it goes by the file's name.
      const part = match ? referenceLabel(match[1], root) || (isAssemblyView ? "" : stepPartNameFromFile(promptResource.path)) : "";
      return part ? { part, kind: KINDS[match[2]], number: match[3] } : null;
    });
    if (!named.length || named.some(entry => !entry)) return "";
    if (named.length === 1) return named[0].own ? { name: named[0].own, kind: named[0].kind } : { name: named[0].part, kind: named[0].kind, number: named[0].number };
    const [first] = named;
    return first.part && named.every(entry => entry.part === first.part && entry.kind === first.kind)
      ? { name: first.part, kind: first.kind, count: named.length } : named.map(entry => entry.own || `${entry.part} · ${entry.kind} ${entry.number}`).join(", ");
  }, [promptResource.path, displayStepTreeRoot, stepTreeRoot, isAssemblyView]);
  // What is selected, in the prompt grammar: the references a Quick Edit attaches.
  const promptSelection = useMemo(() => referencesForHost(canonicalCopySelectionLines.join("\n")).map(reference => ({
    resource: { ...promptResource },
    target: reference.selector ? { kind: 'cad-selector', selectors: reference.selector.split(',') } : { kind: 'whole-resource' },
    ...(reference.label ? { label: reference.label } : {})
  })), [referencesForHost, canonicalCopySelectionLines, promptResource]);
  // Every request for a part's topology ends here, `onLoadTopology` included: the tree asks for
  // the parts on screen, as often as every scroll frame. A part already expanded and requested
  // costs a lookup; new parts are expanded (which is what requests them) together, at most every
  // TOPOLOGY_EXPANSION_INTERVAL_MS and the first at once. The loader behind the request unions and
  // batches the rest (useCadAssets' loadReferencesForEntry). The callback is stable.
  const expandedStepTreeNodeIdSet = useMemo(() => new Set(expandedStepTreeNodeIds), [expandedStepTreeNodeIds]);
  const topologyExpansionRef = useRef({ ids: new Set(), timer: 0, last: -Infinity });
  const topologyRequestStateRef = useRef(null);
  topologyRequestStateRef.current = {
    isAssemblyView,
    loadable: loadableStepTreeTopologyNodeIdSet,
    requested: requestedTopologyIdSet,
    expanded: expandedStepTreeNodeIdSet,
    root: displayStepTreeRoot || stepTreeRoot,
    expandStepTreeAroundNode
  };
  const flushTopologyExpansion = useCallback(() => {
    const queue = topologyExpansionRef.current;
    clearTimeout(queue.timer);
    queue.timer = 0;
    queue.last = Date.now();
    const { loadable, root } = topologyRequestStateRef.current;
    const ids = [...queue.ids].filter(id => loadable.has(id));
    queue.ids.clear();
    if (!ids.length || !root) return;
    // As expandStepTreeAroundNode(id, { expandSelf: true }) for each, in one update.
    const idsToExpand = uniqueStringList(ids.flatMap(id => collectStepTreeRevealExpansionIds(root, id, {
      expandSelf: true,
      includeVisualOnlyAncestors: true
    })));
    if (!idsToExpand.length) return;
    setExpandedStepTreeNodeIds(current => {
      const expanded = new Set(current);
      return idsToExpand.every(id => expanded.has(id)) ? current : uniqueStringList([...current, ...idsToExpand]);
    });
  }, []);
  useEffect(() => () => {
    const queue = topologyExpansionRef.current;
    clearTimeout(queue.timer);
    queue.timer = 0;
    queue.ids.clear();
  }, [selectedKey]);
  const loadInspectionTopology = useCallback((partIds = []) => {
    const request = topologyRequestStateRef.current;
    if (!request.isAssemblyView) {
      request.expandStepTreeAroundNode(STEP_MODEL_ROOT_ID, { expandSelf: true });
      setLargeFileState(current => current.selectableTopologyEnabled ? current : ({ ...current, selectableTopologyEnabled: true }));
      return;
    }
    const queue = topologyExpansionRef.current;
    let added = false;
    for (const id of Array.isArray(partIds) ? partIds : []) {
      if (!request.loadable.has(id) || queue.ids.has(id) || (request.requested.has(id) && request.expanded.has(id))) continue;
      queue.ids.add(id);
      added = true;
    }
    if (!added || queue.timer) return;
    const wait = queue.last + TOPOLOGY_EXPANSION_INTERVAL_MS - Date.now();
    if (wait <= 0) flushTopologyExpansion();
    else queue.timer = setTimeout(flushTopologyExpansion, wait);
  }, [flushTopologyExpansion]);
  const loadFilterTopology = useCallback((target) => {
    if (target) loadInspectionTopology([target.id]);
  }, [loadInspectionTopology]);
  const appliedFilterTopologyRequest = useRef('');
  useEffect(() => {
    const requestKey = TOPOLOGY_FILTERS.has(selectionFilter) && topologyTarget
      ? `${selectedKey}:${artifactRevision}:${selectionFilter}:${topologyTarget.id}` : '';
    if (requestKey && appliedFilterTopologyRequest.current !== requestKey) loadFilterTopology(topologyTarget);
    appliedFilterTopologyRequest.current = requestKey;
  }, [selectedKey, artifactRevision, selectionFilter, topologyTarget, loadFilterTopology]);
  const selectReferenceGroup = useCallback((referenceIds, { multiSelect = false } = {}) => {
    if (stepUpdateInProgress || !referenceIds.length || !referenceIds.every(id => ["face", "edge"].includes(effectiveActiveReferenceMap.get(id)?.selectorType))) return;
    const next = toggleReferenceGroupSelection(selectedReferenceIdsRef.current, referenceIds, multiSelect);
    ensureSelectTool();
    setSelectedPartIds([]);
    setSelectedRenderPartIdByAssemblyPartId({});
    setSelectedReferenceIds(next);
    setActiveTreeNodeScrollKey("");
  }, [stepUpdateInProgress, effectiveActiveReferenceMap]);

  const toggleStepTreeNode = useCallback((nodeId) => {
    const normalizedNodeId = String(nodeId || "").trim();
    if (!normalizedNodeId) return;
    setExpandedStepTreeNodeIds(current => current.includes(normalizedNodeId)
      ? current.filter(id => id !== normalizedNodeId)
      : [...current, normalizedNodeId]);
  }, []);

  // Select's filter picks; it never shapes the model tree, which opens by the one rule every tree
  // has (`kit/inspector/treeExpansion.js`) and is the person's from there. What the viewport picks
  // and whose topology loads follow the filter instead (`pickExpandedStepTreeNodeIds`, above). A
  // part's faces and edges are no part of the tree's shape (a part is a leaf), only of what loads:
  // leaving Faces or Edges, the parts loaded for them go back as they were, so a press picks a part
  // where it did before; the owners of what is still selected stay loaded, and selected.
  const topologyPartsRef = useRef(null);
  const changeSelectFilter = useCallback((filter) => {
    const previous = treeShape(selectionFilter), next = treeShape(selectGeometryMode(filter));
    setSelectFilter(filter);
    const topology = shape => shape === "faces" || shape === "edges";
    if (topology(previous) === topology(next)) return;
    const parts = isAssemblyView ? loadableStepTreeTopologyNodeIdSet : new Set([STEP_MODEL_ROOT_ID]);
    if (topology(next)) {
      topologyPartsRef.current = new Set(expandedStepTreeNodeIds.filter(id => parts.has(id)));
      return;
    }
    const kept = topologyPartsRef.current || new Set();
    topologyPartsRef.current = null;
    const root = displayStepTreeRoot || stepTreeRoot;
    const owners = isAssemblyView
      ? uniqueStringList(selectedReferenceIdsRef.current.map(id => referencePartId(effectiveActiveReferenceMap.get(id))).filter(Boolean))
      : selectedReferenceIdsRef.current.length ? [STEP_MODEL_ROOT_ID] : [];
    const reveal = owners.flatMap(id => (root ? collectStepTreeRevealExpansionIds(root, id, { expandSelf: true }) : [id]));
    setExpandedStepTreeNodeIds(current => {
      const nextIds = uniqueStringList([...current.filter(id => !parts.has(id) || kept.has(id)), ...reveal]);
      return orderedStringListEqual(nextIds, current) ? current : nextIds;
    });
  }, [selectionFilter, isAssemblyView, loadableStepTreeTopologyNodeIdSet, expandedStepTreeNodeIds, displayStepTreeRoot, stepTreeRoot,
    referencePartId, effectiveActiveReferenceMap]);
  // Edit mode turns Select to what a command picks, as the filter menu would: a fillet's edges or a
  // hole's face ticked alone, or, for "all", every kind the file opens with.
  const changeSelectMode = useCallback(picks => changeSelectFilter(picks === "all" ? STEP_SELECT_DEFAULT : [picks]),
    [changeSelectFilter]);

  const removeSelectedAssemblyNode = useCallback((nodeId) => {
    const normalizedNodeId = String(nodeId || "").trim();
    if (!normalizedNodeId) {
      return selectedPartIdsRef.current;
    }
    const nextSelectedPartIds = selectedPartIdsRef.current.filter((id) => String(id || "").trim() !== normalizedNodeId);
    if (nextSelectedPartIds.length === selectedPartIdsRef.current.length) {
      return selectedPartIdsRef.current;
    }
    setSelectedPartIds(nextSelectedPartIds);
    setSelectedRenderPartIdByAssemblyPartId((current) => {
      const nextMap = { ...current };
      delete nextMap[normalizedNodeId];
      return nextMap;
    });
    return nextSelectedPartIds;
  }, []);

  const togglePartSelection = useCallback((partId, { multiSelect = false, renderPartId = "", source = "viewer" } = {}) => {
    if (stepInteractionBlocked) {
      return selectedPartIdsRef.current;
    }
    if (source !== "viewer") {
      setActiveTreeNodeScrollKey("");
    }
    const normalizedPartId = String(partId || "").trim();
    const alreadySelected = selectedPartIdsRef.current.includes(normalizedPartId);
    const scopedSelectableNodeIds = source === "viewer"
      ? viewerSelectableAssemblyNodeIdSet
      : validAssemblySelectionIdSet;
    if (isAssemblyView && !scopedSelectableNodeIds.has(normalizedPartId) && !alreadySelected) {
      return selectedPartIdsRef.current;
    }
    ensureSelectTool();
    const next = !multiSelect && selectedReferenceIdsRef.current.length
      ? (normalizedPartId ? [normalizedPartId] : [])
      : computeNextSelectionIds(selectedPartIdsRef.current, partId, { multiSelect });
    if (!multiSelect && selectedReferenceIdsRef.current.length) {
      setSelectedReferenceIds([]);
    }
    setSelectedPartIds(next);
    if (next.includes(normalizedPartId)) {
      revealStepTreeNode(normalizedPartId, { source });
    }
    setSelectedRenderPartIdByAssemblyPartId((current) => {
      const nextMap = {};
      for (const selectedPartId of next) {
        const normalizedSelectedPartId = String(selectedPartId || "").trim();
        if (!normalizedSelectedPartId) {
          continue;
        }
        const selectedRenderPartId = normalizedSelectedPartId === normalizedPartId
          ? renderPartIdForAssemblySelection(normalizedSelectedPartId, renderPartId)
          : renderPartIdForAssemblySelection(normalizedSelectedPartId, current[normalizedSelectedPartId]);
        if (selectedRenderPartId) {
          nextMap[normalizedSelectedPartId] = selectedRenderPartId;
        }
      }
      return nextMap;
    });
    return next;
  }, [
    isAssemblyView,
    focusedAssemblyNodeIds,
    removeSelectedAssemblyNode,
    revealStepTreeNode,
    renderPartIdForAssemblySelection,
    validAssemblySelectionIdSet,
    viewerSelectableAssemblyNodeIdSet,
    stepInteractionBlocked,
  ]);

  const selectStepTreeNode = useCallback((nodeId, { multiSelect = false } = {}) => {
    const normalizedNodeId = String(nodeId || "").trim();
    togglePartSelection(normalizedNodeId, { multiSelect, source: "tree" });
  }, [
    togglePartSelection
  ]);

  /**
   * A reference the host names (`selectReference`, docs/cad-renderer.md): a
   * transcript link said `bracket.step#o1.2`. Resolved against whatever is
   * loaded (hostReference.js) and applied once per `key` — the maps fill as
   * the model and its topology arrive, so an unresolved selector is tried
   * again on the next change, and a resolved one is not re-applied when they
   * change after. Already selected means revealed, not toggled off.
   */
  const appliedSelectReferenceKeyRef = useRef(null);
  useEffect(() => {
    const selector = String(selectReference?.selector || "").trim();
    if (!selector || appliedSelectReferenceKeyRef.current === selectReference.key || viewerLoading || stepInteractionBlocked) {
      return;
    }
    const selectors = selector.split(",").map(value => value.trim()).filter(Boolean);
    const owners = stepTreeTopologyOwnersForSelectors(stepTreeRoot, selectors, { isAssemblyView });
    if (isolatedStepTreeSelectableNodeIds && owners.some(id => !isolatedStepTreeSelectableNodeIds.includes(id))) {
      setIsolatedAssemblyNodeIds([]);
    }
    if (owners.some(id => !expandedStepTreeTopologyNodeIds.includes(id))) loadInspectionTopology(owners);
    if (selectors.length > 1) {
      const resolvedFaces = selectors.map(value => resolveSelectorSelection(value, {
        referenceMap: effectiveActiveReferenceMap,
        treeRoot: displayStepTreeRoot || stepTreeRoot
      }));
      if (resolvedFaces.some(value => !value)) return;
      if (resolvedFaces.every(value => value.kind === "reference" && effectiveActiveReferenceMap.get(value.id)?.selectorType === "face")) {
        if (stepUpdateInProgress) return;
        selectReferenceGroup(resolvedFaces.map(value => value.id));
        const lastFace = resolvedFaces[resolvedFaces.length - 1].id;
        revealStepTreeNode(findStepTreeTopologyNodeIdForReference(displayStepTreeRoot, lastFace) || referencePartId(effectiveActiveReferenceMap.get(lastFace)), { source: "reference" });
        appliedSelectReferenceKeyRef.current = selectReference.key;
        if (selectReference.key !== undefined) acknowledgeCommand?.('selectReference', selectReference.key);
        return;
      }
    }
    const resolved = resolveSelectorSelection(selector, {
      referenceMap: effectiveActiveReferenceMap,
      treeRoot: displayStepTreeRoot || stepTreeRoot
    });
    if (!resolved) {
      return;
    }
    appliedSelectReferenceKeyRef.current = selectReference.key;
        if (selectReference.key !== undefined) acknowledgeCommand?.('selectReference', selectReference.key);
    if (resolved.kind === "reference") {
      if (selectedReferenceIdsRef.current.includes(resolved.id)) {
        revealStepTreeNode(findStepTreeTopologyNodeIdForReference(displayStepTreeRoot, resolved.id) || referencePartId(effectiveActiveReferenceMap.get(resolved.id)) || resolved.id, { source: "reference" });
      } else {
        toggleReferenceSelection(resolved.id, { source: "reference" });
      }
    } else if (selectedPartIdsRef.current.includes(resolved.id)) {
      revealStepTreeNode(resolved.id, { source: "reference" });
    } else {
      togglePartSelection(resolved.id, { source: "reference" });
    }
  }, [
    selectReference,
    isAssemblyView,
    isolatedStepTreeSelectableNodeIds,
    expandedStepTreeTopologyNodeIds,
    loadInspectionTopology,
    acknowledgeCommand,
    stepInteractionBlocked,
    viewerLoading,
    stepUpdateInProgress,
    selectReferenceGroup,
    referencePartId,
    effectiveActiveReferenceMap,
    displayStepTreeRoot,
    stepTreeRoot,
    revealStepTreeNode,
    toggleReferenceSelection,
    togglePartSelection
  ]);

  const clearAssemblySelectionForFocus = useCallback(() => {
    setActiveTreeNodeScrollKey("");
    setSelectedPartIds([]);
    setSelectedRenderPartIdByAssemblyPartId({});
    setSelectedReferenceIds([]);
    setHoveredListPartId("");
    setHoveredModelPartId("");
    setHoveredModelReferenceId("");
    setViewerContextMenu(null);
  }, []);

  const collapseStepTreeSubtree = useCallback((partId) => {
    const normalizedPartId = String(partId || "").trim();
    const treeRootForCollapse = displayStepTreeRoot || stepTreeRoot;
    const collapsedIds = new Set(collectStepTreeSubtreeIds(treeRootForCollapse, normalizedPartId));
    if (!collapsedIds.size) {
      return;
    }
    setExpandedStepTreeNodeIds((current) => current.filter((id) => !collapsedIds.has(id)));
  }, [
    displayStepTreeRoot,
    stepTreeRoot
  ]);

  const focusStepTreeNode = useCallback((nodeId, { reveal = true } = {}) => {
    if (!isAssemblyView || !assemblyRoot) {
      return;
    }
    const requestedNodeIds = uniqueStringList(
      (Array.isArray(nodeId) ? nodeId : [nodeId])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    );
    const targetNodeIds = minimalAssemblyIsolationNodeIds(assemblyRoot, requestedNodeIds, {
      rootId: assemblyRootNodeId
    });
    const targetNodes = targetNodeIds
      .map((id) => ({ id, node: findAssemblyNode(assemblyRoot, id) }))
      .filter(({ node }) => Boolean(node));
    if (!targetNodes.length) {
      setIsolatedAssemblyNodeIds((current) => (current.length ? [] : current));
      return;
    }
    const targetLeafIds = targetNodes.flatMap(({ node }) => descendantLeafPartIds(node))
      .map((id) => String(id || "").trim())
      .filter(Boolean);
    const targetLeafIdSet = new Set(targetLeafIds);
    clearAssemblySelectionForFocus();
    setIsolatedAssemblyNodeIds(targetNodeIds);
    setExpandedStepTreeNodeIds((current) => uniqueStringList([...current, ...targetNodeIds]));
    setHiddenPartIds((current) => {
      if (!targetLeafIdSet.size) {
        return current;
      }
      const next = current.filter((id) => !targetLeafIdSet.has(String(id || "").trim()));
      return next.length === current.length ? current : next;
    });
    for (const targetNodeId of reveal ? targetNodeIds : []) {
      revealStepTreeNode(targetNodeId, {
        expandSelf: true,
        source: "tree"
      });
    }
  }, [
    assemblyRoot,
    assemblyRootNodeId,
    clearAssemblySelectionForFocus,
    isAssemblyView,
    revealStepTreeNode
  ]);

  const handleExitIsolate = useCallback(() => {
    for (const nodeId of focusedAssemblyNodeIds) {
      collapseStepTreeSubtree(nodeId);
    }
    setIsolatedAssemblyNodeIds((current) => (current.length ? [] : current));
  }, [
    collapseStepTreeSubtree,
    focusedAssemblyNodeIds
  ]);

  const handleExitSingleIsolate = useCallback((nodeId) => {
    const normalizedNodeId = String(nodeId || "").trim();
    if (!normalizedNodeId) {
      handleExitIsolate();
      return;
    }
    collapseStepTreeSubtree(normalizedNodeId);
    setIsolatedAssemblyNodeIds((current) => {
      const next = current.filter((id) => String(id || "").trim() !== normalizedNodeId);
      return next.length === current.length ? current : next;
    });
  }, [
    collapseStepTreeSubtree,
    handleExitIsolate
  ]);

  const clearAssemblySelection = useCallback(() => {
    clearAssemblySelectionForFocus();
  }, [clearAssemblySelectionForFocus]);

  // A selection outlives Select: it is what Quick Edit's chips name and what the view lights, under
  // any tool, until it is cleared. Picking is Select's alone — a pick under another tool takes up
  // Select first (`ensureSelectTool`).

  const clearSelectionForHiddenLeafIds = useCallback((leafIds, nodeId = "") => {
    const hiddenLeafIds = new Set(
      (Array.isArray(leafIds) ? leafIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    );
    if (!hiddenLeafIds.size) {
      return;
    }
    const normalizedNodeId = String(nodeId || "").trim();
    const nextSelectedPartIds = selectedPartIdsRef.current.filter((selectedNodeId) => {
      const normalizedSelectedNodeId = String(selectedNodeId || "").trim();
      if (!normalizedSelectedNodeId) {
        return false;
      }
      if (normalizedNodeId && assemblyNodeContainsNode(assemblyRoot, normalizedNodeId, normalizedSelectedNodeId)) {
        return false;
      }
      const selectedLeafIds = renderPartIdsForAssemblySelection(normalizedSelectedNodeId);
      return !selectedLeafIds.some((leafId) => hiddenLeafIds.has(String(leafId || "").trim()));
    });
    const partSelectionChanged = nextSelectedPartIds.length !== selectedPartIdsRef.current.length;
    if (partSelectionChanged) {
      setSelectedPartIds(nextSelectedPartIds);
      setSelectedRenderPartIdByAssemblyPartId((current) => {
        const selectedNodeIdSet = new Set(nextSelectedPartIds);
        const nextMap = {};
        for (const [selectedNodeId, renderPartId] of Object.entries(current || {})) {
          if (selectedNodeIdSet.has(selectedNodeId)) {
            nextMap[selectedNodeId] = renderPartId;
          }
        }
        return nextMap;
      });
    }

    const nextSelectedReferenceIds = selectedReferenceIdsRef.current.filter((referenceId) => {
      const reference = effectiveActiveReferenceMap.get(referenceId);
      const selectedReferencePartId = referencePartId(reference);
      const selectedReferenceLeafIds = renderPartIdsForAssemblySelection(selectedReferencePartId, selectedReferencePartId);
      return !selectedReferenceLeafIds.some((leafId) => hiddenLeafIds.has(String(leafId || "").trim()));
    });
    const referenceSelectionChanged = nextSelectedReferenceIds.length !== selectedReferenceIdsRef.current.length;
    if (referenceSelectionChanged) {
      setSelectedReferenceIds(nextSelectedReferenceIds);
    }

  }, [
    assemblyRoot,
    effectiveActiveReferenceMap,
    referencePartId,
    renderPartIdsForAssemblySelection
  ]);

  useEffect(() => {
    clearSelectionForHiddenLeafIds(hiddenPartIds);
  }, [
    clearSelectionForHiddenLeafIds,
    hiddenPartIds
  ]);

  const hideStepTreeNode = useCallback((partId) => {
    const normalizedPartId = String(partId || "").trim();
    const leafIds = renderPartIdsForAssemblySelection(partId);
    if (!leafIds.length) {
      return;
    }
    collapseStepTreeSubtree(partId);
    clearSelectionForHiddenLeafIds(leafIds, normalizedPartId);
    setIsolatedAssemblyNodeIds((current) => {
      const next = current.filter((nodeId) => !assemblyNodeContainsNode(assemblyRoot, normalizedPartId, nodeId));
      return next.length === current.length ? current : next;
    });
    setHiddenPartIds((current) => {
      const hidden = new Set(current);
      let changed = false;
      for (const id of leafIds) {
        if (!id || hidden.has(id)) {
          continue;
        }
        hidden.add(id);
        changed = true;
      }
      return changed ? [...hidden] : current;
    });
  }, [
    assemblyRoot,
    collapseStepTreeSubtree,
    clearSelectionForHiddenLeafIds,
    renderPartIdsForAssemblySelection
  ]);

  const revealHiddenStepTreeNode = useCallback((partId) => {
    const leafIds = renderPartIdsForAssemblySelection(partId);
    if (!leafIds.length) {
      return;
    }
    const leafIdSet = new Set(leafIds);
    setHiddenPartIds((current) => current.filter((id) => !leafIdSet.has(id)));
    revealStepTreeNode(partId, {
      source: "viewer"
    });
  }, [
    renderPartIdsForAssemblySelection,
    revealStepTreeNode
  ]);

  const togglePartVisibility = useCallback((partId) => {
    const leafIds = renderPartIdsForAssemblySelection(partId);
    if (!leafIds.length) {
      return;
    }
    const hidden = new Set(hiddenPartIds);
    const allHidden = leafIds.every((id) => hidden.has(id));
    if (!allHidden) {
      collapseStepTreeSubtree(partId);
      clearSelectionForHiddenLeafIds(leafIds, partId);
      setIsolatedAssemblyNodeIds((current) => {
        const next = current.filter((nodeId) => !assemblyNodeContainsNode(assemblyRoot, partId, nodeId));
        return next.length === current.length ? current : next;
      });
    }
    setHiddenPartIds((current) => {
      const hidden = new Set(current);
      const allHidden = leafIds.every((id) => hidden.has(id));
      if (allHidden) {
        return current.filter((id) => !leafIds.includes(id));
      }
      for (const id of leafIds) {
        hidden.add(id);
      }
      return [...hidden];
    });
  }, [
    assemblyRoot,
    collapseStepTreeSubtree,
    clearSelectionForHiddenLeafIds,
    hiddenPartIds,
    renderPartIdsForAssemblySelection
  ]);

  const handleHideSelectedParts = useCallback(() => {
    const nextSelectedPartIds = [...new Set(
      selectedPartIdsRef.current
        .map((partId) => String(partId || "").trim())
        .filter(Boolean)
    )];
    if (nextSelectedPartIds.length < 1) {
      return;
    }
    setIsolatedAssemblyNodeIds((current) => (current.length ? [] : current));
    setHiddenPartIds((current) => {
      const next = [...current];
      const hidden = new Set(current);
      let changed = false;
      for (const partId of nextSelectedPartIds.flatMap((id) => renderPartIdsForAssemblySelection(id))) {
        if (!partId || hidden.has(partId)) {
          continue;
        }
        hidden.add(partId);
        next.push(partId);
        changed = true;
      }
      return changed ? next : current;
    });
    clearAssemblySelectionForFocus();
  }, [
    clearAssemblySelectionForFocus,
    renderPartIdsForAssemblySelection
  ]);

  const handleHideOtherTreeNode = useCallback((nodeId) => {
    const normalizedNodeIds = uniqueStringList(
      (Array.isArray(nodeId) ? nodeId : [nodeId])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    );
    if (!normalizedNodeIds.length) {
      return;
    }
    const targetLeafPartIds = [...new Set(
      normalizedNodeIds
        .flatMap((id) => renderPartIdsForAssemblySelection(id))
        .map((partId) => String(partId || "").trim())
        .filter(Boolean)
    )];
    if (!targetLeafPartIds.length) {
      return;
    }
    const targetLeafPartIdSet = new Set(targetLeafPartIds);
    setIsolatedAssemblyNodeIds((current) => (current.length ? [] : current));
    setHiddenPartIds(validAssemblyLeafIds.filter((partId) => !targetLeafPartIdSet.has(partId)));
    clearAssemblySelectionForFocus();
    for (const targetNodeId of normalizedNodeIds) {
      revealStepTreeNode(targetNodeId, {
        source: "tree"
      });
    }
  }, [
    clearAssemblySelectionForFocus,
    renderPartIdsForAssemblySelection,
    revealStepTreeNode,
    validAssemblyLeafIds
  ]);

  const handleHideAllParts = useCallback(() => {
    if (!validAssemblyLeafIds.length) {
      return;
    }
    setIsolatedAssemblyNodeIds((current) => (current.length ? [] : current));
    setHiddenPartIds(validAssemblyLeafIds);
    clearAssemblySelectionForFocus();
  }, [
    clearAssemblySelectionForFocus,
    validAssemblyLeafIds
  ]);

  const handleShowAllHiddenParts = useCallback(() => {
    setHiddenPartIds((current) => (current.length ? [] : current));
  }, []);

  const handleModelHoverChange = useCallback((referenceId) => {
    if (stepInteractionBlocked) {
      setHoveredModelReferenceId("");
      setHoveredModelPartId("");
      return;
    }
    const nextReferenceId = String(referenceId || "").trim();
    const topologyReference = effectiveActiveReferenceMap.get(nextReferenceId) || null;
    if (topologyReference && isViewerTopologyReference(topologyReference)) {
      setHoveredModelReferenceId(nextReferenceId);
      setHoveredModelPartId("");
      return;
    }
    if (viewerInAssemblyMode) {
      const pickedPartId = nextReferenceId;
      if (!pickedPartId) {
        setHoveredModelReferenceId("");
        setHoveredModelPartId("");
        return;
      }
      setHoveredModelReferenceId("");
      setHoveredModelPartId(resolvePickedAssemblyPartId(pickedPartId));
      return;
    }
    setHoveredModelReferenceId(nextReferenceId);
  }, [
    effectiveActiveReferenceMap,
    isViewerTopologyReference,
    viewerInAssemblyMode,
    resolvePickedAssemblyPartId,
    stepInteractionBlocked,
  ]);

  // A connected option grows a pick only where it applies (`connectedSelectionApplies`): the graph
  // is built only then.
  const tangentFacesActive = connectedSelection.tangentFaces && connectedSelectionApplies("tangentFaces", selectFilter);
  const edgeChainActive = connectedSelection.edgeChain && connectedSelectionApplies("edgeChain", selectFilter);
  const tangentFaces = useMemo(() => buildTangentFaceGraph(
    tangentFacesActive ? [...effectiveActiveReferenceMap.values()] : EMPTY_LIST
  ), [tangentFacesActive, effectiveActiveReferenceMap]);

  const edgeChains = useMemo(() => buildEdgeChainGraph(
    edgeChainActive ? [...effectiveActiveReferenceMap.values()] : EMPTY_LIST
  ), [edgeChainActive, effectiveActiveReferenceMap]);

  // The selection as the last activation found it. A click acts at once (`useStepPicking`), so
  // the first click of a double-click has already changed the selection by the time the dblclick
  // arrives; the double-click puts that selection back — through the same setters every pick
  // goes through, so the Reference panel, the tree's highlight and the viewport's follow — and
  // then isolates, leaves isolation or copies as if that click had never happened.
  const selectionBeforeActivationRef = useRef(null);
  const restoreSelectionBeforeActivation = useCallback(() => {
    const before = selectionBeforeActivationRef.current;
    if (!before) return;
    selectionBeforeActivationRef.current = null;
    // A press that asked for a part's faces and is waiting to pick again is that click's too.
    setPendingTopologyPick(null);
    setSelectedPartIds(before.partIds);
    setSelectedRenderPartIdByAssemblyPartId(before.renderPartIdByAssemblyPartId);
    setSelectedReferenceIds(before.referenceIds);
  }, []);

  const handleModelReferenceActivate = useCallback((referenceId, { multiSelect: pressedMulti = false, clientX, clientY, pointerType = "" } = {}) => {
    if (stepInteractionBlocked) {
      return;
    }
    // While edit mode's command takes many, each click adds a face or edge or takes a picked one
    // out, as a PropertyManager's selection box does, and a click off the model keeps them.
    const multiSelect = pressedMulti || choosingManyRef.current;
    selectionBeforeActivationRef.current = {
      partIds: selectedPartIdsRef.current,
      renderPartIdByAssemblyPartId: selectedRenderPartIdByAssemblyPartIdRef.current,
      referenceIds: selectedReferenceIdsRef.current
    };
    // Every press settles a pick still waiting for its part's faces: the newest one wins.
    setPendingTopologyPick(null);
    const nextReferenceId = String(referenceId || "").trim();
    if (!nextReferenceId) {
      if (multiSelect) return;
      clearAssemblySelection();
      backgroundClickRef.current?.();
      return;
    }
    // Select picking no geometry, just its knobs, the ink or measurements: a press on the model is none of them.
    if (selectionFilter === "none") return;
    if (selectionFilter === "parts") {
      const partId = isAssemblyView ? resolvePickedAssemblyPartId(nextReferenceId) : STEP_MODEL_ROOT_ID;
      togglePartSelection(partId, { multiSelect, renderPartId: nextReferenceId, source: "viewer" });
      return;
    }
    const topologyReference = effectiveActiveReferenceMap.get(nextReferenceId) || null;
    // A face clicked while Hole is open: where on it, for the hole to go there; an edge clicked
    // while an extrude is open: where along it, for Up To Vertex to take the end nearest.
    if ((topologyReference?.selectorType === "face" || topologyReference?.selectorType === "edge") && holePointRef.current
      && Number.isFinite(clientX)) {
      const point = pointAtRef.current?.(clientX, clientY);
      if (point) holePointRef.current({ id: topologyReference.id, point, center: topologyReference.pickData?.center || null,
        normal: topologyReference.pickData?.normal || null });
      const picked = selectedReferenceIdsRef.current;
      if (keepFaceRef.current && picked.length === 1 && picked[0] === topologyReference.id) return;
    }
    if (edgeChainActive && topologyReference?.selectorType === "edge") {
      selectReferenceGroup(connectedReferenceIds(edgeChains, topologyReference.id), { multiSelect });
      return;
    }
    if (tangentFacesActive && topologyReference?.selectorType === "face") {
      selectReferenceGroup(connectedReferenceIds(tangentFaces, topologyReference.id), { multiSelect });
      return;
    }
    if (topologyReference && isViewerTopologyReference(topologyReference)) {
      toggleReferenceSelection(nextReferenceId, { multiSelect });
      return;
    }
    if (TOPOLOGY_FILTERS.has(selectionFilter)) {
      // A face or edge filter never falls back to the part. A press on an assembly part whose
      // faces and edges are not loaded asks for that part's topology — that part alone, as its
      // model tree row would — and picks again at the same point once they can be picked.
      if (isAssemblyView && loadableStepTreeTopologyNodeIdSet.has(nextReferenceId) &&
        !pickableTopologyPartIds.has(nextReferenceId) && Number.isFinite(clientX) && Number.isFinite(clientY)) {
        setPendingTopologyPick({ partId: nextReferenceId, clientX, clientY, pointerType, multiSelect });
        loadInspectionTopology([nextReferenceId]);
      }
      return;
    }
    if (viewerInAssemblyMode) {
      const pickedPartId = nextReferenceId;
      const nextPartId = resolvePickedAssemblyPartId(pickedPartId);
      if (!nextPartId) {
        clearAssemblySelection();
        return;
      }
      togglePartSelection(nextPartId, { multiSelect, renderPartId: pickedPartId });
      return;
    }
    togglePartSelection(STEP_MODEL_ROOT_ID, { multiSelect, renderPartId: nextReferenceId });
  }, [
    clearAssemblySelection,
    viewerPickableReferences,
    revealStepTreeNode,
    referencePartId,
    selectionFilter,
    tangentFacesActive,
    edgeChainActive,
    tangentFaces,
    edgeChains,
    selectReferenceGroup,
    isAssemblyView,
    effectiveActiveReferenceMap,
    resolvePickedAssemblyPartId,
    selectedEntry,
    selectedEntryHasReferences,
    selectedReferencesMatch,
    stepInteractionBlocked,
    toggleReferenceSelection,
    togglePartSelection,
    viewerInAssemblyMode,
    loadableStepTreeTopologyNodeIdSet,
    pickableTopologyPartIds,
    loadInspectionTopology,
  ]);

  // The press that was waiting for its part's faces, replayed at the same point once the part's
  // topology is composed into the references (or has failed to be). What is under that point
  // then is picked exactly as a fresh press would pick it, faces-only filter and all.
  useEffect(() => {
    const pending = pendingTopologyPick;
    if (!pending) return;
    if (referenceStatus === REFERENCE_STATUS.ERROR) { setPendingTopologyPick(null); return; }
    if (stepInteractionBlocked || !selectedReferencesMatch || !selectedTopologyLoadedIdSet.has(pending.partId)) return;
    setPendingTopologyPick(null);
    const referenceId = pickAtRef.current?.(pending.clientX, pending.clientY, pending.pointerType) || "";
    const reference = effectiveActiveReferenceMap.get(referenceId);
    if (reference && isViewerTopologyReference(reference)) {
      handleModelReferenceActivate(referenceId, { multiSelect: pending.multiSelect });
    }
  }, [pendingTopologyPick, referenceStatus, stepInteractionBlocked, selectedReferencesMatch, selectedTopologyLoadedIdSet,
    effectiveActiveReferenceMap, isViewerTopologyReference, handleModelReferenceActivate]);
  // A waiting press belongs to the filter, tool and file it was made under.
  useEffect(() => { setPendingTopologyPick(null); }, [selectionFilter, tabToolMode, selectedKey]);

  // Measure takes the vertex, edge or face of any part, as a CAD tool does, not just of the parts
  // the Model tree has open: a press on an assembly part whose topology is not loaded asks for that
  // part's (as Select's face filter does) and presses again at the same point once it can be picked.
  const handleMeasureWantsTopology = useCallback((partId, press) => {
    if (!isAssemblyView || !loadableStepTreeTopologyNodeIdSet.has(partId) || pickableTopologyPartIds.has(partId)) return false;
    setPendingMeasurePick({ partId, ...press });
    loadInspectionTopology([partId]);
    return true;
  }, [isAssemblyView, loadableStepTreeTopologyNodeIdSet, pickableTopologyPartIds, loadInspectionTopology]);
  // Any other press settles the waiting one: the newest wins.
  const handleMeasurePick = useCallback((pick) => {
    setPendingMeasurePick(null);
    measure.onPick(pick);
  }, [measure.onPick]);
  useEffect(() => {
    const pending = pendingMeasurePick;
    if (!pending) return;
    if (referenceStatus === REFERENCE_STATUS.ERROR) { setPendingMeasurePick(null); return; }
    if (stepInteractionBlocked || !pickableTopologyPartIds.has(pending.partId)) return;
    setPendingMeasurePick(null);
    measureAtRef.current?.(pending.clientX, pending.clientY);
  }, [pendingMeasurePick, referenceStatus, stepInteractionBlocked, pickableTopologyPartIds]);
  useEffect(() => { setPendingMeasurePick(null); }, [tabToolMode, selectedKey]);

  // `activated`: the gesture's first click activated (its second never does), so the selection
  // that click found comes back first; the double-click then acts on it as it always has.
  const handleModelReferenceDoubleActivate = useCallback((referenceId, { activated = false } = {}) => {
    if (stepInteractionBlocked) return;
    if (activated) restoreSelectionBeforeActivation();
    if (!referenceId) {
      handleExitIsolate();
      return;
    }
    const reference = effectiveActiveReferenceMap.get(referenceId);
    const topology = reference && isViewerTopologyReference(reference);
    if (topology && selectionFilter !== "parts") {
      // In the workspace, a double-click on a face selects the feature that made it and shows its
      // dimensions on the model, as SolidWorks' does; Normal To is Ctrl+8 there.
      if (faceDoubleRef.current(referenceId, reference)) return;
      // A double-click turns the view square to the face or edge — CAD's "Normal To"
      // (`kit/camera/lookAt.js`) — and selects nothing: the selection is as its first click found it.
      const selectorRuntime = layersApiRef.current?.activeSelectorRuntime;
      const subject = lookSubjectForReference(runtimeRefRef.current?.current, selectorRuntime,
        selectorReferenceForId(selectorRuntime, referenceId) || reference);
      if (subject) viewerRef.current?.lookAt?.(subject);
      return;
    }
    if (isAssemblyView) {
      const partId = topology ? referencePartId(reference) : referenceId;
      focusStepTreeNode(resolvePickedAssemblyPartId(partId), { reveal: false });
    }
  }, [stepInteractionBlocked, effectiveActiveReferenceMap, selectionFilter, isAssemblyView,
    restoreSelectionBeforeActivation, referencePartId, focusStepTreeNode, handleExitIsolate, resolvePickedAssemblyPartId]);

  const handleViewportContextMenuOpenChange = useCallback((open) => {
    if (!open) setViewerContextMenu(null);
  }, []);

  useEffect(() => {
    setViewerContextMenu(null);
  }, [selectedKey]);

  // The viewport's menu belongs to Select. Leaving the tool takes an open one
  // with it, so no item can outlive the tool it was offered under.
  useEffect(() => {
    if (tabToolMode !== TAB_TOOL_MODE.REFERENCES) setViewerContextMenu(null);
  }, [tabToolMode]);

  // The three menus, as descriptors built from the surface as it stands (`file-view/stepMenus.js`):
  // the model as a whole (a press on empty space, over a loaded model), one node's part menu
  // (the viewport and a model tree row alike), and topology (a pick's faces and edges, or a row's).
  const openGlobalViewerContextMenu = useCallback(({ clientX = 0, clientY = 0 } = {}) => {
    setViewerContextMenu(selectedMeshData ? {
      x: Number(clientX) || 0,
      y: Number(clientY) || 0,
      ...modelMenuDescriptor({
        root: displayStepTreeRoot, isAssemblyView, expandedIds: expandedStepTreeNodeIds,
        loadableIds: loadableStepTreeTopologyNodeIds, hiddenCount: hiddenPartIds.length,
        zoomSelectionAvailable: zoomSelectionRef.current.available, entry: selectedEntry
      })
    } : null);
  }, [
    displayStepTreeRoot,
    expandedStepTreeNodeIds,
    hiddenPartIds.length,
    isAssemblyView,
    loadableStepTreeTopologyNodeIds,
    selectedEntry,
    selectedMeshData
  ]);

  const assemblyNodeMenu = useCallback((nodeId, renderPartId = "") => {
    const id = String(nodeId || "").trim();
    const descriptor = partMenuDescriptor({
      nodeId: id, renderPartId,
      node: assemblyPartMap.get(id) || findAssemblyNode(assemblyRoot, id) || null,
      leafIds: id ? renderPartIdsForAssemblySelection(id, String(renderPartId || "").trim() || id) : EMPTY_LIST,
      hiddenPartIds, focusedNodeIds: focusedAssemblyNodeIds, selectedPartIds: selectedPartIdsRef.current,
      root: displayStepTreeRoot, isAssemblyView, expandedIds: expandedStepTreeNodeIds, loadableIds: loadableStepTreeTopologyNodeIds,
      copyReferenceMap: stepTreeCopyReferenceMap, entry: selectedEntry, zoomSelectionAvailable: zoomSelectionRef.current.available
    });
    return descriptor;
  }, [
    assemblyPartMap,
    assemblyRoot,
    displayStepTreeRoot,
    expandedStepTreeNodeIds,
    focusedAssemblyNodeIds,
    hiddenPartIds,
    isAssemblyView,
    loadableStepTreeTopologyNodeIds,
    renderPartIdsForAssemblySelection,
    selectedEntry,
    stepTreeCopyReferenceMap
  ]);

  const topologyReferenceMenu = useCallback((referenceIds, label = "") => topologyMenuDescriptor({
    referenceIds, label, selectedReferenceIds: selectedReferenceIdsRef.current, referenceMap: effectiveActiveReferenceMap,
    copyReferenceMap: stepTreeCopyReferenceMap, entry: selectedEntry, zoomSelectionAvailable: zoomSelectionRef.current.available
  }), [
    effectiveActiveReferenceMap,
    selectedEntry,
    stepTreeCopyReferenceMap
  ]);

  // Only ever reached under Select (the viewport's menu is offered by that tool alone), so
  // nothing it offers can contradict the tool.
  const handleModelReferenceContext = useCallback((referenceId, { clientX = 0, clientY = 0 } = {}) => {
    if (stepInteractionBlocked) {
      setViewerContextMenu(null);
      return;
    }
    const pickedPartId = String(referenceId || "").trim();
    if (!pickedPartId) {
      openGlobalViewerContextMenu({ clientX, clientY });
      return;
    }
    const topologyReference = effectiveActiveReferenceMap.get(pickedPartId) || null;
    if (topologyReference && isViewerTopologyReference(topologyReference)) {
      setViewerContextMenu({
        x: Number(clientX) || 0,
        y: Number(clientY) || 0,
        ...topologyReferenceMenu(
          [pickedPartId],
          topologyReference?.label || topologyReference?.displayName || pickedPartId
        ),
        featureItems: faceMenuRef.current(pickedPartId, topologyReference)
      });
      return;
    }
    if (!viewerInAssemblyMode) {
      openGlobalViewerContextMenu({ clientX, clientY });
      return;
    }
    const menu = assemblyNodeMenu(resolvePickedAssemblyPartId(pickedPartId), pickedPartId);
    if (!menu) {
      openGlobalViewerContextMenu({ clientX, clientY });
      return;
    }
    setViewerContextMenu({ x: Number(clientX) || 0, y: Number(clientY) || 0, ...menu });
  }, [
    assemblyNodeMenu,
    effectiveActiveReferenceMap,
    isViewerTopologyReference,
    openGlobalViewerContextMenu,
    resolvePickedAssemblyPartId,
    stepInteractionBlocked,
    topologyReferenceMenu,
    viewerInAssemblyMode
  ]);

  const copyViewerContextMenuReference = useCallback(async (menu) => {
    if (stepInteractionBlocked) {
      reportActionError(retainedPreviousStepMeshError
        ? "Selection unavailable because the STEP update failed."
        : "STEP update in progress. Please wait.");
      return;
    }
    const copyText = copyTextLines(menu?.copyText, fileRefPrefix).join("\n");
    if (!copyText) {
      reportActionError("No selector ref is available for this node");
      return;
    }
    try {
      await deliverReferenceText(copyText);
    } catch (error) {
      reportActionError(error instanceof Error ? error.message : "Failed to copy reference");
    }
  }, [deliverReferenceText, fileRefPrefix, retainedPreviousStepMeshError, stepInteractionBlocked]);

  const selectViewerContextMenuNode = useCallback((menu) => {
    const referenceId = String(menu?.referenceId || "").trim();
    if (referenceId) {
      const actionReferenceIds = uniqueStringList(
        (Array.isArray(menu?.referenceIds) ? menu.referenceIds : [referenceId])
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      );
      if (menu?.selected === true && actionReferenceIds.length > 1) {
        clearReferenceSelection();
        return;
      }
      toggleReferenceSelection(referenceId, { multiSelect: false });
      return;
    }
    const nodeId = String(menu?.nodeId || "").trim();
    if (!nodeId) {
      return;
    }
    const actionNodeIds = uniqueStringList(
      (Array.isArray(menu?.actionNodeIds) ? menu.actionNodeIds : [nodeId])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    );
    if (menu?.selected === true) {
      if (actionNodeIds.length > 1) {
        clearAssemblySelection();
        return;
      }
      removeSelectedAssemblyNode(nodeId);
      return;
    }
    togglePartSelection(nodeId, {
      renderPartId: String(menu?.renderPartId || "").trim(),
      source: "viewer"
    });
  }, [
    clearAssemblySelection,
    clearReferenceSelection,
    removeSelectedAssemblyNode,
    focusedAssemblyNodeIds,
    togglePartSelection,
    toggleReferenceSelection
  ]);

  const focusViewerContextMenuNode = useCallback((menu) => {
    const nodeId = String(menu?.nodeId || "").trim();
    if (!nodeId) {
      return;
    }
    if (menu?.focused === true) {
      handleExitSingleIsolate(nodeId);
      return;
    }
    const actionNodeIds = uniqueStringList(
      (Array.isArray(menu?.actionNodeIds) ? menu.actionNodeIds : [nodeId])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    );
    focusStepTreeNode(actionNodeIds);
  }, [
    focusStepTreeNode,
    handleExitSingleIsolate
  ]);

  const hideViewerContextMenuNode = useCallback((menu) => {
    const nodeId = String(menu?.nodeId || "").trim();
    if (!nodeId) {
      return;
    }
    const actionNodeIds = uniqueStringList(
      (Array.isArray(menu?.actionNodeIds) ? menu.actionNodeIds : [nodeId])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    );
    if (menu?.selected === true && actionNodeIds.length > 1) {
      handleHideSelectedParts();
      return;
    }
    for (const actionNodeId of actionNodeIds) {
      hideStepTreeNode(actionNodeId);
    }
  }, [handleHideSelectedParts, hideStepTreeNode]);

  const revealViewerContextMenuNode = useCallback((menu) => {
    const nodeId = String(menu?.nodeId || "").trim();
    if (!nodeId) {
      return;
    }
    const actionNodeIds = uniqueStringList(
      (Array.isArray(menu?.actionNodeIds) ? menu.actionNodeIds : [nodeId])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    );
    for (const actionNodeId of actionNodeIds) {
      revealHiddenStepTreeNode(actionNodeId);
    }
  }, [revealHiddenStepTreeNode]);

  const hideOtherViewerContextMenuNode = useCallback((menu) => {
    const nodeId = String(menu?.nodeId || "").trim();
    if (!nodeId) {
      return;
    }
    const actionNodeIds = uniqueStringList(
      (Array.isArray(menu?.actionNodeIds) ? menu.actionNodeIds : [nodeId])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    );
    handleHideOtherTreeNode(actionNodeIds);
  }, [handleHideOtherTreeNode]);

  const hideAllViewerContextMenuNodes = useCallback((menu) => {
    if (menu?.hidden === true) {
      handleShowAllHiddenParts();
      return;
    }
    handleHideAllParts();
  }, [
    handleHideAllParts,
    handleShowAllHiddenParts
  ]);

  // "Zoom to fit": frame the whole model again from where the camera looks now. It is
  // the viewport's one framing act — the live `resetCamera` command is the same call.
  const zoomToFitModel = useCallback(() => {
    if (!viewerRef.current?.resetZoom?.()) {
      reportActionError("CAD Viewer camera not ready");
    }
  }, []);

  // "Zoom to selection": frame what is selected right now, whichever menu asked and
  // whatever node it was asked over. The item is offered only where there IS a
  // selection, so finding nothing to frame here is a real failure and says so.
  const zoomToSelection = useCallback(() => {
    const ids = (list) => uniqueStringList(
      (Array.isArray(list) ? list : []).map((id) => String(id || "").trim()).filter(Boolean)
    );
    const partIds = ids(zoomSelectionRef.current.partIds);
    const referenceIds = ids(zoomSelectionRef.current.referenceIds);
    if (!(partIds.length || referenceIds.length)
      || !zoomToFitSelection({ partIds, referenceIds, animate: true })) {
      reportActionError("No geometry to fit");
    }
  }, []);

  const expandSelectedViewerContextMenuNodes = useCallback((menu) => {
    for (const nodeId of Array.isArray(menu?.collapsedActionNodeIds) ? menu.collapsedActionNodeIds : []) {
      toggleStepTreeNode(nodeId);
    }
  }, [toggleStepTreeNode]);

  const collapseSelectedViewerContextMenuNodes = useCallback((menu) => {
    for (const nodeId of Array.isArray(menu?.expandedActionNodeIds) ? menu.expandedActionNodeIds : []) {
      toggleStepTreeNode(nodeId);
    }
  }, [toggleStepTreeNode]);

  const expandAllViewerContextMenuNodes = useCallback((menu) => {
    for (const nodeId of Array.isArray(menu?.collapsedExpandableTreeNodeIds) ? menu.collapsedExpandableTreeNodeIds : []) {
      toggleStepTreeNode(nodeId);
    }
  }, [toggleStepTreeNode]);

  const collapseAllViewerContextMenuNodes = useCallback((menu) => {
    for (const nodeId of Array.isArray(menu?.expandedExpandableTreeNodeIds) ? menu.expandedExpandableTreeNodeIds : []) {
      toggleStepTreeNode(nodeId);
    }
  }, [toggleStepTreeNode]);


  /**
   * The actions behind the one part menu, wherever it was opened: the viewport
   * under Select, and a model tree row under any tool. A tree row's menu can
   * therefore ask for something the active tool cannot show, so every action
   * lands in Select first — exactly what clicking a tree row already does.
   */
  const partMenuActions = useMemo(() => Object.fromEntries(Object.entries({
    onCopyReference: copyViewerContextMenuReference,
    onSelect: selectViewerContextMenuNode,
    onIsolate: focusViewerContextMenuNode,
    onExitAllIsolate: handleExitIsolate,
    onHideOther: hideOtherViewerContextMenuNode,
    onHideAll: hideAllViewerContextMenuNodes,
    onHide: hideViewerContextMenuNode,
    onReveal: revealViewerContextMenuNode,
    onExpandSelected: expandSelectedViewerContextMenuNodes,
    onCollapseSelected: collapseSelectedViewerContextMenuNodes,
    onExpandAll: expandAllViewerContextMenuNodes,
    onCollapseAll: collapseAllViewerContextMenuNodes,
    onZoomFit: zoomToFitModel,
    onZoomSelection: zoomToSelection
  }).map(([name, action]) => [name, (menu) => { ensureSelectTool(); return action(menu); }])), [
    copyViewerContextMenuReference,
    selectViewerContextMenuNode,
    focusViewerContextMenuNode,
    handleExitIsolate,
    hideOtherViewerContextMenuNode,
    hideAllViewerContextMenuNodes,
    hideViewerContextMenuNode,
    revealViewerContextMenuNode,
    expandSelectedViewerContextMenuNodes,
    collapseSelectedViewerContextMenuNodes,
    expandAllViewerContextMenuNodes,
    collapseAllViewerContextMenuNodes,
    zoomToFitModel,
    zoomToSelection,
    ensureSelectTool
  ]);

  // The viewport's menu, asked for at the moment of a secondary tap under Select: resolve what
  // is under the press into the one menu descriptor (a part, a topology reference, or the model
  // as a whole), remember it so the part stays marked while the menu is up, and hand the shell
  // the entries. Nothing to offer is an empty answer, and the shell opens nothing.
  const viewportContextMenuItems = useCallback((press, referenceId) => {
    handleModelReferenceContext(referenceId, press);
    const menu = viewerContextMenuRef.current;
    return menu ? viewportMenuEntries(menu, { actions: partMenuActions }) : null;
  }, [handleModelReferenceContext, partMenuActions]);

  const handleSelectTabToolMode = useCallback((mode) => {
    // Measure activation is idempotent; clearing retained results is an explicit toolbar action.
    shellRef.current?.selectTool(mode);
    const normalizedMode = CAD_TOOL_MODES.normalize(mode);
    if (
      selectedEntry &&
      selectedEntryHasReferences &&
      normalizedMode === TAB_TOOL_MODE.MEASURE && topologyTarget
    ) {
      loadFilterTopology(topologyTarget);
    }
  }, [selectedEntry, selectedEntryHasReferences, topologyTarget, loadFilterTopology]);

  zoomSelectionRef.current = {
    partIds: viewerSelectedPartIds,
    referenceIds: selectedReferenceIds,
    available: Boolean(viewerSelectedPartIds.length || selectedReferenceIds.length)
  };

  // What Escape means in this renderer, innermost first: the box Ask opened, the bar beside a feature
  // chosen, a measurement in progress, then the Measure tool, then the selection, then isolation.
  escapeRef.current = () => {
    if (asked) { clearAsked(); return true; }
    if (featureBarShown) { dropFeature(); return true; }
    // A command's dialog open: cancelled, and what it picked let go with it.
    if (edit.command && !edit.sketch) { edit.close(); clearAssemblySelection(); return true; }
    // Escape cancels the measurement in progress and leaves the tool armed, the way it does in a CAD
    // measure tool. Only once there is nothing to cancel does it leave the tool.
    if (!previewing && tabToolMode === TAB_TOOL_MODE.MEASURE && measure.drafting) { measure.cancelDraft(); return true; }
    // Then the tool in hand, whatever it is: Escape puts it down and takes Select up, what it set
    // (an explosion, a cut, the ink, a paused frame) kept.
    if (!previewing && tabToolMode !== TAB_TOOL_MODE.REFERENCES) { shellRef.current?.selectTool(TAB_TOOL_MODE.REFERENCES); return true; }
    // Then what Select has picked: measurements, then the parts and references.
    if (measure.selected.length > 0) { measure.select([]); return true; }
    // As the selection stands NOW (its refs move with every pick, before the render that shows it), so
    // an Escape right after a pick lets go of it rather than finding the last render's empty selection.
    if (selectedPartIdsRef.current.length > 0 || selectedReferenceIdsRef.current.length > 0) { clearAssemblySelection(); return true; }
    // Then isolation: Escape backs out one layer at a time, selection first.
    if (focusedAssemblyNodeIds.length > 0) { handleExitIsolate(); return true; }
    return false;
  };

  // ---- the live surface ---------------------------------------------------------------------
  // App tools bind to this actual mounted viewport, never catalog metadata. The shell owns the
  // binding; these are the fields and commands only a STEP has.
  stepLiveStateRef.current = () => {
    const displayedResource = displayedResourceRef.current;
    return {
      // The selection in the PROMPT grammar, as the live contract reads it: the references a
      // snapshot would carry, each a selector of (or the whole of) the document on screen.
      // `promptReferencesRef` holds them in this renderer's own vocabulary, which only
      // `createCadPromptContext` speaks.
      selection: promptReferencesRef.current().map(reference => ({
        resource: { ...displayedResource },
        target: reference.selector ? { kind: 'cad-selector', selectors: reference.selector.split(',') } : { kind: 'whole-resource' },
        ...(reference.label ? { label: reference.label } : {})
      })),
      loading: Boolean(viewerLoading || stepInteractionBlocked),
      selectedPartIds: [...viewerSelectedPartIds],
      selectedReferenceIds: [...selectedReferenceIdsRef.current],
      hiddenPartIds: [...hiddenPartIds], isolatedPartIds: [...isolatedAssemblyNodeIds],
      resource: { ...displayedResource }, revision: String(displayedResource.revision || '')
    };
  };
  // What a snapshot depicts: the references the selection resolves to, in this renderer's own
  // vocabulary (`createCadPromptContext` speaks it).
  promptReferencesRef.current = () => referencesForHost(canonicalCopySelectionLines.join("\n"));
  stepLiveCommandsRef.current = {
    select({ selectors, replace = true }) {
      const names = uniqueStringList(selectors.flatMap(selector => String(selector).split(',').map(value => value.trim())).filter(Boolean));
      if (!names.length) throw new Error('Choose at least one CAD selector.');
      const selections = names.map(selector => resolveSelectorSelection(selector, {
        referenceMap: effectiveActiveReferenceMap, treeRoot: displayStepTreeRoot || stepTreeRoot,
      }));
      const missing = names.filter((_name, index) => !selections[index]);
      if (missing.length) throw new Error(`Selectors are unavailable in the displayed revision: ${missing.join(', ')}. Expand their model tree entries to load topology.`);
      if (isAssemblyView && selections.some(selection => selection.kind === 'part' && !validAssemblySelectionIdSet.has(selection.id))) {
        throw new Error('The requested assembly selection is unavailable in the displayed model.');
      }
      const parts = uniqueStringList([...(replace ? [] : selectedPartIdsRef.current), ...selections.filter(selection => selection.kind === 'part').map(selection => selection.id)]);
      const references = uniqueStringList([...(replace ? [] : selectedReferenceIdsRef.current), ...selections.filter(selection => selection.kind === 'reference').map(selection => selection.id)]);
      setSelectedPartIds(parts);
      setSelectedReferenceIds(references);
      setSelectedRenderPartIdByAssemblyPartId(current => Object.fromEntries(parts.map(id => [id, renderPartIdForAssemblySelection(id, current[id])]).filter(([, id]) => id)));
      const last = selections[selections.length - 1];
      revealStepTreeNode(last.kind === 'part' ? last.id : findStepTreeTopologyNodeIdForReference(displayStepTreeRoot, last.id) || referencePartId(effectiveActiveReferenceMap.get(last.id)), { source: 'reference' });
    },
    clearSelection() {
      setSelectedPartIds([]);
      setSelectedRenderPartIdByAssemblyPartId({});
      clearReferenceSelection();
    }
  };

  const selectionToolActive = tabToolMode === TAB_TOOL_MODE.REFERENCES;
  const selectionCount = selectedReferences.length + selectedParts.length
    + (!isAssemblyView && selectedPartIds.includes(STEP_MODEL_ROOT_ID) ? 1 : 0);
  // A file of one part -- a part file, or an assembly of one -- has nothing to choose before its
  // faces and edges: they load once Select is up, once per revision, so a pick reaches them in
  // every mode.
  const onlyPartId = useMemo(() => {
    if (!isAssemblyView) return STEP_MODEL_ROOT_ID;
    const leaves = flattenAssemblyLeafParts(assemblyRoot);
    return leaves.length === 1 ? String(leaves[0].id || "") : "";
  }, [isAssemblyView, assemblyRoot]);
  const loadedOnlyPart = useRef("");
  useEffect(() => {
    const key = `${selectedKey}:${artifactRevision}:${onlyPartId}`;
    if (!onlyPartId || loadedOnlyPart.current === key || !selectionToolActive || previewing
      || viewerLoading || assemblyTreeLoading || stepInteractionBlocked) return;
    loadedOnlyPart.current = key;
    loadInspectionTopology([onlyPartId]);
  }, [selectedKey, artifactRevision, onlyPartId, selectionToolActive, previewing, viewerLoading, assemblyTreeLoading,
    stepInteractionBlocked, loadInspectionTopology]);
  // Every CAD format shares the View settings and camera contract.

  // A mated child's label names its parts, and the mesh here is the model at
  // rest (the viewer poses display records, never this data): the child's centre.
  const stepPoseSelectorRuntime = selectedStepParameterRuntime?.selectorRuntime || null;
  const stepPoseFeatures = useMemo(() => (stepPoseDefinition && positionShown
    ? resolveStepModuleFeatures(stepPoseDefinition, { meshData: selectedMeshData, selectorRuntime: stepPoseSelectorRuntime })
    : null), [stepPoseDefinition, positionShown, selectedMeshData, stepPoseSelectorRuntime]);
  // The knobs are drawn at the pose's joints, on parts at rest: an explosion or a routine's frame
  // has moved those parts, so while either is on the model there are no knobs (Position's sidebar
  // controls stay, and reaching for them puts the other motion back at rest).
  const knobsShown = positionShown && !explodeApplied && !animationOwnsPose;
  const jointHandles = useMemo(() => {
    if (!knobsShown || !selectedStepParameterRuntime) return null;
    const write = motion.onParameterChange;
    return stepJointHandles({
      definition: stepPoseDefinition,
      parameterValues: selectedStepParameterRuntime.parameterValues,
      features: stepPoseFeatures,
      // A knob dragged sets Position: the motion hook puts the routine at rest and the host takes
      // Explode and Clip off.
      onParameterChange: write
    });
  }, [knobsShown, stepPoseDefinition, selectedStepParameterRuntime, stepPoseFeatures, motion.onParameterChange]);

  // ---- edit mode ------------------------------------------------------------------------------
  // A model with a part script beside it is edited here (`edit/`): the script's history and named
  // sizes in a design tree at the viewer's left, the selected feature's dimensions on the model,
  // and the tools in a ribbon across the top. A model with none keeps the view as it is. While a
  // sketch is edited (`edit/SketchOverlay.jsx`) the model is not picked: presses are the sketch's,
  // but for Convert Entities, which picks the model's edges (Smart Dimension asks after them).
  // How a part script's model is laid out (`edit/editLayout.js`, one of the tab's settings, switched
  // in the navbar): for modeling it by hand, or for asking the AI, which is the view as it is. Laid
  // out for the AI, the part is not read.
  const [editLayout, setEditLayout] = useEditLayout(services);
  // A host that switches the layout itself (Studio's Simple view) leaves the navbar without the switch.
  const layoutHosted = useSyncExternalStore(editLayoutHost.subscribe, editLayoutHost.get, editLayoutHost.get);
  const edit = useEditMode({ client, file: selectedEntry?.file || "", active: !viewerLoading, reading: editLayout === "manual" });
  const commandOpenNow = Boolean(edit.command && !edit.sketch);
  useEffect(() => { setCommandHeld(commandOpenNow); }, [commandOpenNow]);
  // Laid out for editing only once the server says the file has a part script, and only by hand; a
  // command, sketch or pick open, or a change being saved, holds the switch (`layoutHeld`).
  const { editable, busy: layoutHeld } = editLayoutState(edit);
  const editing = editable && editLayout === "manual";
  // A command, a sketch or a plane being waited for, a panel the toolbar opened, or the drawing's sheet over the part: the selection
  // bar stays out of them. The feature selected is a pick for the bar only once the person has chosen it (`useChosenFeature`).
  const commandOpen = Boolean(edit.command || edit.picking || edit.inspecting || edit.sheetView);
  const sketchOpen = Boolean(edit.sketch);
  const { chosen: featureChosen, choose: chooseFeature, drop: dropFeature } = useChosenFeature({ editing,
    held: commandOpen || sketchOpen, file: selectedKey });
  backgroundClickRef.current = dropFeature;
  // The host's switch hears what the navbar's hangs on, and nothing once this part leaves the
  // screen. A picture drawn out of sight for the library (`compact`) is not the part on screen.
  const reportsEditState = !view.appearance?.compact;
  useEffect(() => {
    if (reportsEditState) editLayoutHost.reportEditState({ editable, busy: layoutHeld });
  }, [reportsEditState, editable, layoutHeld]);
  useEffect(() => (reportsEditState ? () => editLayoutHost.reportEditState(null) : undefined), [reportsEditState]);
  // Where on the model a click lands, for a hole to go there or an extrude to end at an edge's end.
  holePointRef.current = editing && ["hole", "extrude", "cut"].includes(edit.command) ? edit.setFacePoint : null;
  keepFaceRef.current = editing && edit.command === "hole";
  // Picks add up for a command that takes many, and for Mate's two.
  choosingManyRef.current = editing && !edit.sketch && (Boolean(editCommand(edit.command)?.many) || edit.inspecting === "mate");
  // A pick the open command's panel lists, taken out by its X.
  const deselectReference = useCallback(id => setSelectedReferenceIds(current => current.filter(each => each !== id)), [setSelectedReferenceIds]);
  // The place beside the design tree, at the view's top-left, where an open command's or sketch's
  // panel floats in a card of its own (`edit/EditBrowser.jsx`); the frame draws it (`dialogPlace`).
  const [commandCard, setCommandCard] = useState(null);
  useEditShortcuts(edit, editing);
  const editNames = useMemo(() => featureNames(edit.state?.rows || EMPTY_LIST), [edit.state?.rows]);
  const editTree = useMemo(() => featureTree(edit.state), [edit.state]);
  // A host that opens the part at a line of its script (Studio's References) has the feature there selected once the
  // part is read (`edit/useHostFocus.js`); not by the library's out-of-sight picture, which is not the part on screen.
  useHostFocus({ onScreen: reportsEditState, layout: editLayout, status: edit.status, tree: editTree, select: edit.select });
  // The rollback bar's body in place of the part's, while edit mode has the bar up.
  const barTree = editing && edit.bar?.tree ? edit.bar.tree : null;
  const barKind = edit.bar?.kind === "assembly" ? "assembly" : "part";
  useEffect(() => { setRollbackTree(barTree ? { tree: barTree, kind: barKind } : null); }, [barTree, barKind]);
  // Which feature made each face on screen, as the engine says (`edit/faceChips.js`): the part's map, where the model on screen is the
  // one it was read for: not while the rollback bar's body is drawn in its place, nor while a new one loads, nor while the build feed
  // has its STEP being built again or failed, nor where the faces on screen are not as many. A face's chip and the selection bar's Edit
  // go by it.
  const facesOnScreen = selectedSelectorRuntime?.faces?.length || 0;
  const feed = editingPreview.state;
  const rebuilding = editingBuildActive(feed) || (feed.state === "failed" && feed.superseded !== true);
  const faceState = useMemo(() => shownFaces({ editing, assembly: isAssemblyView, state: edit.state, bar: edit.bar,
    updating: viewerLoading || stepUpdateInProgress, rebuilding, faces: facesOnScreen }),
  [editing, isAssemblyView, edit.state, edit.bar, viewerLoading, stepUpdateInProgress, rebuilding, facesOnScreen]);
  const partFeatures = editTree.assembly ? EMPTY_LIST : editTree.features;
  faceNameRef.current = reference => faceChipName(reference, faceState, partFeatures);
  const nameFace = useCallback(item => faceChipName(faceReference(item?.displaySelector || item?.normalizedSelector), faceState, partFeatures),
    [faceState, partFeatures]);
  // A feature below the bar is not on the model: its dimensions are not drawn.
  const editDimensions = useMemo(() => (edit.status === "ready" && !edit.sketch && !rolledBack(editTree, edit.bar).has(edit.selected)
    ? selectionDimensions(edit.state, editTree, edit.selected) : EMPTY_LIST),
  [edit.status, edit.state, editTree, edit.selected, edit.sketch, edit.bar]);
  // A plane or the origin the design tree selects, or has under its pointer, drawn on the model;
  // all three while the Sketch command waits for one.
  const editPlanes = useMemo(() => {
    // A reference Plane of the tree, drawn where it is as the origin's planes are.
    const referencePlane = id => treeFeatures(editTree).find(feature => feature.id === id && feature.kind === "Plane" && feature.plane)?.plane;
    const planes = (edit.sketch ? [] : [...(edit.picking ? ORIGIN_PLANES.map(plane => [`plane:${plane}`, false]) : []),
      [edit.selected, true], [edit.hovered, false]]).flatMap(([id, strong]) => {
      const reference = typeof id === "string" && !id.startsWith("plane:") ? referencePlane(id) : null;
      const points = typeof id === "string" && id.startsWith("plane:") ? planeOutline(id.slice("plane:".length), edit.state?.bounds)
        : reference ? mirrorOutline({ center: reference.origin, normal: reference.z }, edit.state?.bounds) : null;
      return points ? [{ points, strong }] : [];
    });
    // Mirror's plane, while its panel is open: the one it mirrors about; a draft's neutral plane; a new reference plane.
    const mark = edit.preview?.mark;
    const mirrored = ((edit.command === "mirror" || edit.command === "split") && mark === "mirror") || (edit.command === "draft" && mark === "draft")
      || (edit.command === "plane" && mark === "plane") ? mirrorOutline(edit.preview, edit.state?.bounds) : null;
    return mirrored ? [...planes, { points: mirrored, strong: true }] : planes;
  }, [edit.selected, edit.hovered, edit.picking, edit.sketch, edit.state?.bounds, edit.command, edit.preview, editTree]);
  const editOrigin = !edit.sketch && (edit.selected === "origin" || edit.hovered === "origin") ? originAxis(edit.state?.bounds) : null;
  // Normal To outside a sketch, as SolidWorks' Ctrl+8 turns the view: to look straight at the one
  // flat face selected on the model, or the plane selected in the design tree.
  const normalTarget = useMemo(() => {
    if (!editing || edit.sketch) return null;
    const faces = selectedReferences.filter(reference => reference?.selectorType === "face");
    const face = faces.length === 1 && faces[0].pickData?.surfaceType === "plane" && faces[0].pickData?.normal?.length === 3 ? faces[0].pickData : null;
    if (face) return Array.from(face.normal, Number);
    const origin = typeof edit.selected === "string" && edit.selected.startsWith("plane:")
      ? { Top: [0, 0, 1], Front: [0, -1, 0], Right: [1, 0, 0] }[edit.selected.slice("plane:".length)] : null;
    return origin || treeFeatures(editTree).find(feature => feature.id === edit.selected && feature.kind === "Plane")?.plane?.z || null;
  }, [editing, edit.sketch, selectedReferences, edit.selected, editTree]);
  const normalTargetRef = useRef(normalTarget);
  normalTargetRef.current = normalTarget;
  useEffect(() => {
    const normal = normalTargetRef.current;
    const runtime = runtimeRefRef.current?.current;
    if (!edit.normalTo || edit.sketch || !normal || !runtime?.THREE || !runtime.modelGroup) return;
    const { THREE, modelGroup } = runtime;
    modelGroup.updateMatrixWorld();
    const origin = new THREE.Vector3(0, 0, 0).applyMatrix4(modelGroup.matrixWorld);
    const toward = axis => new THREE.Vector3(...axis).applyMatrix4(modelGroup.matrixWorld).sub(origin).normalize().toArray();
    if (transitionCameraToViewPreset(runtime, { direction: toward(normal), up: toward(Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]) })) {
      runtime.userMovedCamera = true;
      requestSceneFrame(runtime, false);
    }
    // Once per Normal To asked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit.normalTo]);
  // A standard view asked from the keyboard (Ctrl+1 to Ctrl+7), turned to as the view cube turns to its faces.
  useEffect(() => {
    const view = STANDARD_VIEWS[edit.standardView?.name];
    const runtime = runtimeRefRef.current?.current;
    if (!view || !runtime?.THREE || !runtime.modelGroup) return;
    const { THREE, modelGroup } = runtime;
    modelGroup.updateMatrixWorld();
    const origin = new THREE.Vector3(0, 0, 0).applyMatrix4(modelGroup.matrixWorld);
    const toward = axis => new THREE.Vector3(...axis).applyMatrix4(modelGroup.matrixWorld).sub(origin).normalize().toArray();
    if (transitionCameraToViewPreset(runtime, { direction: toward(view.direction), up: toward(view.up) })) {
      runtime.userMovedCamera = true;
      requestSceneFrame(runtime, false);
    }
    // Once per view asked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit.standardView?.tick]);
  // Mass Properties' center of mass, marked on the model while its card is open.
  const massCenter = edit.mass?.center;
  const massMark = useMemo(() => (massCenter ? { mark: "center", at: massCenter } : null), [massCenter]);
  // A modeling command opens with Select in hand, its mode turned to what the command picks (a
  // fillet's edges, a hole's face) and the part's faces and edges loaded to be picked, keeping
  // what is already selected: picked first, then Fillet.
  const startEditCommand = id => {
    // Pattern takes its direction from an edge picked while it is open, and a circular one its
    // axis from an edge or a round face; an extrude ends on a face or an edge's vertex: both are
    // pickable.
    const picks = editCommand(id)?.picks || (id === "pattern" || editCommand(id)?.sketch || editCommand(id)?.sketches ? "all" : null);
    if (picks) {
      changeSelectMode(picks);
      if (!isAssemblyView) loadInspectionTopology();
    }
    handleSelectTabToolMode(TAB_TOOL_MODE.REFERENCES);
    edit.open(id);
  };
  // Sketch, as SolidWorks' Sketch button: on the plane or the flat face already selected, or
  // waiting for one (the origin's planes drawn, the model's faces pickable); with a sketch
  // selected in the tree, Edit Sketch.
  const selectedTreeSketch = treeSketch(editTree, edit.selected);
  const openTreeSketch = sketch => {
    const view = sketchView(edit.state, sketch);
    edit.openSketch(view || { error: notASketch(sketch.title), redraw: { title: sketch.title, file: sketch.file, line: sketch.line } });
  };
  const sketchOnPlane = plane => void edit.startSketch(plane, nextSketchName(editTree), edit.planeOffset);
  // A reference Plane of the tree, selected: a sketch goes on it by its line.
  const selectedReferencePlane = treeFeatures(editTree).find(feature => feature.id === edit.selected && feature.kind === "Plane") || null;
  const startSketchCommand = () => {
    if (selectedTreeSketch) { openTreeSketch(selectedTreeSketch); return; }
    if (typeof edit.selected === "string" && edit.selected.startsWith("plane:")) { sketchOnPlane(edit.selected.slice("plane:".length)); return; }
    if (selectedReferencePlane) { sketchOnPlane({ feature: selectedReferencePlane.id }); return; }
    const faces = selectionItems(selectedReferences).filter(item => /f\d+$/.test(item.selector));
    if (faces.length === 1 && faces[0].type === "plane") { sketchOnPlane(faces[0]); return; }
    changeSelectMode("faces");
    if (!isAssemblyView) loadInspectionTopology();
    handleSelectTabToolMode(TAB_TOOL_MODE.REFERENCES);
    edit.startPicking();
  };
  // While Sketch waits: a plane picked in the tree, or one flat face on the model, starts the sketch.
  const pickedFaces = edit.picking ? selectionItems(selectedReferences).filter(item => /f\d+$/.test(item.selector)) : EMPTY_LIST;
  const pickedFace = pickedFaces.length === 1 && pickedFaces[0].type === "plane" ? pickedFaces[0] : null;
  useEffect(() => {
    if (!edit.picking || edit.saving) return;
    if (typeof edit.selected === "string" && edit.selected.startsWith("plane:")) sketchOnPlane(edit.selected.slice("plane:".length));
    else if (selectedReferencePlane) sketchOnPlane({ feature: selectedReferencePlane.id });
    else if (pickedFace) sketchOnPlane(pickedFace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit.picking, edit.selected, pickedFace?.selector]);
  // The sketches drawn on the model while none is edited: those nothing uses yet, the one selected
  // in the tree, and the one an extrude or a revolve previews (a reopened feature's own).
  const previewedSketch = edit.preview?.file ? edit.preview : null;
  const previewedSketches = edit.preview?.mark === "picked" ? edit.preview.sketches : null;
  const shownSketches = useMemo(() => (edit.sketch ? EMPTY_LIST : (edit.state?.sketches || EMPTY_LIST).filter(view => view.state
    && (view.consumed === null || (selectedTreeSketch && view.file === selectedTreeSketch.file && view.line === selectedTreeSketch.line)
      || (previewedSketch && view.file === previewedSketch.file && view.line === previewedSketch.line)
      || (previewedSketches || []).some(each => view.file === each.file && view.line === each.line)))),
  [edit.sketch, edit.state?.sketches, selectedTreeSketch, previewedSketch, previewedSketches]);
  // Open Part, on a part of an assembly: its own model shown in this view, to be modeled there (an
  // assembly places its parts; commands act on a part). A host that shows one file alone has none.
  const openFile = host?.navigation?.openFile;
  const editFile = selectedEntry?.file || "";
  const assemblyTitle = sizeName(edit.state?.name || "");
  const openPart = useMemo(() => (openFile ? component => {
    if (!component?.step) return;
    rememberOpenedFrom(services, component.step, { file: editFile, title: assemblyTitle || "the assembly" });
    openFile(component.step);
  } : null), [openFile, editFile, assemblyTitle, services]);
  // A part opened from its assembly leads back to it (the tab's settings keep where it came from).
  const backTo = useMemo(() => {
    const from = openFile ? openedFrom(services.preferences, editFile) : null;
    return from ? { title: from.title, open: () => openFile(from.file) } : null;
  }, [openFile, editFile, services.preferences]);
  // Edit Feature on a fillet, a chamfer, a shell or a hole rolls the part back to just before it:
  // Select is in hand, turned to what the feature picks, so others can be picked on that body.
  const repickKey = edit.editing?.rolled ? edit.editing.id : "";
  useEffect(() => {
    const picks = repickKey ? editCommand(edit.editing.command)?.picks : null;
    if (!picks) return;
    clearAssemblySelection();
    changeSelectMode(picks);
    if (!isAssemblyView) loadInspectionTopology();
    handleSelectTabToolMode(TAB_TOOL_MODE.REFERENCES);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repickKey]);
  // A sketch opened: what was selected on the model is let go, as the sketch takes the presses.
  const sketchKey = edit.sketch ? `${edit.sketch.file}:${edit.sketch.line}` : "";
  useEffect(() => { if (sketchKey) clearAssemblySelection(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sketchKey]);
  // Convert Entities picks the model's edges and faces with the sketch open, as SolidWorks' does:
  // the model takes the presses again, its faces and edges loaded to be picked; leaving the tool
  // lets what was picked go.
  const converting = Boolean(edit.sketch) && edit.sketchTool === "convert";
  // Smart Dimension takes the model's edges too, as SolidWorks dimensions to them: they light as the
  // pointer passes, and a press on one is still the sketch's, which asks what edge is under it.
  const dimensioning = Boolean(edit.sketch) && edit.sketchTool === "dimension";
  // Mate picks the parts' faces and edges, as SolidWorks' Mate Selections take them: an
  // assembly's part has its faces loaded when it is pressed.
  const mating = editing && edit.inspecting === "mate";
  useEffect(() => {
    if (!converting && !dimensioning && !mating) return undefined;
    changeSelectMode(converting ? "all" : mating ? "topology" : "edges");
    if (!isAssemblyView) loadInspectionTopology();
    handleSelectTabToolMode(TAB_TOOL_MODE.REFERENCES);
    return () => clearAssemblySelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [converting, dimensioning, mating]);
  // The model's edge under a point of the screen, as an edit item (`selectionItems`), or null.
  const modelEdgeAt = useCallback((clientX, clientY) => {
    const reference = effectiveActiveReferenceMap.get(pickAtRef.current?.(clientX, clientY) || "");
    return reference?.selectorType === "edge" ? selectionItems([reference])[0] || null : null;
  }, [effectiveActiveReferenceMap]);

  // ---- the viewport ---------------------------------------------------------------------------
  // What the viewport is ALLOWED to show and pick just now: nothing of the model under Pose
  // or in preview; no topology while a previous mesh is held over an update.
  const topologySelectionDeferred = Boolean(selectedTopologyDeferredByCost && selectedMeshData);
  // A routine playing is watching. Position's knobs share Select with its picks: a press on a knob is
  // the knob's (`useJointHandles`), anywhere else a pick. While a sketch is edited the presses are the
  // sketch's (`edit/SketchOverlay.jsx`), but for Convert Entities, which picks the model's edges; Smart
  // Dimension lights them for the sketch to ask after.
  const watching = viewportAnimation?.playing === true || (Boolean(edit.sketch) && !converting && !dimensioning);
  const pickMode = watching || retainingPreviousStepMesh ? VIEWER_PICK_MODE.NONE : viewerPickModeForRenderPane({
    selectionFilter,
    topologySelectionPending: referenceSelectionPending,
    topologySelectionUnavailable: referenceSelectionUnavailable,
    topologySelectionDeferred,
    topologyPickingActive: Boolean(viewerPickableFacesForTool.length || viewerPickableEdgesForTool.length),
    viewerMode,
    assemblyPickingActive: viewerInAssemblyMode,
    focusedPartIds: focusedAssemblyRenderPartIds,
    measureMode: measureModeActive
  });
  // One shared empty list: a fresh [] per render — per animation frame — invalidated the
  // layers' pickable memos and reference map.
  const pickable = list => (!retainingPreviousStepMesh && !watching ? list : EMPTY_LIST);
  // Part-state lists pass through by IDENTITY: what reaches the layers is already stable for as
  // long as its contents hold, because every one of them is derived through a memo above.
  const toolsWork = {
    stepParameterRuntime: selectedStepParameterRuntime,
    hiddenPartIds: viewerHiddenPartIdsForRenderPane({ inspectionEnabled: true, hasParts: true, hiddenPartIds: hiddenPartIds }),
    focusedPartIds: focusedAssemblyRenderPartIds,
    selectedPartIds: viewerSelectedPartIdsForRenderPane({ hasParts: true, selectedPartIds: viewerSelectedPartIds }),
    selectedReferenceIds: !retainingPreviousStepMesh ? selectedReferenceIds : EMPTY_LIST,
    // Hover is not a prop: the layers subscribe to it and resolve it through the surface.
    resolveHover: resolveViewerHover,
    jointHandles,
    measureState: measure.state,
    activeMeasurementId: measure.activeId,
    selectedMeasurementIds: measure.selected,
    hoveredMeasurementId: measure.hovered,
    measureModeActive,
    onHoverReferenceChange: handleModelHoverChange,
    onActivateReference: handleModelReferenceActivate,
    onDoubleActivateReference: handleModelReferenceDoubleActivate,
    onMeasurePick: handleMeasurePick,
    onMeasureHoverPoint: measure.onHoverPoint,
    onMeasureWantsTopology: handleMeasureWantsTopology
  };
  const layerProps = {
    ...toolsWork,
    meshData: selectedDisplayMeshData,
    modelKey: selectedKey,
    isLoading: viewportIsLoading,
    renderMode: resolvedScene.render.enabled,
    renderConfiguration: resolvedScene.render.configuration,
    appearance: resolvedScene.appearance,
    materialOverrides: resolvedMaterialOverrides,
    receiveShadows: resolvedScene.view.lighting.enabled,
    pickMode,
    measureSnaps: measureFilter,
    pickableParts: !retainingPreviousStepMesh ? viewerAssemblyRenderParts : EMPTY_LIST,
    hoverStore,
    selectorRuntime: viewerSelectorRuntimeForRenderPane({ hasTopology: true,
      retainingPreviousStepMesh: retainingPreviousStepMesh, selectorRuntime: effectiveSelectorRuntime }),
    // {clip, elapsedSec, playing} or null. Null means no clip is selected, and the evaluator never runs.
    // Preview's routine is its own (`kit/shell/useRendererShell.js`), never the tools view's.
    stepAnimationRuntime: selectedAnimationRuntime,
    // Nothing is picked and a routine may own the pose: pick-only state stands still (`useStepPose`).
    animateMode: watching,
    onLodCameraChange: onLodCameraMoved,
    onMeshSourceAdoption: handleDisplayMeshAdoption,
    onViewerAlertChange: handleViewerAlertChange,
    // Under another tool a pick takes up Select (`ensureSelectTool`): it waits the double-click
    // window first, so a double-click there isolates and leaves the tool as it was.
    deferActivation: !selectionToolActive,
    pickAtRef,
    pointAtRef,
    topologyAtRef,
    measureAtRef
  };
  const viewPolicyResolved = useStepViewPolicy({
    meshData: selectedDisplayMeshData, themeSettings: resolvedThemeSettings, displaySettings: resolvedScene.display,
    renderMode: resolvedScene.render.enabled, renderConfiguration: resolvedScene.render.configuration,
    renderPartsIndividually: Boolean(selectedStepParameterRuntime) || Boolean(selectedAnimationRuntime) ||
      Boolean(Object.keys(selectedDisplayMeshData?.appearance?.materials || {}).length) ||
      Boolean(selectedStepParameterRuntime?.definition) || Boolean(selectedAnimationRuntime?.clip),
    pickMode, pickableParts: layerProps.pickableParts,
    pickableFaces: pickable(viewerPickableFacesForTool), pickableEdges: pickable(viewerPickableEdgesForTool),
    hiddenPartIds: layerProps.hiddenPartIds, selectedPartIds: layerProps.selectedPartIds,
    focusedPartId: layerProps.focusedPartIds,
    // Modeling by hand, a pick on the model is the workspace's orange; Simple view's ai layout keeps the viewer's own.
    selectionColor: editing ? WORKSPACE_SELECTION_COLOR : null
  });
  lodSelectedPartIdsRef.current = layerProps.selectedPartIds;

  // ---- the strip ------------------------------------------------------------------------------
  const selectDisabled = viewerLoading || !selectedMeshData || referenceSelectionPending ||
    referenceSelectionUnavailable || topologySelectionDeferred;
  const toolIdle = viewerLoading || !selectedMeshData;
  const modelEffects = useModelTools({ view: desiredScene.view,
    features: viewFeatures, store: viewSettingsStore, mesh: selectedDisplayMeshData,
    disabled: toolIdle, selectedTool: tabToolMode, onSelect: handleSelectTabToolMode });
  // What Select picks, and its options: a chevron after its button on the strip, whose menu takes the
  // tool up as it changes the filter. One element until what it shows changes.
  const selectModeMenu = useMemo(() => <SelectModeMenu value={selectFilter} assembly={isAssemblyView} posable={poseAvailable} disabled={selectDisabled}
    onChange={value => { changeSelectFilter(value); handleSelectTabToolMode(TAB_TOOL_MODE.REFERENCES); }}
    connected={connectedSelection} onConnectedChange={(id, checked) => setConnectedSelection(current => ({ ...current, [id]: checked }))} />,
  [selectFilter, isAssemblyView, poseAvailable, selectDisabled, connectedSelection, changeSelectFilter, handleSelectTabToolMode]);
  // What Measure snaps to: its chevron's filter, whose change takes Measure up, as Select's does Select.
  const measureFilterMenu = useMemo(() => <MeasureFilterMenu value={measureFilter} disabled={measureToolDisabled} modes={STEP_MEASURE_MODES}
    onChange={value => { setMeasureFilter(value); handleSelectTabToolMode(TAB_TOOL_MODE.MEASURE); }} />,
  [measureFilter, measureToolDisabled, handleSelectTabToolMode]);
  // Every tool drawn by the icon generator (`edit/cadIcons.jsx`), the shell's and the model effects' too,
  // each showing what it has in hand: Select's and Measure's filter, the tool Pencil or Shapes draws with.
  // The toolbar shows these tools as the strip does.
  const tools = [
    shell.tools.own({
      id: TAB_TOOL_MODE.REFERENCES,
      label: referenceSelectionPending ? "Preparing selection" : "Select", shortcut: TOOL_SHORTCUTS.select,
      // The pointer, on what it picks alone (its chevron's menu): a block for All.
      icon: <ToolIcon id={TAB_TOOL_MODE.REFERENCES} mode={pickModeOf(selectFilter, stepSelectModes({ assembly: isAssemblyView, posable: poseAvailable })).id} className="size-3.5" />,
      active: !topologySelectionDeferred && selectionToolActive, disabled: selectDisabled,
      menu: selectModeMenu,
      onSelect: () => handleSelectTabToolMode(TAB_TOOL_MODE.REFERENCES),
    }),
    ...shell.tools.drawing.map(tool => ({ ...tool, disabled: toolIdle,
      icon: <ToolIcon id={tool.id} mode={drawingToolVariant(tool.id, shell.frame.annotation)} className="size-3.5" /> })),
    shell.tools.own({ id: TAB_TOOL_MODE.MEASURE, label: "Measure", shortcut: TOOL_SHORTCUTS.measure,
      icon: <ToolIcon id={TAB_TOOL_MODE.MEASURE} mode={pickModeOf(measureFilter, STEP_MEASURE_MODES).id} className="size-3.5" />,
      active: tabToolMode === TAB_TOOL_MODE.MEASURE, disabled: measureToolDisabled,
      menu: measureFilterMenu,
      // A press takes it up — again, results and all, where they are kept — and does nothing while
      // it is the tool.
      onSelect: () => { if (tabToolMode !== TAB_TOOL_MODE.MEASURE) handleSelectTabToolMode(TAB_TOOL_MODE.MEASURE); } }),
    // Position is Select's: its knobs, where Select picks it. Routines play in preview.
    ...modelEffects.tools.map(tool => ({ ...tool, icon: <ToolIcon id={tool.id} className="size-3.5" /> })),
  ].filter(Boolean);

  // ---- copying the selection ----------------------------------------------------------------
  // The copy key, under Select, while the selection's references can be read; Quick Edit attaches
  // them only then, too.
  // Not while rolled back: the faces and edges picked are the rolled-back body's, not the file's.
  const selectionActionVisible = selectionCount > 0 && !stepUpdateInProgress && !referenceSelectionPending
    && !referenceSelectionUnavailable && !topologySelectionDeferred && !rollbackTree;
  const copySelection = selectionActionVisible ? copySelectedReferences : null;
  // What is selected, as Quick Edit's chips: a chip's X drops its picks, and resting on it lights
  // them — a face or edge by its reference, a part, a subassembly or a run on one part by its node.
  const removeFromSelection = useCallback(ids => {
    const gone = new Set(ids);
    setSelectedReferenceIds(current => current.filter(id => !gone.has(id)));
    setSelectedPartIds(current => current.filter(id => !gone.has(id)));
  }, [setSelectedReferenceIds, setSelectedPartIds]);
  // What a chip copies: its picks' references, as Copy References writes the whole selection.
  const chipCopyText = useCallback(ids => {
    const referenceIds = ids.filter(id => selectedReferenceIds.includes(id));
    const partIds = ids.filter(id => selectedPartIds.includes(id));
    return copyTextLines(selectionCopyPayload(copyContext, { referenceIds, partIds }).lines, fileRefPrefix).join("\n");
  }, [copyContext, fileRefPrefix, selectedReferenceIds, selectedPartIds]);
  const hoverChip = useCallback(target => {
    setHoveredModelReferenceId(target?.referenceId || "");
    setHoveredListPartId(target?.nodeId || "");
  }, [setHoveredModelReferenceId, setHoveredListPartId]);
  const referenceChips = useStepSelectionChips({ stepTreeRoot: displayStepTreeRoot, selectedMeshData: selectedDisplayMeshData,
    geometryInspection: { parts: !viewerLoading && !stepUpdateInProgress ? selectedMeshData?.parts || EMPTY_LIST : EMPTY_LIST },
    references: selectionActionVisible ? selectedReferenceItems : EMPTY_LIST, onRemove: removeFromSelection, onHover: hoverChip,
    copyText: chipCopyText, nameFace });
  // A sketch is picked on the model as in the design tree, with Select in hand and nothing else
  // asking for a pick: the sketch an extrude takes (inside its outline too, while it waits for
  // one), or one to work on next. The part's extent is how far Through All goes in a preview.
  const sketchFeature = Boolean(edit.command && (editCommand(edit.command)?.sketch || editCommand(edit.command)?.sketches));
  // A sweep's or a loft's sketches, picked one after another: each shaded as picked, and a closed
  // one picked by a click inside it as the first one is.
  const takesSketches = Boolean(edit.command && editCommand(edit.command)?.sketches);
  const sketchesPickable = editing && selectionToolActive && !edit.sketch && !edit.picking && !edit.editing && (!edit.command || sketchFeature);
  const selectEdit = edit.select;
  const pickSketch = useCallback(view => {
    const id = sketchTreeId(editTree, view);
    if (id) { selectEdit(id); chooseFeature(); }
  }, [editTree, selectEdit, chooseFeature]);
  const partBounds = edit.state?.bounds;
  const partExtent = partBounds ? Math.hypot(...partBounds[1].map((value, axis) => value - partBounds[0][axis])) : 0;

  // ---- the selection bar and Ask ---------------------------------------------------------------
  // In the workspace, picking a face, an edge or a feature with Select in hand and no command open offers a small bar beside
  // it (`edit/EditSelectionBar.jsx`): Ask, Add to context, Annotate and Edit. A face or an edge is the model's pick; a feature is a
  // row the person pressed in the design tree or the timeline, or a sketch they picked on the model. They are separate selections, and
  // the bar is about the model's picks while there are any, else the feature chosen.
  const modelPicks = useMemo(() => (selectionActionVisible
    ? selectedReferences.filter(reference => reference?.selectorType === "face" || reference?.selectorType === "edge")
      .map(reference => ({ kind: reference.selectorType, id: reference.id, reference })) : EMPTY_LIST), [selectionActionVisible, selectedReferences]);
  const rowPick = useMemo(() => (featureChosen ? featurePick(editTree, edit.selected) : null), [featureChosen, editTree, edit.selected]);
  const barPicks = modelPicks.length ? modelPicks : rowPick ? [rowPick] : EMPTY_LIST;
  // Ask opens Quick Edit, which the workspace shows only once asked (`quickEditShown`): on what is picked, or with nothing picked,
  // on the part as a whole. Escape, a send, Clear (the box's X) or the picks emptying put it away, and so does a command or a sketch opening.
  const { asked, ask, clear: clearAsked } = useAsked({ editing, picked: selectionCount > 0 || Boolean(rowPick),
    held: commandOpen || sketchOpen, file: selectedKey });
  // Ask on a feature carries the statement that makes it (`featureAsk`): one reference to its line in its script, and a chip naming it
  // whose X lets go of the pick. Where the model has faces or edges picked they are what Ask carries instead.
  const featureCarried = useMemo(() => (!modelPicks.length && rowPick ? featureAsk({ state: edit.state, tree: editTree, pick: rowPick, onRemove: dropFeature }) : null),
    [modelPicks.length, rowPick, edit.state, editTree, dropFeature]);
  // What the picks are, in the prompt grammar and as chips: what Quick Edit carries when it shows (`quickEditShown`), and what Add to context will deliver.
  const carried = useMemo(() => pickedReferences({ selectionActionVisible, selection: promptSelection, selectionChips: referenceChips, feature: featureCarried }),
    [selectionActionVisible, promptSelection, referenceChips, featureCarried]);
  const quickEditOpen = quickEditShown({ editing, asked, selectionActionVisible });
  // A row is its own feature; faces picked on the model are the feature the engine says made them all, where it is known and has
  // something to open (`facePick`), and then have its Edit as its row does (`selectionBarActions`). An edge, or a face not known, has none.
  const rowChosen = barPicks.length === 1 && barPicks[0].kind === "feature" ? barPicks[0] : null;
  const faceRow = useMemo(() => (modelPicks.length ? facePick(editTree, modelPicks, faceState) : null), [modelPicks, editTree, faceState]);
  const barActions = selectionToolActive && !previewing && !asked
    ? selectionBarActions({ editing, picks: barPicks, commandOpen, sketching: sketchOpen, busy: edit.saving || edit.rolling,
      featureOf: faceRow ? pick => (pick.kind === "face" ? faceRow.id : null) : null }) : EMPTY_LIST;
  const rowEdited = rowChosen || faceRow;
  // The bar beside a feature chosen is put away by Escape, the feature staying selected.
  const featureBarShown = barActions.length > 0 && rowChosen !== null;
  // The design tree and the timeline select a row when the person presses it, and that chooses its feature.
  const editWithRows = chosenThrough(edit, chooseFeature);
  // SolidWorks' menu on a face: Edit Feature and Edit Sketch of the feature that made it, Normal To a flat
  // one, and Appearance.
  faceMenuRef.current = (id, reference) => {
    if (!editing || edit.sketch || reference?.selectorType !== "face") return [];
    const row = facePick(editTree, [{ kind: "face", id, reference }], faceState);
    const busy = edit.saving || edit.rolling || Boolean(edit.command);
    const items = [];
    if (row?.feature?.edit) items.push({ id: "edit-feature", label: "Edit Feature", disabled: busy, onSelect: () => edit.editFeature(row.feature) });
    const sketch = row?.feature?.sketch;
    if (sketch?.constrained) items.push({ id: "edit-sketch", label: "Edit Sketch", disabled: busy, onSelect: () => openTreeSketch(sketch) });
    if (reference?.pickData?.surfaceType === "plane") {
      items.push({ id: "normal-to", label: "Normal To", onSelect: () => {
        const selectorRuntime = layersApiRef.current?.activeSelectorRuntime;
        const subject = lookSubjectForReference(runtimeRefRef.current?.current, selectorRuntime, selectorReferenceForId(selectorRuntime, id) || reference);
        if (subject) viewerRef.current?.lookAt?.(subject);
      } });
    }
    if (!isAssemblyView) items.push({ id: "appearance", label: "Appearance", disabled: busy, onSelect: () => edit.inspect("appearance") });
    return items;
  };
  faceDoubleRef.current = (id, reference) => {
    if (!editing || edit.command || edit.sketch || reference?.selectorType !== "face") return false;
    const row = facePick(editTree, [{ kind: "face", id, reference }], faceState);
    if (!row?.feature) return false;
    edit.select(row.feature.id);
    chooseFeature();
    return true;
  };
  // Edit does what a double-click on the row does: the sketch opens in the Sketch tab, a feature its Edit Feature; on faces, the
  // Edit Feature of the feature that made them.
  const editRow = () => { if (rowEdited?.sketch) openTreeSketch(rowEdited.sketch); else if (rowEdited) edit.editFeature(rowEdited.feature); };
  // Annotate takes up the viewer's Pencil, as the strip's does.
  const pencil = tools.find(tool => tool.id === "pencil");
  // Where the picks are: the boxes of the faces and edges as they sit on the model now, an Explode moving them with their part, or
  // the whole part for a row; the bar stands by what falls on the screen.
  const barAnchor = () => {
    if (!modelPicks.length) return boundsCorners(partBounds ? { min: partBounds[0], max: partBounds[1] } : null);
    const runtime = runtimeRefRef.current?.current;
    const selectorRuntime = layersApiRef.current?.activeSelectorRuntime;
    return modelPicks.flatMap(({ id, reference }) => boundsCorners(selectorReferenceBounds(selectorRuntime, [id]),
      runtime ? referenceExplodedViewMatrix(runtime, selectorReferenceForId(selectorRuntime, id) || reference)?.elements : null));
  };

  // ---- the file sidebar --------------------------------------------------------------------------
  // Down the left: the model tree and Position's joints, whatever the tool; the kept effects are
  // the tool stack's.
  const stepSidebar = useStepPanels({
    selectActive: !previewing,
    selectMode: treeShape(selectionFilter),
    // In an assembly, a part's faces and edges load when a press under Faces or Edges first
    // reaches it; the model tree says so until the press can be picked.
    loadingGeometry: Boolean(pendingTopologyPick || pendingMeasurePick),
    positionRuntime: previewing ? previewMotion.positionControls : motion.positionControls,
    // Position's tile dot: the joints off the default pose.
    positionChanged: !positionValuesAreDefault(stepModuleParameterValues, selectedStepModuleDefinition?.defaultParameterValues),
    selectedMeshData: selectedDisplayMeshData,
    client,
    geometryInspection: { revision: artifactRevision,
      references: !viewerLoading && !stepUpdateInProgress ? isAssemblyView ? assemblyStepTreeTopologyReferences : selectedSelectorRuntime?.references || EMPTY_LIST : EMPTY_LIST,
      parts: !viewerLoading && !stepUpdateInProgress ? selectedMeshData?.parts || EMPTY_LIST : EMPTY_LIST,
      onLoadTopology: loadInspectionTopology },
    selectedEntry,
    viewerLoading: viewerLoading || assemblyTreeLoading,
    isAssemblyView,
    stepTreeRoot: displayStepTreeRoot,
    expandedTreeNodeIds: expandedStepTreeNodeIds,
    selectedPartIds,
    selectedReferenceIds,
    selectedReferences: selectedReferenceItems,
    selectableNodeIds: isolatedStepTreeSelectableNodeIds,
    activeTreeNodeScrollKey,
    hiddenPartIds,
    focusedNodeIds: focusedAssemblyNodeIds,
    onSelectTreeNode: selectStepTreeNode,
    onFocusTreeNode: focusStepTreeNode,
    onUnfocusTreeNode: handleExitSingleIsolate,
    onExitAllIsolate: handleExitIsolate,
    onToggleTreeNode: toggleStepTreeNode,
    onClearSelection: clearAssemblySelection,
    onHoverTreeNode: setHoveredListPartId,
    hoverStore,
    onTogglePartVisibility: togglePartVisibility,
    treeSelectionDisabled: stepInteractionBlocked,
    menuForNode: assemblyNodeMenu,
    menuForReferences: topologyReferenceMenu,
    partMenuActions,
    showAllHiddenParts: handleShowAllHiddenParts
  });

  // Under Select a press on a measurement picks it before any part under it, and resting on one
  // lights it (`measureSelection.js`); only while Select picks measurements.
  const { press: selectPress, hover: selectHover } = measureSelectHandlers(measure, () => runtimeRefRef.current?.current,
    clearAssemblySelection, { picks: selects(selectFilter, "measurement") });
  // Everything picked goes: the parts and references, the measurements, and the feature chosen, as a click on the model's background lets
  // go of them. Quick Edit's X and a send clear it too, and the box Ask opened goes with them.
  const clearSelected = () => { clearAssemblySelection(); measure.select([]); clearAsked(); dropFeature(); };
  const clearQuickEdit = () => { if (quickEditLetsGo({ held: commandOpen || sketchOpen }) === "box") clearAsked(); else clearSelected(); };
  // The marks drawn on a face go to the agent as shapes in its coordinates, in the part's units, in Simple view and the workspace
  // alike: Quick Edit's every way and Add to context. A face is named as its chip is (`nameReference`'s words: "Hole (6) · face 12" where
  // the engine says which feature made it, `faceChipName`'s pieces, else "bracket · face 12"); a touch that is no face (an edge) has
  // no name, so no mark is said to be on it.
  faceMarksRef.current = items => {
    const units = edit.state?.units || "mm";
    const labelOf = ref => {
      const selectors = parseCadRefToken(ref)?.selectors || [];
      if (selectors.length !== 1 || parseCadRefSelector(selectors[0])?.selectorType !== "face") return null;
      const name = nameReference({ resource: promptResource, target: { kind: "cad-selector", selectors } });
      return name && typeof name === "object" ? `${name.name} · ${name.kind} ${name.number}` : name || "";
    };
    return faceShapesText(faceShapesOf(items, { units, labelOf }), units);
  };
  // Where the host has a chat box to fill, the selection bar's Add to context and the toolbar's put what Ask carries (`carried`), and the
  // ink, there with no note and nothing sent (`useAddToContext`); ink alone is something to add. Once it is there the picks are let go of,
  // and the ink with them (it went in the snapshot and the marks on a face), as
  // a Queue lets go of both, so the next one starts fresh; if the box does not take it they are kept, and the viewport says why. While a
  // command or a sketch is open the selection is its own (an Edge Blend's edges), so it waits, and the toolbar's buttons say so.
  const addContext = useAddToContext({ resource: promptResource, references: carried.references, prompt: shell.frame.quickEditPrompt,
    held: commandOpen || sketchOpen, annotated: shell.frame.annotation.hasAnnotation,
    onAdded: () => { clearSelected(); if (shell.frame.annotation.hasAnnotation) shell.frame.annotation.forget(); },
    onFailed: reportActionError });

  // ---- Preview ----------------------------------------------------------------------------
  // Its own scene while it is open, filled by its own layers inside its own viewport from the same
  // published mesh (`StepPreviewLayers`), posed and played by its own motion.
  const previewStepScene = useMemo(() => (previewing ? createStepScene(THREE) : null), [previewing]);
  const previewSceneView = useMemo(() => (previewStepScene ? stepSceneView(previewStepScene, keepsAuthoredFinish) : null),
    [previewStepScene, keepsAuthoredFinish]);
  const previewAnimation = animationControlsHaveContent(previewMotion.animationControls) ? previewMotion.animationControls : null;
  // Finer detail reaches Preview's scene in a few grouped steps (`settledValue.js`): each one
  // starts its converging picture again, and a large model's detail arrives as a burst of batches.
  const previewMeshData = useSettledValue(selectedDisplayMeshData, { grouped: previewing });
  // Preview's runtime going away takes its scene's build with it, and says nothing to the
  // detail loader: the editor's scene is the one that adopted the detail.
  const previewRuntimeLifecycle = useMemo(() => ({
    onRelease(runtime) { if (previewStepScene) releaseStepRuntime(runtime, previewStepScene); }
  }), [previewStepScene]);
  const previewView = {
    scene: viewportScene ? previewSceneView : null,
    overlay: (viewport, drawn) => {
      previewRuntimeRefRef.current = viewport.runtimeRef;
      return previewStepScene ? <StepPreviewLayers viewport={viewport} drawn={drawn} previewStepScene={previewStepScene}
        meshData={previewMeshData} modelKey={selectedKey} isLoading={viewportIsLoading}
        selectorRuntime={layerProps.selectorRuntime} stepParameterRuntime={selectedStepParameterRuntime} motion={previewMotion}
        renderPartsIndividually={Boolean(selectedStepParameterRuntime) || Boolean(Object.keys(selectedDisplayMeshData?.appearance?.materials || {}).length)}
        hoverStore={hoverStore} onLodCameraChange={onLodCameraMoved} /> : null;
    },
    animation: previewAnimation,
    runtimeLifecycle: previewRuntimeLifecycle,
    onCameraSettled: onLodCameraMoved
  };

  return <RendererShell shell={shell} tools={tools} subToolbar={tabToolMode === TAB_TOOL_MODE.MEASURE ? <MeasurementsBar measure={measure} /> : modelEffects.subToolbar} sidebar={stepSidebar} previewView={previewView}
    // The edit chrome's icons are drawn from this sprite, which the frame mounts once.
    iconSprite={<NxIconSprite />} drawingToolIcons={DRAWING_TOOL_ICONS}
    // Quick Edit shows with a selection to carry in Simple view, as always, and in the workspace once Ask has asked for it.
    references={quickEditOpen ? carried.references : EMPTY_LIST} referenceChips={quickEditOpen ? carried.chips : EMPTY_LIST}
    quickEditAsked={editing ? asked : null} nameReference={nameReference}
    navbarControls={editable && !layoutHosted ? <EditLayoutSwitch value={editLayout} onChange={setEditLayout}
      disabled={layoutHeld} /> : null}
    onClearReferences={clearQuickEdit} copySelection={copySelection} onSelectPress={selectPress} onSelectHover={selectHover}
    selectsAnnotations={selects(selectFilter, "annotation")} inkTouches={inkTouches}
    contextMenuItems={selectionToolActive
      ? press => viewportContextMenuItems(press, pickAtRef.current?.(press.clientX, press.clientY) || "") : null}
    onContextMenuOpenChange={handleViewportContextMenuOpenChange}
    // The toolbar is handed the view's own controls and its catching-up too, for its tab row's right end.
    ribbon={editing ? (stripTools, view) => <EditRibbon tools={stripTools} view={view} edit={edit} onCommand={startEditCommand} onSketch={startSketchCommand}
      sketchLabel={selectedTreeSketch ? "Edit Sketch" : "Sketch"} canOpenParts={Boolean(openPart)}
      onNormalTo={normalTarget ? edit.lookNormalTo : null} onAsk={ask}
      onAddContext={addContext.offered ? addContext.add : null} picked={addContext.picked} held={commandOpen || sketchOpen} /> : null}
    leftDock={editing ? <EditBrowser edit={editWithRows} names={editNames} tree={editTree} references={selectedReferences}
      onEditSketch={openTreeSketch} onPlane={sketchOnPlane} onOpenPart={openPart} backTo={backTo} card={commandCard}
      onDeselect={deselectReference} /> : null}
    // The drawing's sheet covers the view and keeps its one line of feedback at the bottom-left, where the timeline stands.
    bottomDock={editing && !edit.sheetView ? <EditTimeline edit={editWithRows} tree={editTree} onEditSketch={openTreeSketch} /> : null}
    dialogPlace={editing ? setCommandCard : null} dialogOpen={editing && floatsCard(edit)}
    viewportOverlay={viewport => {
      runtimeRefRef.current = viewport.runtimeRef;
      // The drawing's sheet, up in the view, covers the part: the part's own layers, which take
      // presses anywhere in the view, are put away under it.
      const sheetUp = editing && Boolean(edit.sheetView);
      return <>
        <StepSceneLayers viewport={viewport} stepScene={stepScene} policy={viewPolicyResolved} props={layerProps} api={layersApiRef} />
        {barActions.length ? <EditSelectionBar viewport={viewport} actions={barActions} anchor={barAnchor}
          anchorKey={barPicks.map(pick => `${pick.kind}:${pick.id}`).join(",")}
          editKind={rowEdited?.sketch ? "Sketch" : rowEdited?.feature.kind} editHint={rowEdited?.sketch ? "Edit Sketch" : "Edit Feature"}
          onAsk={ask} onAddContext={addContext.offered && addContext.picked ? addContext.add : undefined}
          onAnnotate={pencil && !pencil.disabled ? pencil.onSelect : undefined} onEdit={rowEdited ? editRow : undefined} /> : null}
        {sheetUp ? <SheetEditor edit={edit} colorScheme={resolvedColorSchemeMode} /> : null}
        {editing && !sheetUp && edit.command && edit.callout ? <ValueCallout viewport={viewport} callout={edit.callout} /> : null}
        {/* A STEP brought in, with no part script: made a part to edit beside it, and opened. */}
        {edit.status === "none" && edit.imported && openFile ? <ImportedBody imported={edit.imported} onAdopt={edit.adopt} onOpen={openFile} /> : null}
        {editing && !sheetUp ? <EditDimensions viewport={viewport} dimensions={editDimensions} units={edit.state?.units || ""}
          // Held while a command's dialog is open, as its sizes are the dialog's, which Cancel puts back.
          disabled={edit.saving || Boolean(edit.command)}
          planes={editPlanes} origin={editOrigin}
          choice={edit.choice} onChange={(dimension, text) => void edit.change({ dimension: dimension.id, text })}
          onChoose={edit.choose} onDismissChoice={edit.dismissChoice} /> : null}
        {editing && edit.sketch ? <SketchOverlay viewport={viewport} edit={edit} units={edit.state?.units || ""} modelEdgeAt={modelEdgeAt} /> : null}
        {editing && !sheetUp && shownSketches.length ? <SketchesLayer viewport={viewport} sketches={shownSketches} selected={previewedSketches || selectedTreeSketch}
          onPick={sketchesPickable ? pickSketch : null} profiles={sketchFeature && (!selectedTreeSketch || takesSketches)} preview={edit.preview}
          onEdit={sketchesPickable && !edit.command ? view => openTreeSketch({ file: view.file, line: view.line, title: view.name }) : null}
          through={partExtent} /> : null}
        {editing && !sheetUp && edit.inspecting === "mass" && massMark ? <PreviewLayer viewport={viewport} preview={null} mark={massMark} extent={partExtent} /> : null}
        {editing && !sheetUp && edit.inspecting === "draft" && edit.draftCheck?.positions ? <DraftAnalysisLayer viewport={viewport} check={edit.draftCheck} /> : null}
        {editing && !sheetUp && edit.inspecting === "interference" && edit.interference?.shown
          ? <PreviewLayer viewport={viewport} preview={edit.interference.shown} mark={null} extent={partExtent} /> : null}
        {/* Compare: what the part gained since the version picked, amber, and what it lost, red. */}
        {editing && !sheetUp && edit.inspecting === "compare" && edit.comparison?.shown
          ? <PreviewLayer viewport={viewport} preview={edit.comparison.shown} mark={null} extent={partExtent} /> : null}
        {editing && !sheetUp && edit.command && (edit.featurePreview || ["pattern", "hole", "draft", "plane"].includes(edit.preview?.mark))
          ? <PreviewLayer viewport={viewport} preview={edit.featurePreview} mark={edit.preview?.mark ? edit.preview : null} extent={partExtent} />
          : null}
      </>;
    }} />;
}
