/**
 * Read-only probes of the in-play bench, installed before the app's modules load so that
 * every fetch and every long task is seen: they record, and change nothing in what the page
 * does.
 */
export interface FetchRecord {
  kind: "rpc" | "other";
  /** Method of a JSON-RPC call, or the URL. */
  what: string;
  start: number;
  /** Response headers received (the body is read by the caller afterwards). */
  end: number;
}

export interface LongTask {
  start: number;
  duration: number;
}

export interface InputRecord {
  type: string;
  key?: string;
  ts: number;
}

export const probes = {
  fetches: [] as FetchRecord[],
  longTasks: [] as LongTask[],
  inputs: [] as InputRecord[],
};

function describe(url: string, body: unknown): Pick<FetchRecord, "kind" | "what"> {
  const text = typeof body === "string" ? body : "";
  if (url.includes("/rpc")) {
    try {
      const msg = JSON.parse(text);
      return { kind: "rpc", what: Array.isArray(msg) ? msg.map((m) => m.method).join("+") : String(msg.method) };
    } catch {
      return { kind: "rpc", what: "?" };
    }
  }
  return { kind: "other", what: url };
}

export function installProbes(): void {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const record = { ...describe(url, init?.body), start: performance.now(), end: NaN };
    try {
      return await realFetch(input, init);
    } finally {
      record.end = performance.now();
      probes.fetches.push(record);
    }
  };

  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) probes.longTasks.push({ start: e.startTime, duration: e.duration });
  }).observe({ type: "longtask", buffered: true });

  for (const type of ["pointerup", "keydown"] as const) {
    window.addEventListener(
      type,
      (e) => probes.inputs.push({ type, key: (e as KeyboardEvent).key, ts: e.timeStamp }),
      { capture: true },
    );
  }
}
