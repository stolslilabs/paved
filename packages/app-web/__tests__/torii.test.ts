import { describe, it, expect, vi, beforeEach } from "vitest";
import { padAddress, feltToString, toriiQuery } from "../src/utils/torii";

describe("padAddress", () => {
  it("pads short address to 66 chars with 0x prefix", () => {
    expect(padAddress("0x123abc")).toBe(
      "0x" + "0".repeat(58) + "123abc"
    );
    expect(padAddress("0x123abc")).toHaveLength(66);
  });

  it("handles already-padded 66-char address", () => {
    const full = "0x" + "a".repeat(64);
    expect(padAddress(full)).toBe(full);
    expect(padAddress(full)).toHaveLength(66);
  });

  it("handles address without 0x prefix", () => {
    expect(padAddress("ff")).toBe("0x" + "0".repeat(62) + "ff");
  });

  it("handles empty hex after prefix", () => {
    expect(padAddress("0x")).toBe("0x" + "0".repeat(64));
  });
});

describe("feltToString", () => {
  it("converts hex felt to UTF-8 string", () => {
    // "Paved" = 0x5061766564
    expect(feltToString("0x5061766564")).toBe("Paved");
  });

  it("returns 'Player' for empty/zero felt", () => {
    expect(feltToString("0x0")).toBe("Player");
    expect(feltToString("0x")).toBe("Player");
    expect(feltToString("0x000")).toBe("Player");
  });

  it("handles felt without leading zeros", () => {
    // "Hi" = 0x4869
    expect(feltToString("0x4869")).toBe("Hi");
  });
});

describe("toriiQuery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts SQL to Torii /sql endpoint and returns parsed JSON", async () => {
    const mockRows = [{ id: 1, name: "test" }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRows),
      })
    );

    const result = await toriiQuery("http://localhost:8080", "SELECT * FROM [test]");

    expect(fetch).toHaveBeenCalledWith("http://localhost:8080/sql", {
      method: "POST",
      body: "SELECT * FROM [test]",
    });
    expect(result).toEqual(mockRows);
  });

  it("returns empty array on fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error"))
    );

    const result = await toriiQuery("http://localhost:8080", "SELECT 1");
    expect(result).toEqual([]);
  });
});
