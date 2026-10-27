import { ProviderInstanceId, type ModelSelection } from "@t3tools/contracts";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  followToApply,
  proposeModelFollow,
  resetModelFollow,
  setChatInFront,
  takePendingFollow,
} from "./defaultModelFollow";

const pick = (model: string): ModelSelection => ({
  instanceId: ProviderInstanceId.make("codex"),
  model,
});
afterEach(resetModelFollow);

describe("which chat a model chosen in Settings applies to", () => {
  it("applies to the matching chat", () => {
    const pending = { threadKey: "e:t1", selection: pick("b") };
    expect(followToApply({ engineering: true, pending, activeThreadKey: "e:t1" })).toEqual(
      pick("b"),
    );
  });

  it("never applies to another chat, in the code interfaces, or with nothing pending", () => {
    const pending = { threadKey: "e:t1", selection: pick("b") };
    expect(followToApply({ engineering: true, pending, activeThreadKey: "e:t2" })).toBeNull();
    expect(followToApply({ engineering: false, pending, activeThreadKey: "e:t1" })).toBeNull();
    expect(followToApply({ engineering: true, pending: null, activeThreadKey: "e:t1" })).toBeNull();
    expect(followToApply({ engineering: true, pending, activeThreadKey: null })).toBeNull();
  });

  it("is taken once, by the chat that was in front when the change was made", () => {
    setChatInFront("e:t1");
    proposeModelFollow(pick("b"));
    setChatInFront("e:t1");
    expect(takePendingFollow(true, "e:t2")).toBeNull();
    expect(takePendingFollow(true, "e:t1")).toEqual(pick("b"));
    expect(takePendingFollow(true, "e:t1")).toBeNull();
  });

  it("is replaced by a later change, and dropped by a reset to Automatic", () => {
    setChatInFront("e:t1");
    proposeModelFollow(pick("b"));
    proposeModelFollow(pick("c"));
    expect(takePendingFollow(true, "e:t1")).toEqual(pick("c"));
    proposeModelFollow(pick("d"));
    proposeModelFollow(null);
    expect(takePendingFollow(true, "e:t1")).toBeNull();
  });

  it("does nothing when no chat has been in front, or in the code interfaces", () => {
    proposeModelFollow(pick("b"));
    expect(takePendingFollow(true, "e:t1")).toBeNull();
    setChatInFront("e:t1");
    proposeModelFollow(pick("b"));
    expect(takePendingFollow(false, "e:t1")).toBeNull();
  });
});
