import { NoCreditError, SpawnPausedError, type FakeGameViews, type WriteResult } from "@paved/chain";
import type { FakeClaimer } from "@paved/chain/testing";
import type { GameSigner } from "../src/data";
import type { LoadConnector } from "../src/wallet/wallet";
import { fakeWallet } from "./wallet-fakes";

/**
 * `Challenge.spawn_free` in memory, on a `FakeGameViews` ledger: one credit of the account goes, a free game
 * (`GameSpawned.price` 0) is spawned and its id is returned; no credit or a paused spawn is refused with the typed
 * errors of `PavedWriter`.
 */
export class FakeFreeSpawner {
  /** How many spawns were sent, refused ones included. */
  sent = 0;
  /** While set, a spawn waits for it before answering. */
  gate: Promise<void> | null = null;
  /** The next spawn fails with this error (then it is cleared). */
  failNext: Error | null = null;

  constructor(
    private readonly views: FakeGameViews,
    private readonly address: string,
    /** The id of the next game: the game must exist in `views` for its board to open. */
    private nextGameId: number,
  ) {}

  spawnFree = async (): Promise<WriteResult & { gameId: number }> => {
    this.sent += 1;
    if (this.gate) await this.gate;
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    if (this.views.paused) throw new SpawnPausedError("0xfee");
    const player = this.views.cobblePlayer(this.address);
    if (player.account.credits === 0) throw new NoCreditError("0xfee");
    player.account = { ...player.account, credits: player.account.credits - 1 };
    const gameId = this.nextGameId++;
    return { transactionHash: "0xf1ee", gameId, events: [{ name: "GameSpawned", fields: { gameId, playerId: this.address, mode: 1, price: 0 }, fromAddress: "0x2" }] };
  };
}

/** `fakeWallet`, whose signer also spawns free games (`spawner`) and, with `claimer`, claims. */
export function freeWallet(options: { address: string; restored?: boolean; spawner?: FakeFreeSpawner; claimer?: FakeClaimer }) {
  const wallet = fakeWallet({ address: options.address, restored: options.restored });
  const signer = wallet.connector.signer;
  wallet.connector.signer = (account) =>
    ({
      ...signer(account),
      ...(options.spawner ? { spawnFree: options.spawner.spawnFree } : {}),
      ...(options.claimer
        ? {
            claim: (c: never) => options.claimer!.claim(c),
            claimQuest: options.claimer.claimQuest.bind(options.claimer),
            claimAchievement: options.claimer.claimAchievement.bind(options.claimer),
            claimDailyCredit: options.claimer.claimDailyCredit.bind(options.claimer),
            claimWeeklyCredit: options.claimer.claimWeeklyCredit.bind(options.claimer),
          }
        : {}),
    }) as unknown as GameSigner;
  const load: LoadConnector = async () => wallet.connector;
  return { ...wallet, load };
}
