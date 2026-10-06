import type { GameMode, PlayerGame } from "@paved/chain";

/**
 * The player's consent to start a game, carried in the router's history state: a link cannot set
 * it, unlike the URL. Only the landing page's confirm builds one.
 */
export interface StartIntent {
  start: true;
  /** The Daily entry amount the player saw and confirmed (base unit, decimal string); Tutorial has none. */
  confirmedAmount?: string;
}

export function startIntent(mode: GameMode, confirmedAmount: bigint | null): StartIntent {
  return mode === "daily" && confirmedAmount !== null ? { start: true, confirmedAmount: confirmedAmount.toString() } : { start: true };
}

/** The intent in a location's state, or null: anything else (a link, a reload after it was cleared) starts nothing. */
export function readStartIntent(state: unknown, mode: GameMode): { confirmedAmount: bigint | undefined } | null {
  if (typeof state !== "object" || state === null || (state as { start?: unknown }).start !== true) return null;
  const amount = (state as { confirmedAmount?: unknown }).confirmedAmount;
  if (mode === "tutorial") return { confirmedAmount: undefined };
  // A Daily start pays: it needs the confirmed amount, as a plain integer.
  return typeof amount === "string" && /^(0|[1-9][0-9]{0,77})$/.test(amount) ? { confirmedAmount: BigInt(amount) } : null;
}

export interface StartDeps {
  /** Games of the player in this mode, newest first. */
  listGames: () => Promise<PlayerGame[]>;
  spawn: (confirmedAmount: bigint | undefined) => Promise<{ gameId: number }>;
  /** Removes the intent from the history entry (replace, state null). */
  clearIntent: () => void;
  open: (gameId: number) => void;
}

/**
 * Starts or resumes a game from a consent. The intent is cleared **before** anything is sent, so
 * a reload, Back, a refused spawn or a failed one cannot repeat the payment: the player confirms again.
 */
export async function startGame(intent: { confirmedAmount: bigint | undefined } | null, deps: StartDeps): Promise<"none" | "resumed" | "spawned"> {
  if (!intent) return "none";
  deps.clearIntent();
  const active = (await deps.listGames()).find((g) => !g.over);
  if (active) {
    deps.open(active.gameId);
    return "resumed";
  }
  const { gameId } = await deps.spawn(intent.confirmedAmount);
  deps.open(gameId);
  return "spawned";
}
