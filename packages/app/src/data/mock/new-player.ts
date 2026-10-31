import { encodeAvatar } from "@paved/renderer";
import { randomUsable } from "../../components/containers/avatar-types";
import { cryptoRandom, playerName } from "../../lib/player-names";
import { avatarOffers } from "../avatar-offers";
import type { MockLedger, NewPlayerCatalogue } from "./ledger";

// A new player on the mock (#926): a plausible name and a look of the items they may wear, drawn at their first connection
// (`mockConnector`). Its own chunk, fetched only when the account has no name: the word lists stay out of the menus' load.

/** A new player's name (`playerName`) and look: each part drawn among the free items (and owned ones, for an older account). */
export function drawNewPlayer(catalogue: NewPlayerCatalogue, random: () => number = cryptoRandom): { name: string; look: bigint } {
  return { name: playerName(random), look: encodeAvatar(randomUsable(avatarOffers(catalogue, Date.now() / 1000), random)) };
}

/** Names `account` and gives it a look, once (`MockLedger.nameAtConnection`); resolves true when it did. */
export function welcomeNewPlayer(ledger: MockLedger, account: string, random?: () => number): Promise<boolean> {
  return ledger.nameAtConnection(account, (catalogue) => drawNewPlayer(catalogue, random));
}
