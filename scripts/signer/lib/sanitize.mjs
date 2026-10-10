// Redacts the secrets of the signer from any text before it is printed: the private key (hex with
// or without 0x, padded or not, any case, decimal, its u128 halves, base64 and base64url) and the
// RPC URL (whole, and its parts that may carry a provider API key, as given or percent-encoded in
// either case). Every URL is redacted too, whatever its host, so a URL a library builds from the
// RPC URL never reaches a terminal or a log.

const KEY_MARK = '[redacted key]';
const URL_MARK = '[redacted url]';
const PART_MARK = '[redacted]';

// A URL with any scheme, up to the first whitespace or quote.
const URL_RE = /[a-z][a-z0-9+.-]*:\/\/[^\s"'<>`]+/gi;
// Number tokens that may spell the key: 0x-hex, bare hex of 32+ digits, or decimal of 20+ digits.
const NUMBER_RE = /0x[0-9a-f]+|\b[0-9a-f]{32,}\b|\b[0-9]{20,}\b/gi;
// Parts of the RPC URL shorter than this are not redacted on their own (`rpc`, `v0_9`).
const MIN_PART = 8;

function parseBig(token) {
  try {
    if (/^0x/i.test(token)) return BigInt(token);
    if (/^[0-9]+$/.test(token)) return BigInt(token);
    return BigInt(`0x${token}`);
  } catch {
    return undefined;
  }
}

// The literal strings to strip for the RPC URL: the URL itself and its long parts.
function urlParts(rpcUrl) {
  const parts = new Set([rpcUrl, rpcUrl.replace(/\/+$/, '')]);
  let url;
  try {
    url = new URL(rpcUrl);
  } catch {
    return [...parts];
  }
  const candidates = [url.href, url.host, url.hostname, url.username, url.password, url.search, url.hash];
  for (const segment of url.pathname.split('/')) candidates.push(segment);
  for (const [name, value] of url.searchParams) candidates.push(name, value);
  for (const candidate of candidates) {
    for (const spelling of [candidate, safeDecode(candidate)]) {
      if (spelling && spelling.length >= MIN_PART) parts.add(spelling);
    }
  }
  return [...parts];
}

function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function replaceAll(text, needle, mark) {
  return needle ? text.split(needle).join(mark) : text;
}

// The key as bytes, base64 and base64url, both 32 bytes wide and minimal, with and without padding.
function base64Spellings(value) {
  const hex = value.toString(16);
  const spellings = [];
  for (const width of [64, hex.length + (hex.length % 2)]) {
    const bytes = Buffer.from(hex.padStart(width, '0'), 'hex');
    for (const encoded of [bytes.toString('base64'), bytes.toString('base64url')]) {
      spellings.push(encoded, encoded.replace(/=+$/, ''));
    }
  }
  return spellings;
}

/**
 * Builds a sanitiser for the given secrets. Either may be undefined (not read yet).
 * @param {{ privateKey?: string, rpcUrl?: string }} secrets
 * @returns {(text: unknown) => string}
 */
export function makeSanitizer({ privateKey, rpcUrl } = {}) {
  const keyValue = privateKey ? parseBig(privateKey.trim()) : undefined;
  // Numbers that spell the key: the key, and its u128 halves (as a u256 is serialised) when each
  // is large enough not to be a common value.
  const keyNumbers = new Set();
  // [needle, mark, kind]: 'key' is caseless and takes a 0x prefix and zeros with it, 'exact' is
  // matched as is (base64), 'caseless' ignores case (URL parts, percent-encoded or not).
  const literals = [];
  if (privateKey) literals.push([privateKey, KEY_MARK, 'key'], [privateKey.trim(), KEY_MARK, 'key']);
  if (keyValue !== undefined && keyValue !== 0n) {
    keyNumbers.add(keyValue);
    const mask = (1n << 128n) - 1n;
    for (const half of [keyValue & mask, keyValue >> 128n]) if (half >= 1n << 64n) keyNumbers.add(half);
    for (const number of keyNumbers) {
      const hex = number.toString(16);
      literals.push([hex, KEY_MARK, 'key'], [hex.padStart(64, '0'), KEY_MARK, 'key'], [number.toString(10), KEY_MARK, 'key']);
    }
    for (const encoded of base64Spellings(keyValue)) {
      literals.push([encoded, KEY_MARK, 'exact'], [encodeURIComponent(encoded), KEY_MARK, 'caseless']);
    }
  }
  if (rpcUrl) {
    for (const part of urlParts(rpcUrl)) {
      const mark = part === rpcUrl ? URL_MARK : PART_MARK;
      literals.push([part, mark, 'caseless'], [encodeURIComponent(part), mark, 'caseless']);
    }
  }
  literals.sort((a, b) => b[0].length - a[0].length);

  return (input) => {
    let text = typeof input === 'string' ? input : String(input);
    // Whole number tokens first, so a 0x prefix or padding goes with the key it belongs to.
    if (keyNumbers.size > 0) {
      text = text.replace(NUMBER_RE, (token) => (keyNumbers.has(parseBig(token)) ? KEY_MARK : token));
    }
    for (const [needle, mark, kind] of literals) {
      if (!needle) continue;
      text = kind === 'exact' ? replaceAll(text, needle, mark) : replaceCaseless(text, needle, mark, kind === 'key');
    }
    return text.replace(URL_RE, URL_MARK);
  };
}

function replaceCaseless(text, needle, mark, numeric) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // A key embedded in a longer token takes its 0x prefix and leading zeros with it.
  return text.replace(new RegExp(numeric ? `(0x)?0*${escaped}` : escaped, 'gi'), mark);
}

/**
 * The printable message of an error and of its causes, without stacks, sanitised.
 * @param {unknown} error
 * @param {(text: unknown) => string} sanitize
 */
export function formatError(error, sanitize) {
  const messages = [];
  let current = error;
  for (let depth = 0; current !== undefined && current !== null && depth < 6; depth += 1) {
    if (current instanceof Error) {
      messages.push(current.message || current.name);
      current = current.cause;
    } else {
      messages.push(typeof current === 'object' ? safeJson(current) : String(current));
      current = undefined;
    }
  }
  return sanitize(messages.filter(Boolean).join(': ') || 'unknown error');
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
