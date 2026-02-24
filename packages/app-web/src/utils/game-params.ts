export interface GameParams {
  mode: string;
  gameId: number | null;
  readonly: boolean;
}

const VALID_MODES = ["daily", "weekly", "tutorial"];

export function parseGameParams(searchParams: URLSearchParams): GameParams {
  const modeParam = searchParams.get("mode");
  const mode = modeParam && VALID_MODES.includes(modeParam) ? modeParam : "daily";
  const idParam = searchParams.get("id");
  const gameId = idParam ? Number(idParam) : null;
  const readonly = searchParams.get("readonly") === "true";
  return { mode, gameId, readonly };
}

const CONTRACT_MAP: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  tutorial: "Tutorial",
};

export function modeToContractName(mode: string): string {
  return CONTRACT_MAP[mode] || "Daily";
}
