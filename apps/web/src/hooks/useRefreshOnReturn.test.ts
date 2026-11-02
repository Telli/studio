import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { onReturn } from "./useRefreshOnReturn";

describe("onReturn", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("refreshes once when the user comes back, and not while the page is hidden", () => {
    const view = new EventTarget();
    const page = Object.assign(new EventTarget(), {
      visibilityState: "visible" as DocumentVisibilityState,
    });
    const refresh = vi.fn();
    const stop = onReturn(view, page, refresh, 250);

    // Coming back fires both: they make one refresh.
    view.dispatchEvent(new Event("focus"));
    page.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(250);
    expect(refresh).toHaveBeenCalledTimes(1);

    page.visibilityState = "hidden";
    page.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(250);
    expect(refresh).toHaveBeenCalledTimes(1);

    stop();
    view.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(250);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
