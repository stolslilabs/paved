import type { SkinsStatus } from "../components/containers/skins-status";
import { errorDetail } from "./error-detail";

/**
 * The status of a page of the skins (Themes, a theme's shop, Tiles): a failed read, the reads on their way (the account's too: no
 * guest, NO-GUEST), or none (the skins are in).
 */
export function skinsStatus(playerId: string | null, read: { data: unknown; error: Error | null }): SkinsStatus | null {
  if (playerId === null) return { kind: "loading" };
  if (read.error) return { kind: "error", message: read.error.message, detail: errorDetail(read.error) };
  return read.data === undefined ? { kind: "loading" } : null;
}
