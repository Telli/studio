/**
 * The page's link to Studio, the host that frames it: MCP Apps JSON-RPC over postMessage
 * (spec 2026-01-26). The page asks for `tools/call` on its own server, the same process the
 * thread's agent uses, and hears the result of the call that opened it and changes to the host's
 * context (its theme and colours).
 */

export interface HostContext {
  readonly theme?: "light" | "dark";
  readonly styles?: { readonly variables?: Readonly<Record<string, string>> };
}

export interface ToolResult {
  readonly content?: ReadonlyArray<{ readonly type: string; readonly text?: string }>;
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
}

interface Message {
  readonly jsonrpc?: string;
  readonly id?: string | number;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
  readonly result?: unknown;
  readonly error?: { readonly message?: string };
}

const PROTOCOL_VERSION = "2026-01-26";

export function createBridge() {
  let next = 0;
  const pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  let context: HostContext = {};
  const contextListeners = new Set<(context: HostContext) => void>();
  let opened: ToolResult | null = null;
  const openedListeners = new Set<(result: ToolResult) => void>();

  const post = (message: Message) => window.parent.postMessage({ jsonrpc: "2.0", ...message }, "*");

  function request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = `editor-${(next += 1)}`;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      post({ id, method, params });
    });
  }

  window.addEventListener("message", (event: MessageEvent<Message>) => {
    const message = event.data;
    if (message === null || typeof message !== "object" || message.jsonrpc !== "2.0") return;
    if (message.method === undefined && message.id !== undefined) {
      const waiting = pending.get(String(message.id));
      if (waiting === undefined) return;
      pending.delete(String(message.id));
      if (message.error) waiting.reject(new Error(message.error.message ?? "The host refused"));
      else waiting.resolve(message.result);
      return;
    }
    if (message.method === "ui/resource-teardown" && message.id !== undefined) {
      post({ id: message.id, result: {} });
    } else if (message.method === "ping" && message.id !== undefined) {
      post({ id: message.id, result: {} });
    } else if (message.method === "ui/notifications/tool-result") {
      opened = (message.params ?? {}) as ToolResult;
      for (const listener of openedListeners) listener(opened);
    } else if (message.method === "ui/notifications/host-context-changed") {
      context = { ...context, ...(message.params as HostContext) };
      for (const listener of contextListeners) listener(context);
    }
  });

  return {
    async initialize(): Promise<HostContext> {
      const result = await request<{ hostContext?: HostContext }>("ui/initialize", {
        protocolVersion: PROTOCOL_VERSION,
        appInfo: { name: "studio-part-editor", version: "1" },
        appCapabilities: { availableDisplayModes: ["inline"] },
      });
      context = result.hostContext ?? {};
      post({ method: "ui/notifications/initialized", params: {} });
      return context;
    },
    /** A tool on this page's server; its structured reply, or an Error with the tool's message. */
    async call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
      const result = await request<ToolResult>("tools/call", { name, arguments: args });
      if (result.isError) {
        const text = (result.content ?? [])
          .map((item) => item.text ?? "")
          .join(" ")
          .trim();
        throw new Error(text || `${name} failed`);
      }
      return result.structuredContent as T;
    },
    onContext(listener: (context: HostContext) => void) {
      contextListeners.add(listener);
      return () => {
        contextListeners.delete(listener);
      };
    },
    /** The result of the call that opened the page (which design it opened on). */
    onOpened(listener: (result: ToolResult) => void) {
      if (opened !== null) listener(opened);
      openedListeners.add(listener);
      return () => {
        openedListeners.delete(listener);
      };
    },
  };
}

export type Bridge = ReturnType<typeof createBridge>;
