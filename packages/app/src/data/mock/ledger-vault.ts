import { FAUCET_USDC_AMOUNT, VaultAmountChangedError, VaultBalanceError, VaultExitFeeChangedError, VaultOverMaxRedeemError, VaultOverMaxWithdrawError, VaultZeroSharesError, WriteError, redeemFee, withdrawFee, type VaultPosition, type WriteResult } from "@paved/chain";
import { MOCK_VAULT, MOCK_SPLIT, type StoredPlayer, ceilDiv, sleep } from "./ledger-state";
import { LedgerPuzzle } from "./ledger-puzzle";

/** The Economy's settings, the Vault (OpenZeppelin's ERC4626 with the exit fee) and the tokens' balances, with their writes. One link of `MockLedger`'s chain (`ledger.ts`). */
export abstract class LedgerVault extends LedgerPuzzle {
  async spawnPaused(): Promise<boolean> {
    return false;
  }

  async guardian(): Promise<string> {
    return "0x0";
  }

  async split() {
    return { ...MOCK_SPLIT };
  }

  async seller(): Promise<string> {
    return this.options.seller;
  }

  async vault(account: string): Promise<VaultPosition> {
    this.sync();
    return this.positionOf(this.peek(account));
  }

  async maxRedeem(account: string): Promise<bigint> {
    this.sync();
    return BigInt(this.peek(account).shares);
  }

  // OpenZeppelin's ERC4626 at offset 0 with the Vault's exit fee (`contracts/src/systems/vault.cairo`), as the chain rounds.
  async previewDeposit(assets: bigint): Promise<bigint> {
    this.sync();
    return this.depositShares(assets);
  }

  async previewMint(shares: bigint): Promise<bigint> {
    this.sync();
    return this.mintAssets(shares);
  }

  async previewWithdraw(assets: bigint): Promise<bigint> {
    this.sync();
    return this.withdrawShares(assets);
  }

  async previewRedeem(shares: bigint): Promise<bigint> {
    this.sync();
    const value = this.toAssets(shares);
    return value - redeemFee(value, MOCK_VAULT.exitFeeBps);
  }

  async delegateOf(): Promise<string | null> {
    return null;
  }

  /** `Paved.balance_of`: the PAVED the account holds, moved by its deposits and withdraws (none at the start). */
  async pavedBalance(account: string): Promise<bigint> {
    this.sync();
    return BigInt(this.peek(account).paved);
  }

  /** The USDC's `balance_of`: the faucet's at the start and each `mint`, less what the packs took. */
  async usdcBalance(account: string): Promise<bigint> {
    this.sync();
    return BigInt(this.peek(account).usdc);
  }

  /**
   * `Faucet.mint(self, FAUCET_USDC_AMOUNT)`: the faucet's USDC added to the account's. The mock's faucet has no cap (the
   * contract's ends an address at 20,000 USDC): "Get test USDC" is always there (#927). The receipt is the token's `Transfer`
   * from 0x0, as the mint emits it.
   */
  async mint(account: string): Promise<WriteResult> {
    await sleep(this.latency);
    return this.write(account, (p) => {
      p.usdc = (BigInt(p.usdc) + FAUCET_USDC_AMOUNT).toString();
      return [this.event("Transfer", { from: "0x0", to: account, value: FAUCET_USDC_AMOUNT })];
    });
  }

  /** `Vault.deposit(amount, self)`: the shares `preview_deposit` gives; refused above the wallet's PAVED or for 0 shares. */
  async deposit(account: string, amount: bigint, options: { confirmedAmount: bigint }): Promise<WriteResult> {
    this.checkAmount(amount, options.confirmedAmount);
    const balance = await this.pavedBalance(account);
    if (balance < amount) throw new VaultBalanceError(balance);
    if ((await this.previewDeposit(amount)) === 0n) throw new VaultZeroSharesError();
    await sleep(this.latency);
    return this.write(account, (p) => {
      // Checked again at commit, on the stored state: another deposit may have taken the PAVED during the wait, or moved the rate.
      const now = BigInt(p.paved);
      if (now < amount) throw new VaultBalanceError(now);
      const shares = this.depositShares(amount);
      if (shares === 0n) throw new VaultZeroSharesError();
      this.move(p, shares, amount);
      p.paved = (BigInt(p.paved) - amount).toString();
      return [this.event("Deposit", { sender: account, owner: account, assets: amount, shares })];
    });
  }

  /** `Vault.withdraw(amount, self, self)`: burns the shares of the amount and its fee; the fee stays in the Vault. */
  async withdraw(account: string, amount: bigint, options: { confirmedAmount: bigint; confirmedExitFeeBps?: number }): Promise<WriteResult> {
    this.checkAmount(amount, options.confirmedAmount);
    const position = await this.vault(account);
    this.checkFee(options.confirmedExitFeeBps);
    if (amount > position.maxWithdraw) throw new VaultOverMaxWithdrawError(position.maxWithdraw);
    await sleep(this.latency);
    return this.write(account, (p) => {
      // Checked again at commit: another withdraw may have burned the shares during the wait.
      const max = this.positionOf(p).maxWithdraw;
      if (amount > max) throw new VaultOverMaxWithdrawError(max);
      const shares = this.withdrawShares(amount);
      this.move(p, -shares, -amount);
      p.paved = (BigInt(p.paved) + amount).toString();
      return [this.event("Withdraw", { sender: account, receiver: account, owner: account, assets: amount, shares })];
    });
  }

  /** `Vault.mint(shares, self)`: the PAVED `preview_mint` asks; refused above the wallet's PAVED. Its receipt is a `Deposit`. */
  async vaultMint(account: string, shares: bigint, options: { confirmedShares: bigint }): Promise<WriteResult> {
    this.checkAmount(shares, options.confirmedShares);
    const balance = await this.pavedBalance(account);
    const assets = await this.previewMint(shares);
    if (balance < assets) throw new VaultBalanceError(balance);
    await sleep(this.latency);
    return this.write(account, (p) => {
      // Checked again at commit, on the stored state: the rate may have moved, or another deposit taken the PAVED.
      const cost = this.mintAssets(shares);
      const now = BigInt(p.paved);
      if (now < cost) throw new VaultBalanceError(now);
      this.move(p, shares, cost);
      p.paved = (now - cost).toString();
      return [this.event("Deposit", { sender: account, owner: account, assets: cost, shares })];
    });
  }

  /** `Vault.redeem(shares, self, self)`: their PAVED less the exit fee; refused above the vPAVED held. */
  async vaultRedeem(account: string, shares: bigint, options: { confirmedShares: bigint; confirmedExitFeeBps?: number }): Promise<WriteResult> {
    this.checkAmount(shares, options.confirmedShares);
    const position = await this.vault(account);
    this.checkFee(options.confirmedExitFeeBps);
    if (shares > position.shares) throw new VaultOverMaxRedeemError();
    await sleep(this.latency);
    return this.write(account, (p) => {
      // Checked again at commit: another exit may have burned the shares during the wait.
      if (shares > BigInt(p.shares)) throw new VaultOverMaxRedeemError();
      const value = this.toAssets(shares);
      const assets = value - redeemFee(value, MOCK_VAULT.exitFeeBps);
      this.move(p, -shares, -assets);
      p.paved = (BigInt(p.paved) + assets).toString();
      return [this.event("Withdraw", { sender: account, receiver: account, owner: account, assets, shares })];
    });
  }

  /** `Vault.redeem(shares, self, self)` of every vPAVED held, at the shares the player confirmed. */
  async withdrawAll(account: string, options: { confirmedShares: bigint; confirmedExitFeeBps?: number }): Promise<WriteResult> {
    const position = await this.vault(account);
    if (position.shares === 0n) throw new WriteError("No vPAVED to withdraw");
    if (position.shares !== options.confirmedShares) throw new VaultAmountChangedError(options.confirmedShares, position.shares);
    this.checkFee(options.confirmedExitFeeBps);
    await sleep(this.latency);
    return this.write(account, (p) => {
      // The shares held at commit must still be the ones confirmed.
      const now = this.positionOf(p);
      if (now.shares !== options.confirmedShares) throw new VaultAmountChangedError(options.confirmedShares, now.shares);
      this.move(p, -now.shares, -now.maxWithdraw);
      p.paved = (BigInt(p.paved) + now.maxWithdraw).toString();
      return [this.event("Withdraw", { sender: account, receiver: account, owner: account, assets: now.maxWithdraw, shares: now.shares })];
    });
  }

  protected totals(): { assets: bigint; supply: bigint } {
    return { assets: BigInt(this.state.vault.assets), supply: BigInt(this.state.vault.supply) };
  }

  private positionOf(p: StoredPlayer): VaultPosition {
    const shares = BigInt(p.shares);
    const { assets, supply } = this.totals();
    const value = this.toAssets(shares);
    return { shares, value, maxWithdraw: value - redeemFee(value, MOCK_VAULT.exitFeeBps), exitFeeBps: MOCK_VAULT.exitFeeBps, totalAssets: assets, totalSupply: supply };
  }

  private depositShares(assets: bigint): bigint {
    const t = this.totals();
    return (assets * (t.supply + 1n)) / (t.assets + 1n);
  }

  /** `preview_mint`: `convert_to_assets` rounded up (no entry fee). */
  private mintAssets(shares: bigint): bigint {
    const t = this.totals();
    return ceilDiv(shares * (t.assets + 1n), t.supply + 1n);
  }

  private withdrawShares(assets: bigint): bigint {
    const t = this.totals();
    return ceilDiv((assets + withdrawFee(assets, MOCK_VAULT.exitFeeBps)) * (t.supply + 1n), t.assets + 1n);
  }

  protected toAssets(shares: bigint): bigint {
    const t = this.totals();
    return (shares * (t.assets + 1n)) / (t.supply + 1n);
  }

  /** The player's shares and the Vault's totals move by `shares` vPAVED and `assets` PAVED (negative out). */
  private move(p: StoredPlayer, shares: bigint, assets: bigint): void {
    const t = this.totals();
    this.state.vault = { assets: (t.assets + assets).toString(), supply: (t.supply + shares).toString() };
    p.shares = (BigInt(p.shares) + shares).toString();
  }

  private checkAmount(amount: bigint, confirmed: bigint): void {
    if (amount <= 0n) throw new WriteError("An amount must be above 0");
    if (amount !== confirmed) throw new VaultAmountChangedError(confirmed, amount);
  }

  private checkFee(confirmed: number | undefined): void {
    if (confirmed !== undefined && confirmed !== MOCK_VAULT.exitFeeBps) throw new VaultExitFeeChangedError(confirmed, MOCK_VAULT.exitFeeBps);
  }
}
