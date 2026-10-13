/** A fresh seed for a Training game: 31 random bytes (248 bits), below the Stark prime (2^251 + 17 * 2^192 + 1). */
const SEED_BYTES = 31;

/**
 * The only source of a Training seed. Never derived from the date or from a chain read: two games differ, and the
 * day's seed is not offered here. `random` is `crypto.getRandomValues` unless a test passes its own.
 */
export function randomSeed(random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> = (b) => crypto.getRandomValues(b)): bigint {
  const bytes = random(new Uint8Array(SEED_BYTES));
  let seed = 0n;
  for (const byte of bytes) seed = (seed << 8n) | BigInt(byte);
  return seed;
}
