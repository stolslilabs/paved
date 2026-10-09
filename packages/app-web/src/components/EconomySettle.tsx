import { useState } from "react";
import { useAsyncRead } from "@paved/chain";
import type { EconomyClient, EconomyWriter, PlayerGame, TermsView } from "@paved/chain";
import { CLIFF_TEXT, paved, points, settleState, utcDate } from "../utils/economy-view";
import { button, confirmButton, panel, warning } from "./EconomyStyles";

/** Bought games read for settlement: the newest Daily games of the player. */
const SETTLE_GAMES_READ = 30;

interface Bought {
  game: PlayerGame;
  terms: TermsView;
}

async function listBought(client: EconomyClient, address: string): Promise<Bought[]> {
  const games = (await client.base.events.playerGames(address, ["daily"])).slice(0, SETTLE_GAMES_READ);
  const terms = await Promise.all(games.map((g) => client.views.terms(g.gameId)));
  return games.map((game, i) => ({ game, terms: terms[i] })).filter((b) => b.terms.stake > 0);
}

/**
 * After the day: each bought game, settled (its reward, read from the chain) or to settle. Settling mints the reward
 * the contract computes against the day's mean; the screen promises no figure before that.
 */
export function EconomySettle({
  client,
  writer,
  address,
  write,
  busy,
  now = () => Math.floor(Date.now() / 1000),
}: {
  client: EconomyClient;
  writer: EconomyWriter | null;
  address: string | null;
  write: (fn: () => Promise<unknown>, after: Array<() => void>) => void;
  busy: boolean;
  now?: () => number;
}) {
  const bought = useAsyncRead(address ? () => listBought(client, address) : null, [client, address], { onVisible: true });
  // The running EMA reference, not the day's mean (`day()` answers zeros until the day closes: never shown).
  const reference = useAsyncRead(() => client.views.quote(1), [client], { onVisible: true });
  const [asking, setAsking] = useState<number | null>(null);
  const t = now();

  return (
    <div style={panel} aria-label="After the day">
      <strong>After the day</strong>
      <span style={warning}>{CLIFF_TEXT}</span>
      <span>The reward is computed by the contract at settlement, from the day&apos;s mean: no figure is shown before.</span>
      {reference.data && (
        <span>{`Current reference: mean ${points(reference.data.mean)} points, threshold ${points(reference.data.threshold)} points; the day's own mean is known only at settlement.`}</span>
      )}
      {bought.error && <span role="alert" style={warning}>{`Games unavailable: ${bought.error}`}</span>}
      {bought.data?.length === 0 && <span>No bought game yet.</span>}
      {bought.data?.map(({ game, terms }) => {
        const state = settleState(terms, game.startTime, t);
        return (
          <div key={game.gameId} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ flex: 1 }}>
              {`Game ${game.gameId}, day ${terms.day}, stake ${terms.stake}: `}
              {state.kind === "playing"
                ? `in play, expires ${utcDate(state.expiresAt)}`
                : state.kind === "expired"
                  ? "Expired: no reward"
                  : state.kind === "waiting"
                    ? `score ${terms.score}, settles after ${utcDate(state.settlesAfter)}`
                    : state.kind === "settleable"
                      ? `score ${terms.score}, to settle`
                      : state.reward === 0n
                        ? `settled, score ${terms.score}: below the shifted mean, the stake is lost`
                        : `settled, score ${terms.score}: ${paved(state.reward)}`}
            </span>
            {state.kind === "settleable" && (
              <button type="button" style={button} disabled={!writer || busy} onClick={() => setAsking(game.gameId)}>
                Settle
              </button>
            )}
          </div>
        );
      })}
      {asking !== null && (
        <div role="dialog" aria-label="Confirm" style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid #444", paddingTop: 8 }}>
          <span>{`Settle game ${asking}? The contract mints its reward, or nothing if the score is below the shifted mean.`}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              style={confirmButton}
              disabled={busy || !writer}
              onClick={() => {
                const id = asking;
                setAsking(null);
                if (writer) write(() => writer.settle([id]), [bought.refresh]);
              }}
            >
              Confirm settle
            </button>
            <button type="button" style={button} onClick={() => setAsking(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
