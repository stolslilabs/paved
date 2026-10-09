import { describe, expect, it } from "vitest";
import { emptyTournament } from "@paved/chain";
import { canConfirmEntry, canOfferCreate, entryFee, formatTimeRemaining, formatTokenAmount, podium, shortAddress, TOKEN_LABEL, parseTokenAmount, playerNameError, tokenLabel } from "../src/utils/landing-helpers";

describe("landing helpers", () => {
  it("labels the token PAVED (D-10)", () => {
    expect(TOKEN_LABEL).toBe("PAVED");
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
    expect(entryFee(ok, TOKEN, 18)).toEqual({ kind: "amount", amount: 10n ** 18n });
    expect(entryFee({ data: { token: "0x4", amount: 0n }, error: null }, TOKEN, 18)).toEqual({ kind: "free" });
  });

  it("another token has no figure and no confirm", () => {
    const fee = entryFee({ data: { token: "0x77", amount: 5n }, error: null }, TOKEN, 18);
    expect(fee).toEqual({ kind: "unknown-token" });
    expect(canConfirmEntry(fee, false)).toBe(false);
  });

  it("loading and failed reads cannot be confirmed", () => {
    const loading = entryFee({ data: null, error: null }, TOKEN, 18);
    const failed = entryFee({ data: null, error: "fetch failed" }, TOKEN, 18);
    expect(loading).toEqual({ kind: "loading" });
    expect(failed).toEqual({ kind: "error", message: "fetch failed" });
    expect(canConfirmEntry(loading, false)).toBe(false);
    expect(canConfirmEntry(failed, false)).toBe(false);
  });

  it("a stale figure does not outlive an error", () => {
    expect(entryFee({ data: ok.data, error: "fetch failed" }, TOKEN, 18).kind).toBe("error");
  });

  it("resuming a game costs nothing, so it is always allowed; a known fee is confirmable", () => {
    expect(canConfirmEntry({ kind: "loading" }, true)).toBe(true);
    expect(canConfirmEntry(entryFee(ok, TOKEN, 18), false)).toBe(true);
  });
});

describe("amounts, names and missing decimals (t-0028)", () => {
  it("missing decimals: a priced entry is unavailable, never shown with 18", () => {
    const priced = { data: { token: "0x4", amount: 5n }, error: null };
    expect(entryFee(priced, "0x04", null).kind).toBe("error");
    expect(entryFee({ data: { token: "0x4", amount: 0n }, error: null }, "0x04", null)).toEqual({ kind: "free" });
    expect(tokenLabel(5n, null)).toBe("—");
    expect(tokenLabel(10n ** 18n, 18)).toBe(`1 ${TOKEN_LABEL}`);
  });

  it("parseTokenAmount", () => {
    expect(parseTokenAmount("1.5", 18)).toBe(15n * 10n ** 17n);
    expect(parseTokenAmount(" 2 ", 6)).toBe(2_000_000n);
    expect(parseTokenAmount("0.000001", 6)).toBe(1n);
    for (const bad of ["", "0", "0.0", "-1", "1e3", "1.1234567", ".5", "1,5", "abc"]) expect(parseTokenAmount(bad, 6)).toBeNull();
    expect(parseTokenAmount("1", null)).toBeNull();
  });

  it("playerNameError: 1 to 31 printable ASCII", () => {
    expect(playerNameError("Paved")).toBeNull();
    expect(playerNameError("a".repeat(31))).toBeNull();
    for (const bad of ["", "a".repeat(32), "   ", "né", "tab\t"]) expect(playerNameError(bad)).not.toBeNull();
  });
});
