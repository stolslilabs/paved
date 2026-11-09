import { GameExpiredError, NoCreditError, PoolPriceMovedError, PurchasePriceChangedError, SettleNotRecordedError, SettleTooEarlyError, SettleUnknownGameError, SpawnPausedError, ViewError, DEFAULT_SLIPPAGE_BPS, MAX_SLIPPAGE_BPS, isStake, minOutFor, settlesAfter, WriteError, type BuilderView, type DayView, type DrawView, type GameKey, type GameView, type PlayerGame, type PriceView, type PurchaseRequest, type QuoteView, type TermsView, type TileView, type DecodedEvent, type WriteResult } from "@paved/chain";
import { poseidon, type SeededMove } from "@paved/game-core";
import { addressKey } from "../keys";
import { SPAWN_DRAW, builderOf, dayOfTime, dayView, drawOf, entryPrice, expiryOf, freshChallenge, gameView, guardRate, playMove, playerGamesOf, purchaseFigures, quoteOf, quoteSwap, router, settleGame, spawn, termsOf, tilesOf, type StoredChallenge, type StoredGame } from "./challenge";
import { type StoredPlayer, countTutorial, newPlayer, sleep } from "./ledger-state";
import { LedgerVault } from "./ledger-vault";

/** The Challenge and the Economy's games (#927, `challenge.ts`): their reads, the purchase, the free spawn, the moves and the settlement. One link of `MockLedger`'s chain (`ledger.ts`). */
export abstract class LedgerChallenge extends LedgerVault {
  /** Every Challenge game of the device, of every account, as stored (`challenge.ts`): the rows the mock's indexer reads. */
  challengeGames(): readonly StoredGame[] {
    return Object.values(this.challenge().games);
  }

  /** `Challenge.game(id)`: the stored game replayed on the engine (`challenge.ts`); an unknown id is `game-not-found`. */
  async game(key: GameKey): Promise<GameView> {
    return gameView(this.gameOf(this.challenge(), key.gameId));
  }

  async tiles(key: GameKey): Promise<TileView[]> {
    return tilesOf(this.gameOf(this.challenge(), key.gameId));
  }

  async builder(key: GameKey, playerId: string): Promise<BuilderView> {
    return builderOf(this.gameOf(this.challenge(), key.gameId), playerId);
  }

  /** The random the game spawned with: a VRF game's seed never moves, so it is `game().seed` too. */
  async initialSeed(key: GameKey): Promise<string> {
    return this.gameOf(this.challenge(), key.gameId).seed;
  }

  /** `Challenge.draw(id)`: the game's queue, on the VRF's draws (seeded, open point 3). */
  async draw(key: GameKey): Promise<DrawView> {
    return drawOf(this.gameOf(this.challenge(), key.gameId));
  }

  /** `Challenge.spawn_salt`: the mock draws a spawn from no salt. */
  async spawnSalt(): Promise<string> {
    return "0x0";
  }

  async currentDay(): Promise<number> {
    return dayOfTime(this.second());
  }

  async entryPrice(): Promise<PriceView> {
    return entryPrice();
  }

  /** The player's games, newest first, as the chain's `GameSpawned` and `GameOver` events list them. */
  async playerGames(playerId: string): Promise<PlayerGame[]> {
    return playerGamesOf(this.challenge(), addressKey(playerId));
  }

  /** `Economy.quote(stake)`: 2 USDC a stake, the split of the mocks, the mean of today (its prior, else the EMA). */
  async quote(stake: number): Promise<QuoteView> {
    if (!isStake(stake)) throw new ViewError("rpc", "Economy: bad stake");
    return quoteOf(this.challenge(), stake, this.second());
  }

  async guardRate(): Promise<bigint> {
    return guardRate();
  }

  async router(): Promise<string> {
    return router();
  }

  /** The pool's `quote_swap` of the mocks (`mocks/economy.ts`): no pool is read. */
  async quoteSwap(usdcIn: bigint): Promise<bigint> {
    return quoteSwap(usdcIn);
  }

  async day(day: number): Promise<DayView> {
    return dayView(this.challenge(), day);
  }

  /** `Setup.tutorial_claimed(player)`: whether the account claimed First Stone (`claimTutorial`). */
  async tutorialClaimed(playerId: string): Promise<boolean> {
    return this.tutorialAt(playerId) !== null;
  }

  async terms(gameId: number): Promise<TermsView> {
    return termsOf(this.challenge().games[gameId]);
  }

  /**
   * A Challenge game bought (`EconomyWriter.purchase`'s checks, then `Economy.purchase` and `Challenge.spawn`): the stake, the
   * price the player confirmed and a `min_out` the pool's quote still gives at the slippage, refused with the writer's typed
   * errors and nothing paid. The price leaves the ledger's USDC; the swap's PAVED is burned but the Vault's part, which joins
   * the Vault (its rate rises, as on chain). The mock pays no referrer, as for its packs. The receipt holds `GameSpawned` and
   * `Purchased`; the game's random is drawn from its spawn (`SPAWN_DRAW`).
   */
  async purchase(account: string, request: PurchaseRequest): Promise<WriteResult & { gameId: number }> {
    if (!isStake(request.stake)) throw new WriteError(`A stake is 1 to 10, got ${String(request.stake)}`);
    if (await this.spawnPaused()) throw new SpawnPausedError();
    const figures = purchaseFigures(this.challenge(), request.stake, this.second());
    if (request.confirmedPrice !== figures.price) throw new PurchasePriceChangedError(request.confirmedPrice, figures.price);
    if (typeof request.confirmedMinOut !== "bigint" || request.confirmedMinOut <= 0n) throw new WriteError("No confirmed minimum PAVED: confirm again");
    const slippage = request.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
    if (slippage < 0n || slippage > MAX_SLIPPAGE_BPS) throw new WriteError(`Slippage is 0 to ${MAX_SLIPPAGE_BPS} bps`);
    const minOut = minOutFor(figures.poolOut, slippage);
    if (minOut < request.confirmedMinOut) throw new PoolPriceMovedError(request.confirmedMinOut, minOut);
    const short = () => new WriteError("Not enough USDC for this game: get test USDC first. Nothing was sent.");
    if ((await this.usdcBalance(account)) < figures.price) throw short();
    await sleep(this.latency);
    let gameId = 0;
    const result = await this.writeGame(account, (p, c) => {
      // Checked again at commit: another purchase may have spent the USDC during the wait.
      if (BigInt(p.usdc) < figures.price) throw short();
      const now = this.second();
      const player = addressKey(account);
      const bought = purchaseFigures(c, request.stake, now);
      const game = spawn(c, player, now, { stake: request.stake, figures: bought }, poseidon(SPAWN_DRAW, BigInt(player), c.next, now));
      gameId = game.id;
      p.usdc = (BigInt(p.usdc) - bought.price).toString();
      const t = this.totals();
      this.state.vault = { assets: (t.assets + bought.vaultPaved).toString(), supply: t.supply.toString() };
      const day = dayOfTime(now);
      return [
        this.event("GameSpawned", { gameId, playerId: player, mode: 1, dayId: day, startTime: now, price: bought.price }),
        this.event("Purchased", {
          gameId,
          playerId: player,
          day,
          stake: request.stake,
          price: bought.price,
          referrer: "0x0",
          referral: 0n,
          burnedQuote: bought.burnQuote,
          burned: bought.burned,
          margin: bought.price - bought.burnQuote,
          supply: 0n,
          factor: 10_000,
          reference: bought.reference,
          vaultPaved: bought.vaultPaved,
        }),
      ];
    });
    return { ...result, gameId };
  }

  /** `Challenge.spawn_free`: one free-game credit spent (`NoCreditError` without one) for a game of no stake and no terms. */
  async spawnFree(account: string): Promise<WriteResult & { gameId: number }> {
    if (await this.spawnPaused()) throw new SpawnPausedError();
    if ((await this.account(account)).credits < 1) throw new NoCreditError();
    await sleep(this.latency);
    let gameId = 0;
    const result = await this.writeGame(account, (p, c) => {
      if (p.credits < 1) throw new NoCreditError();
      p.credits -= 1;
      const now = this.second();
      const player = addressKey(account);
      gameId = spawn(c, player, now, null, poseidon(SPAWN_DRAW, BigInt(player), c.next, now)).id;
      return [this.event("GameSpawned", { gameId, playerId: player, mode: 1, dayId: dayOfTime(now), startTime: now, price: 0n })];
    });
    return { ...result, gameId };
  }

  /**
   * `EconomyWriter.settle` then `Economy.settle(game_ids)`: each game bought, recorded, not settled, and its day closable (from
   * the end of the next day, P-34), else the writer's typed refusal and nothing moves. Anyone may settle; the reward is minted
   * to the game's player. A recorded expired game settles for 0 (`noReward`). The receipt holds one `Settled` per game.
   */
  async settleGames(account: string, gameIds: number[]): Promise<WriteResult & { noReward: number[] }> {
    const ids = [...new Set(gameIds)];
    if (ids.length === 0) throw new WriteError("No game to settle");
    const check = (c: StoredChallenge): number[] => {
      const now = this.second();
      const noReward: number[] = [];
      for (const id of ids) {
        const game = c.games[id];
        if (!game || game.stake === 0) throw new SettleUnknownGameError(id);
        if (game.settled) throw new WriteError(`Game ${id} is already settled`);
        if (!game.recorded && now >= expiryOf(game)) throw new SettleNotRecordedError(id, true);
        if (!game.recorded) throw new SettleNotRecordedError(id);
        const after = settlesAfter(dayOfTime(game.start));
        if (now < after) throw new SettleTooEarlyError(undefined, `Game ${id} settles after ${new Date(after * 1000).toISOString()}`);
        if (game.expired) noReward.push(id);
      }
      return noReward;
    };
    check(this.challenge());
    await sleep(this.latency);
    let noReward: number[] = [];
    const result = await this.writeGame(account, (p, c) => {
      noReward = check(c);
      const self = addressKey(account);
      return ids.map((id) => {
        const game = c.games[id]!;
        const settled = settleGame(c, game);
        if (settled.reward > 0n) {
          // The mint goes to the game's player: the settler's own copy, or another player's record.
          const owner = game.player === self ? p : (this.state.players[game.player] ??= newPlayer(this.starting));
          owner.paved = (BigInt(owner.paved) + settled.reward).toString();
        }
        return this.event("Settled", { gameId: id, playerId: game.player, day: settled.day, score: settled.score, threshold: settled.threshold, reward: settled.reward });
      });
    });
    return { ...result, noReward };
  }

  /**
   * A Challenge write (#927): `change` works on the player's copy and on the stored games and days (created on the first
   * write), which a throw puts back as they were (`commit`).
   */
  private writeGame(account: string, change: (player: StoredPlayer, challenge: StoredChallenge, hash: string) => DecodedEvent[]): Promise<WriteResult> {
    return this.write(account, (p, hash) => change(p, (this.state.challenge ??= freshChallenge()), hash));
  }

  /** The stored games and days for a read (none stored yet: a fresh Challenge's). */
  private challenge(): StoredChallenge {
    this.sync();
    return this.state.challenge ?? freshChallenge();
  }

  /** A stored game for a read or a move; an id with no game is the view's refusal (`Game: does not exist`). */
  private gameOf(c: StoredChallenge, gameId: number): StoredGame {
    const game = c.games[gameId];
    if (!game) throw new ViewError("game-not-found", "Game: does not exist");
    return game;
  }

  /**
   * One move of `account` on its game (`Challenge.build`, `discard`, `surrender`): the player's game only, not over; a build
   * or a discard past its 24 h is refused (`GameExpiredError`), a surrender is not. The engine's refusal is the writer's
   * `WriteError` with the contract's text, and nothing moves. The receipt's events are the contract's: `Built` or
   * `Discarded`, each `Scored`, and `GameOver` when the move ends the game.
   */
  protected async playOn(account: string, key: GameKey, move: SeededMove): Promise<WriteResult> {
    const check = (c: StoredChallenge): StoredGame => {
      const game = c.games[key.gameId];
      if (!game) throw new WriteError("Game: does not exist");
      if (game.player !== addressKey(account)) throw new WriteError("Game: not the game player");
      if (game.end !== 0) throw new WriteError("Game: is over");
      if (move.kind !== "surrender" && this.second() >= expiryOf(game)) throw new GameExpiredError();
      return game;
    };
    check(this.challenge());
    await sleep(this.latency);
    return this.writeGame(account, (p, c) => {
      const game = check(c);
      const now = this.second();
      let outcome;
      try {
        outcome = playMove(c, game, move, now);
      } catch (error) {
        throw new WriteError(error instanceof Error ? error.message : String(error));
      }
      const player = game.player;
      const events: DecodedEvent[] = [];
      if (move.kind === "build") events.push(this.event("Built", { gameId: game.id, playerId: player, tileId: outcome.tileId, plan: outcome.plan, orientation: move.orientation, x: move.x, y: move.y }));
      if (move.kind === "discard") events.push(this.event("Discarded", { gameId: game.id, playerId: player, tileId: outcome.tileId, plan: outcome.plan, points: outcome.taken }));
      for (const s of outcome.scored) events.push(this.event("Scored", { gameId: game.id, playerId: player, category: s.category, size: s.size, points: s.points }));
      if (outcome.over) {
        const dayId = game.end !== 0 && dayOfTime(game.end) === dayOfTime(game.start) ? dayOfTime(game.start) : 0;
        events.push(this.event("GameOver", { gameId: game.id, playerId: player, dayId, mode: 1, score: outcome.score, startTime: game.start, endTime: game.end }));
        // A finished Challenge game, a free one too, as task 1 counts it for the achievements.
        countTutorial(p, "challenge-finished");
        if (game.stake > 0) events.push(this.event("Recorded", { gameId: game.id, score: outcome.score, expired: game.expired }));
      }
      return events;
    });
  }
}
