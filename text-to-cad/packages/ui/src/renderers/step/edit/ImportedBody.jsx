import { useState } from "react";
import { Button } from "@text-to-cad/ui/primitives/button";

/**
 * A STEP brought in, with no part script to edit: offered as a part to model on, as SolidWorks makes
 * a part of a STEP it opens and Fusion and NX hold one as a body with no history. Edit as a part
 * writes a script beside it that reads it (`useEditMode`'s `adopt`) and opens that part; the STEP
 * itself is never written over. One made before is opened instead.
 *
 * @param {{ imported: { part: string | null }, onAdopt: () => Promise<{ part: string } | null>, onOpen: (file: string) => void }} props
 */
export default function ImportedBody({ imported, onAdopt, onOpen }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const adopt = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const reply = await onAdopt();
      if (reply?.part) onOpen(reply.part);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return <div data-cad-imported-body="" className="pointer-events-auto absolute left-3 top-3 z-20 flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs shadow-sm">
    <span className="text-muted-foreground">{failed ? "Studio couldn't make it a part. Try again." : "Imported STEP, no history"}</span>
    {imported.part
      ? <Button size="xs" onClick={() => onOpen(imported.part)}>Open its part</Button>
      : <Button size="xs" disabled={busy} onClick={() => void adopt()}>Edit as a part</Button>}
  </div>;
}
