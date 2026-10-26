import { layoutBreakdown, randomLayout } from "@paved/game-core";
import { answerRandomLayout, type RandomLayoutRequest } from "./random-layout-protocol";

// The die's worker (#803): game-core's random compact layout and its points off the main thread, in a chunk of its own. One request at a
// time; the page cancels one by terminating the worker.

const scope = self as unknown as { onmessage: ((e: MessageEvent<RandomLayoutRequest>) => void) | null; postMessage: (message: unknown) => void };
scope.onmessage = (e) => scope.postMessage(answerRandomLayout(e.data, randomLayout, layoutBreakdown));
