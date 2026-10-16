import { useNow } from "../routes/now";
import { useIndexerNow } from "./quests";

/**
 * The clock the game boundaries are read against (UTC-BOUND): the indexer's block time, the same source as P9's quests
 * (`useIndexerNow`), so a browser clock that is slow or fast changes nothing. Until the indexer has answered (or when it
 * cannot) it is the browser's clock. Seconds since the epoch, moving each second.
 */
export function useChainClock(): number {
  const chain = useIndexerNow().now;
  const browser = useNow();
  return chain ?? browser;
}
