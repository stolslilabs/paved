import type { SkinsStatus } from "../components/containers/skins-status";
import { errorDetail } from "./error-detail";

/** The status of a page of the skins (Themes, a theme's shop, My tiles): a guest, a failed read, the reads on their way, or none (the skins are in). */
export function skinsStatus(playerId: string | null, read: { data: unknown; error: Error | null }): SkinsStatus | null {
  if (playerId === null) return { kind: "guest" };
  if (read.error) return { kind: "error", message: read.error.message, detail: errorDetail(read.error) };
  return read.data === undefined ? { kind: "loading" } : null;
}
