import { ModeType } from "@paved/game-core";

export function buildGameRoute(params: { gameId: number; mode: string; readonly?: boolean }): string {
  const search = new URLSearchParams({
    id: String(params.gameId),
    mode: params.mode,
  });

  if (params.readonly) {
    search.set("readonly", "true");
  }

  return `/game?${search.toString()}`;
}

export function modeTypeFromParam(mode: string | null | undefined): ModeType {
  switch (mode) {
    case ModeType.Daily:
      return ModeType.Daily;
    case ModeType.Weekly:
      return ModeType.Weekly;
    case ModeType.Tutorial:
      return ModeType.Tutorial;
    default:
      return ModeType.Daily;
  }
}

export function modeTypeFromToriiMode(mode: unknown): ModeType | null {
  const value = Number(mode);
  switch (value) {
    case 1:
      return ModeType.Daily;
    case 2:
      return ModeType.Weekly;
    case 3:
      return ModeType.Tutorial;
    default:
      return null;
  }
}

export function resolveRuntimeMode(fallback: ModeType, toriiMode: unknown): ModeType {
  return modeTypeFromToriiMode(toriiMode) ?? fallback;
}
