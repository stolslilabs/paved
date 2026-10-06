import { describe, expect, it } from "vitest";
import { emptyTournament } from "@paved/chain";
import { canConfirmEntry, canOfferCreate, entryFee, formatTimeRemaining, formatTokenAmount, podium, shortAddress, TOKEN_LABEL } from "../src/utils/landing-helpers";

describe("landing helpers", () => {
  it("labels the token $TILE (D-2)", () => {
    expect(TOKEN_LABEL).toBe("$TILE");
  });

  it("formats token amounts from the base unit", () => {
    expect(formatTokenAmount(10n ** 18n)).toBe("1");
    expect(formatTokenAmount(15n * 10n ** 17n)).toBe("1.5");
    expect(formatTokenAmount(0n)).toBe("0");
    expect(formatTokenAmount(123456789n, 6, 2)).toBe("123.45");
  });

  it("formats the time left", () => {
    expect(formatTimeRemaining(1000, 2000)).toBe("Ended");
    expect(formatTimeRemaining(2 * 86400 + 3 * 3600, 0)).toBe("2d 3h");
    expect(formatTimeRemaining(3 * 3600 + 5 * 60, 0)).toBe("3h 5m");
  });

  it("lists the filled places of a tournament", () => {
    const t = { ...emptyTournament(5), top1PlayerId: "0x64b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691", top1Score: 40 };
    expect(podium(t)).toEqual([{ name: "0x64b4…5691", score: 40 }]);
    expect(podium(emptyTournament(5))).toEqual([]);
  });

  it("shortens addresses", () => {
    expect(shortAddress("0xabc")).toBe("0xabc");
  });
});

describe("canOfferCreate", () => {
  const none = { data: null, error: null, loading: false, loaded: true };
  it("only after a read answered no player, with an account", () => {
    expect(canOfferCreate("ready", none)).toBe(true);
    expect(canOfferCreate("read-only", none)).toBe(false);
    expect(canOfferCreate("ready", { ...none, data: { id: "0x5", name: "Paved", master: "0x5" } })).toBe(false);
  });

  it("never while the read is in flight, not done yet, or failed (RPC down)", () => {
    expect(canOfferCreate("ready", { ...none, loading: true })).toBe(false);
    expect(canOfferCreate("ready", { ...none, loaded: false })).toBe(false);
    expect(canOfferCreate("ready", { ...none, loaded: false, error: "fetch failed" })).toBe(false);
  });
});

describe("entryFee and canConfirmEntry (review of #209)", () => {
  const TOKEN = "0x04";
  const ok = { data: { token: "0x4", amount: 10n ** 18n }, error: null };

  it("a known fee in the deployment's token", () => {
    expect(entryFee(ok, TOKEN)).toEqual({ kind: "amount", amount: 10n ** 18n });
    expect(entryFee({ data: { token: "0x4", amount: 0n }, error: null }, TOKEN)).toEqual({ kind: "free" });
  });

  it("another token has no figure and no confirm", () => {
    const fee = entryFee({ data: { token: "0x77", amount: 5n }, error: null }, TOKEN);
    expect(fee).toEqual({ kind: "unknown-token" });
    expect(canConfirmEntry(fee, false)).toBe(false);
  });

  it("loading and failed reads cannot be confirmed", () => {
    const loading = entryFee({ data: null, error: null }, TOKEN);
    const failed = entryFee({ data: null, error: "fetch failed" }, TOKEN);
    expect(loading).toEqual({ kind: "loading" });
    expect(failed).toEqual({ kind: "error", message: "fetch failed" });
    expect(canConfirmEntry(loading, false)).toBe(false);
    expect(canConfirmEntry(failed, false)).toBe(false);
  });

  it("a stale figure does not outlive an error", () => {
    expect(entryFee({ data: ok.data, error: "fetch failed" }, TOKEN).kind).toBe("error");
  });

  it("resuming a game costs nothing, so it is always allowed; a known fee is confirmable", () => {
    expect(canConfirmEntry({ kind: "loading" }, true)).toBe(true);
    expect(canConfirmEntry(entryFee(ok, TOKEN), false)).toBe(true);
  });
});
