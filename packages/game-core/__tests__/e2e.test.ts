import { describe, expect, it } from "vitest";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { guildConversation, privateConversation } from "../src";
import {
  E2E_PADDED_BYTES,
  E2E_REPORT_BEFORE,
  bindingMatches,
  bindingOf,
  checkCommitment,
  conversationKey,
  epochDue,
  guildMessageKey,
  keyBindingTypedData,
  keyPairOf,
  labelledKeyPair,
  makeEpoch,
  newKeyPair,
  open,
  openEpoch,
  privateVersions,
  publicOf,
  replayedEnvelopes,
  reportReveal,
  safetyCode,
  seal,
  unwrapKey,
  wrapKey,
  type Envelope,
  type PrivateHeader,
} from "../src/social/e2e";

// The encryption of #997 (`social/e2e.ts`): the libraries against their published vectors first, then each rule of the
// acceptance: both players derive the same key and a third opens nothing, a changed header, nonce or ciphertext fails, a
// kicked member cannot open the next epoch nor a joiner an earlier one, a wrong franking key or text fails the commitment, and
// the safety code is the same for both players.

const h = hexToBytes;

describe("the libraries against their published vectors", () => {
  it("X25519: RFC 7748, section 5.2 (the function) and section 6.1 (Alice and Bob)", () => {
    expect(bytesToHex(x25519.scalarMult(h("a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4"), h("e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c")))).toBe(
      "c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552",
    );
    const alice = h("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a");
    const bob = h("5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb");
    expect(bytesToHex(x25519.getPublicKey(alice))).toBe("8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a");
    expect(bytesToHex(x25519.getPublicKey(bob))).toBe("de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f");
    const shared = "4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742";
    expect(bytesToHex(x25519.getSharedSecret(alice, x25519.getPublicKey(bob)))).toBe(shared);
    expect(bytesToHex(x25519.getSharedSecret(bob, x25519.getPublicKey(alice)))).toBe(shared);
    // And through this module's key pairs.
    expect(bytesToHex(keyPairOf(alice, 1).publicKey)).toBe("8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a");
  });

  it("HKDF-SHA-256: RFC 5869, test case 1", () => {
    const okm = hkdf(sha256, h("0b".repeat(22)), h("000102030405060708090a0b0c"), h("f0f1f2f3f4f5f6f7f8f9"), 42);
    expect(bytesToHex(okm)).toBe("3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865");
  });

  it("HMAC-SHA-256: RFC 4231, test case 2", () => {
    expect(bytesToHex(hmac(sha256, utf8ToBytes("Jefe"), utf8ToBytes("what do ya want for nothing?")))).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  });

  it("XChaCha20-Poly1305: draft-irtf-cfrg-xchacha-03, appendix A.3.1", () => {
    const plaintext = utf8ToBytes("Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.");
    const aad = h("50515253c0c1c2c3c4c5c6c7");
    const key = h("808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f");
    const nonce = h("404142434445464748494a4b4c4d4e4f5051525354555657");
    const ciphertext =
      "bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb731c7f1b0b4aa6440bf3a82f4eda7e39ae64c6708c54c216cb96b72e1213b4522f8c9ba40db5d945b11b69b982c1bb9e3f3fac2bc369488f76b2383565d3fff921f9664c97637da9768812f615c68b13b52e";
    const tag = "c0875924c1c7987947deafd8780acf49";
    const sealed = xchacha20poly1305(key, nonce, aad).encrypt(plaintext);
    expect(bytesToHex(sealed)).toBe(ciphertext + tag);
    expect(xchacha20poly1305(key, nonce, aad).decrypt(sealed)).toEqual(plaintext);
  });
});

const ALICE = "0xa11ce";
const BOB = "0xb0b";
const EVE = "0xe5e";
const DM = privateConversation(ALICE, BOB);
const alice = labelledKeyPair("alice");
const bob = labelledKeyPair("bob");
const eve = labelledKeyPair("eve");

const header = (over: Partial<PrivateHeader> = {}): PrivateHeader => ({ conversation: DM, sender: ALICE, versions: privateVersions(DM, ALICE, alice.version, bob.version), at: 1_793_448_000, counter: 1, ...over });

describe("a private conversation", () => {
  it("has the same key on both sides, and a third player's key is another", () => {
    const fromAlice = conversationKey(DM, ALICE, alice, publicOf(bob));
    const fromBob = conversationKey(DM, BOB, bob, publicOf(alice));
    expect(bytesToHex(fromAlice)).toBe(bytesToHex(fromBob));
    expect(bytesToHex(conversationKey(DM, ALICE, eve, publicOf(bob)))).not.toBe(bytesToHex(fromAlice));
    // Another conversation, or another version of a key, gives another key.
    const other = privateConversation(ALICE, EVE);
    expect(bytesToHex(conversationKey(other, ALICE, alice, publicOf(eve)))).not.toBe(bytesToHex(fromAlice));
    const bob2 = labelledKeyPair("bob", 2);
    expect(bytesToHex(conversationKey(DM, ALICE, alice, publicOf(bob2)))).not.toBe(bytesToHex(fromAlice));
  });

  it("orders both versions as its ID does, whoever asks", () => {
    const [first] = DM.slice(3).split(":");
    expect(privateVersions(DM, ALICE, 3, 7)).toEqual(first === ALICE ? [3, 7] : [7, 3]);
    expect(privateVersions(DM, BOB, 7, 3)).toEqual(privateVersions(DM, ALICE, 3, 7));
    expect(() => privateVersions(DM, EVE, 1, 1)).toThrow();
    expect(() => privateVersions(guildConversation(4), ALICE, 1, 1)).toThrow();
  });

  it("seals a message both players open, and a third player's key opens nothing", () => {
    const envelope = seal(conversationKey(DM, ALICE, alice, publicOf(bob)), header(), "hello Bob");
    expect(open(conversationKey(DM, BOB, bob, publicOf(alice)), envelope)).toMatchObject({ text: "hello Bob" });
    expect(open(conversationKey(DM, ALICE, alice, publicOf(bob)), envelope)).toMatchObject({ text: "hello Bob" });
    // Eve has Alice's public key; her own secret key derives another key.
    expect(open(conversationKey(DM, BOB, eve, publicOf(alice)), envelope)).toBeNull();
    expect(JSON.stringify(envelope)).not.toContain("hello");
  });

  it("pads every text to the same length, and refuses one that does not fit", () => {
    const key = conversationKey(DM, ALICE, alice, publicOf(bob));
    const short = seal(key, header(), "hi");
    const long = seal(key, header(), "🎉".repeat(200));
    expect(short.ciphertext.length).toBe((E2E_PADDED_BYTES + 16) * 2);
    expect(long.ciphertext.length).toBe(short.ciphertext.length);
    expect(open(key, long)!.text).toBe("🎉".repeat(200));
    expect(() => seal(key, header(), "x".repeat(E2E_PADDED_BYTES))).toThrow();
  });

  it("fails to open once its header, nonce or ciphertext is changed", () => {
    const key = conversationKey(DM, BOB, bob, publicOf(alice));
    const envelope = seal(conversationKey(DM, ALICE, alice, publicOf(bob)), header(), "pay me 5");
    const flip = (hex: string, at: number) => hex.slice(0, at) + (hex[at] === "0" ? "1" : "0") + hex.slice(at + 1);
    const changed: Envelope[] = [
      { ...envelope, header: { ...envelope.header, conversation: privateConversation(ALICE, EVE) } },
      { ...envelope, header: { ...envelope.header, sender: BOB } },
      { ...envelope, header: { ...envelope.header, at: envelope.header.at + 1 } },
      { ...envelope, header: { ...envelope.header, counter: 2 } },
      { ...envelope, header: { ...(envelope.header as PrivateHeader), versions: [2, 1] } },
      { ...envelope, nonce: flip(envelope.nonce, 0) },
      { ...envelope, ciphertext: flip(envelope.ciphertext, 10) },
      { ...envelope, ciphertext: flip(envelope.ciphertext, envelope.ciphertext.length - 1) },
      { ...envelope, ciphertext: envelope.ciphertext.slice(0, -2) },
      { ...envelope, nonce: "zz" },
    ];
    expect(open(key, envelope)).not.toBeNull();
    for (const e of changed) expect(open(key, e)).toBeNull();
  });

  it("draws its nonce and franking key afresh: the same text seals differently", () => {
    const key = conversationKey(DM, ALICE, alice, publicOf(bob));
    const a = seal(key, header(), "same");
    const b = seal(key, header(), "same");
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.commitment).not.toBe(b.commitment);
  });
});

describe("replays", () => {
  it("flag an envelope whose sender's counter repeats or goes back, each sender on their own", () => {
    const h = (sender: string, counter: number) => ({ sender, counter });
    expect(replayedEnvelopes([h(ALICE, 1), h(BOB, 1), h(ALICE, 2), h(BOB, 2)])).toEqual([false, false, false, false]);
    // The same message stored twice: the first copy stays, the copy is a replay.
    expect(replayedEnvelopes([h(ALICE, 1), h(ALICE, 2), h(ALICE, 2)])).toEqual([false, false, true]);
    // An older counter after a newer one, whatever the address's form.
    expect(replayedEnvelopes([h(ALICE, 3), h("0x00A11CE", 2), h(ALICE, 4)])).toEqual([false, true, false]);
    // A gap is no replay (a message held back, or deleted from the kept history).
    expect(replayedEnvelopes([h(ALICE, 1), h(ALICE, 5)])).toEqual([false, false]);
    expect(replayedEnvelopes([h(ALICE, 0), h(ALICE, 1.5)])).toEqual([true, true]);
  });
});

describe("the commitments (message franking)", () => {
  const key = conversationKey(DM, ALICE, alice, publicOf(bob));
  const envelope = seal(key, header(), "send your seed phrase");
  const opened = open(key, envelope)!;
  const revealed = { text: opened.text, frankingKey: opened.frankingKey, conversation: DM, sender: ALICE, at: envelope.header.at };

  it("match the revealed text and franking key, as a moderator checks", () => {
    expect(checkCommitment(revealed, envelope.commitment)).toBe(true);
  });

  it("fail with a wrong franking key, text, conversation, sender or time", () => {
    expect(checkCommitment({ ...revealed, frankingKey: bytesToHex(new Uint8Array(32).fill(7)) }, envelope.commitment)).toBe(false);
    expect(checkCommitment({ ...revealed, text: "send your seed phrase!" }, envelope.commitment)).toBe(false);
    expect(checkCommitment({ ...revealed, conversation: privateConversation(ALICE, EVE) }, envelope.commitment)).toBe(false);
    expect(checkCommitment({ ...revealed, sender: BOB }, envelope.commitment)).toBe(false);
    expect(checkCommitment({ ...revealed, at: revealed.at + 1 }, envelope.commitment)).toBe(false);
    expect(checkCommitment({ ...revealed, frankingKey: "nothex" }, envelope.commitment)).toBe(false);
  });

  it("make a message whose commitment does not match unreadable: a sender cannot show another text than the committed one", () => {
    // A sender seals one text and commits to another: the commitment of a different franking key.
    const other = seal(key, header(), "a harmless line");
    expect(open(key, { ...envelope, commitment: other.commitment })).toBeNull();
  });

  it("reveal the reported message and the 5 before it", () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}` }));
    expect(E2E_REPORT_BEFORE).toBe(5);
    expect(reportReveal(messages, "m8").map((m) => m.id)).toEqual(["m3", "m4", "m5", "m6", "m7", "m8"]);
    expect(reportReveal(messages, "m2").map((m) => m.id)).toEqual(["m0", "m1", "m2"]);
    expect(reportReveal(messages, "m9", 0).map((m) => m.id)).toEqual(["m9"]);
    expect(reportReveal(messages, "nope")).toEqual([]);
  });
});

describe("a guild's epochs", () => {
  const GUILD = guildConversation(12);
  const officer = { player: "0xff1ce", pair: labelledKeyPair("officer") };
  const member = { player: "0x3e3be7", pair: labelledKeyPair("member") };
  const kicked = { player: "0x6b1c4e", pair: labelledKeyPair("kicked") };
  const joiner = { player: "0x701e7", pair: labelledKeyPair("joiner") };
  const as = (...ms: (typeof officer)[]) => ms.map((m) => ({ player: m.player, key: publicOf(m.pair) }));

  it("wraps its key for each member, and only they open it", () => {
    const { record, key } = makeEpoch({ conversation: GUILD, epoch: 1, creator: officer.player, at: 100, members: as(officer, member) });
    expect(record.members).toEqual([member.player, officer.player].sort());
    expect(bytesToHex(openEpoch(record, officer.player, [officer.pair])!)).toBe(bytesToHex(key));
    expect(bytesToHex(openEpoch(record, member.player, [member.pair])!)).toBe(bytesToHex(key));
    expect(openEpoch(record, joiner.player, [joiner.pair])).toBeNull();
    // A member's wrap opened with another's key, or moved to another member, opens nothing.
    expect(openEpoch(record, member.player, [{ ...officer.pair, version: member.pair.version }])).toBeNull();
    expect(unwrapKey(record.wraps[member.player]!, GUILD, 1, officer.player, officer.pair)).toBeNull();
    // Bound to its epoch.
    expect(unwrapKey(record.wraps[member.player]!, GUILD, 2, member.player, member.pair)).toBeNull();
  });

  it("starts anew at a kick: the kicked member cannot open the next epoch; a joiner cannot open the earlier ones", () => {
    const first = makeEpoch({ conversation: GUILD, epoch: 1, creator: officer.player, at: 100, members: as(officer, member, kicked) });
    const firstKey = guildMessageKey(first.key, GUILD, 1);
    const before = seal(firstKey, { conversation: GUILD, sender: member.player, epoch: 1, at: 150, counter: 1 }, "before the kick");
    expect(epochDue(first.record, as(officer, member, kicked))).toBe(false);
    expect(epochDue(first.record, as(officer, member))).toBe(true);
    const second = makeEpoch({ conversation: GUILD, epoch: 2, creator: officer.player, at: 200, members: as(officer, member) });
    expect(openEpoch(second.record, kicked.player, [kicked.pair])).toBeNull();
    expect(epochDue(second.record, as(officer, member, joiner))).toBe(true);
    const third = makeEpoch({ conversation: GUILD, epoch: 3, creator: joiner.player, at: 300, members: as(officer, member, joiner) });
    expect(openEpoch(first.record, joiner.player, [joiner.pair])).toBeNull();
    expect(openEpoch(second.record, joiner.player, [joiner.pair])).toBeNull();
    const thirdKey = openEpoch(third.record, joiner.player, [joiner.pair])!;
    const after = seal(guildMessageKey(thirdKey, GUILD, 3), { conversation: GUILD, sender: officer.player, epoch: 3, at: 350, counter: 1 }, "welcome");
    expect(open(guildMessageKey(openEpoch(third.record, member.player, [member.pair])!, GUILD, 3), after)!.text).toBe("welcome");
    // The joiner's epoch key opens nothing of epoch 1, and a message cannot be moved to another epoch.
    expect(open(guildMessageKey(thirdKey, GUILD, 3), before)).toBeNull();
    expect(open(guildMessageKey(thirdKey, GUILD, 3), { ...after, header: { ...after.header, epoch: 1 } })).toBeNull();
    expect(open(firstKey, before)!.text).toBe("before the kick");
  });

  it("is due again when a member's key changes", () => {
    const { record } = makeEpoch({ conversation: GUILD, epoch: 1, creator: officer.player, at: 100, members: as(officer, member) });
    const rotated = [{ player: officer.player, key: publicOf(officer.pair) }, { player: member.player, key: publicOf(labelledKeyPair("member", 2)) }];
    expect(epochDue(record, rotated)).toBe(true);
    // Another key of the same version (a device that lost its keys and made new ones).
    const replaced = [{ player: officer.player, key: publicOf(officer.pair) }, { player: member.player, key: publicOf(labelledKeyPair("member-replaced", 1)) }];
    expect(epochDue(record, replaced)).toBe(true);
    expect(record.wraps[member.player]!.publicKey).toBe(bytesToHex(member.pair.publicKey));
    expect(epochDue(null, [])).toBe(false);
    expect(epochDue(null, as(officer))).toBe(true);
  });

  it("opens with the version a wrap names, from the member's ring", () => {
    const v2 = labelledKeyPair("member", 2);
    const wrap = wrapKey(new Uint8Array(32).fill(9), GUILD, 4, member.player, publicOf(v2));
    expect(unwrapKey(wrap, GUILD, 4, member.player, member.pair)).toBeNull();
    const { record } = makeEpoch({ conversation: GUILD, epoch: 4, creator: member.player, at: 1, members: [{ player: member.player, key: publicOf(v2) }] });
    expect(openEpoch(record, member.player, [member.pair, v2])).not.toBeNull();
    expect(openEpoch(record, member.player, [member.pair])).toBeNull();
  });

  it("is a guild conversation's only", () => {
    expect(() => makeEpoch({ conversation: DM, epoch: 1, creator: ALICE, at: 1, members: [] })).toThrow();
  });
});

describe("the safety code", () => {
  it("is the same for both players: 20 digits in 4 groups of 5", () => {
    const code = safetyCode(alice.publicKey, bob.publicKey);
    expect(code).toMatch(/^\d{5} \d{5} \d{5} \d{5}$/);
    expect(safetyCode(bob.publicKey, alice.publicKey)).toBe(code);
  });

  it("changes when either key changes", () => {
    const code = safetyCode(alice.publicKey, bob.publicKey);
    expect(safetyCode(alice.publicKey, labelledKeyPair("bob", 2).publicKey)).not.toBe(code);
    expect(safetyCode(eve.publicKey, bob.publicKey)).not.toBe(code);
  });
});

describe("the key pairs", () => {
  it("are random, or derived from a label the same on every device", () => {
    const a = newKeyPair();
    const b = newKeyPair();
    expect(a.version).toBe(1);
    expect(bytesToHex(a.publicKey)).not.toBe(bytesToHex(b.publicKey));
    expect(bytesToHex(labelledKeyPair("x", 3).publicKey)).toBe(bytesToHex(labelledKeyPair("x", 3).publicKey));
    expect(bytesToHex(labelledKeyPair("x", 3).publicKey)).not.toBe(bytesToHex(labelledKeyPair("x", 4).publicKey));
    expect(newKeyPair(2).version).toBe(2);
  });

  it("take a 32-byte secret and a version from 1", () => {
    expect(() => keyPairOf(new Uint8Array(31), 1)).toThrow();
    expect(() => keyPairOf(new Uint8Array(32), 0)).toThrow();
  });

  it("refuse a public key of small order", () => {
    expect(() => conversationKey(DM, ALICE, alice, { version: 1, publicKey: new Uint8Array(32) })).toThrow();
  });
});

describe("the key's binding", () => {
  const binding = { account: "0x00ABC", key: publicOf(alice), at: 1_793_448_000 };

  it("is SNIP-12 typed data of 'Paved Messaging Key', version '1', revision 1, read back the same", () => {
    const data = keyBindingTypedData(binding, "SN_SEPOLIA");
    expect(data.domain).toEqual({ name: "Paved Messaging Key", version: "1", chainId: "SN_SEPOLIA", revision: "1" });
    expect(data.primaryType).toBe("MessagingKey");
    expect(data.message).toMatchObject({ account: "0xabc", key_version: "1", time: "1793448000" });
    const hex = bytesToHex(alice.publicKey);
    expect(BigInt(data.message.public_key.high)).toBe(BigInt(`0x${hex.slice(0, 32)}`));
    expect(BigInt(data.message.public_key.low)).toBe(BigInt(`0x${hex.slice(32)}`));
    const back = bindingOf(data)!;
    expect(bytesToHex(back.key.publicKey)).toBe(hex);
    expect(back).toMatchObject({ account: "0xabc", at: binding.at, key: { version: 1 } });
    expect(bindingMatches(back, "0xabc", publicOf(alice))).toBe(true);
  });

  it("does not match another account, key or version, nor read another domain", () => {
    const back = bindingOf(keyBindingTypedData(binding, "SN_SEPOLIA"))!;
    expect(bindingMatches(back, BOB, publicOf(alice))).toBe(false);
    expect(bindingMatches(back, "0xabc", publicOf(bob))).toBe(false);
    expect(bindingMatches(back, "0xabc", { ...publicOf(alice), version: 2 })).toBe(false);
    const data = keyBindingTypedData(binding, "SN_SEPOLIA");
    expect(bindingOf({ ...data, domain: { ...data.domain, name: "Paved Social" } })).toBeNull();
    expect(bindingOf({ ...data, domain: { ...data.domain, revision: "0" } })).toBeNull();
    expect(bindingOf({ ...data, message: { ...data.message, public_key: { low: `0x1${"0".repeat(32)}`, high: "0x0" } } })).toBeNull();
  });
});
