// Redacts the secrets of the signer from any text before it is printed: the private key (in any
// hex or decimal spelling) and the RPC URL (whole, and its parts that may carry a provider API key).
// Every URL is redacted too, whatever its host, so a URL a library builds from the RPC URL never
// reaches a terminal or a log.

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

/**
 * Builds a sanitiser for the given secrets. Either may be undefined (not read yet).
 * @param {{ privateKey?: string, rpcUrl?: string }} secrets
 * @returns {(text: unknown) => string}
 */
export function makeSanitizer({ privateKey, rpcUrl } = {}) {
  const keyValue = privateKey ? parseBig(privateKey.trim()) : undefined;
  const keyLiterals = privateKey ? [privateKey, privateKey.trim()] : [];
  if (keyValue !== undefined) {
    const hex = keyValue.toString(16);
    keyLiterals.push(hex, hex.padStart(64, '0'), keyValue.toString(10));
  }
  const literals = [
    ...keyLiterals.filter((s) => s.length >= 1).map((s) => [s, KEY_MARK]),
    ...(rpcUrl ? urlParts(rpcUrl).map((s) => [s, s === rpcUrl ? URL_MARK : PART_MARK]) : []),
  ].sort((a, b) => b[0].length - a[0].length);

  return (input) => {
    let text = typeof input === 'string' ? input : String(input);
    for (const [needle, mark] of literals) {
      // Case-insensitive for hex spellings of the key; the URL parts are matched as given.
      text = mark === KEY_MARK ? replaceCaseless(text, needle, mark) : replaceAll(text, needle, mark);
    }
    text = text.replace(URL_RE, URL_MARK);
    if (keyValue !== undefined && keyValue !== 0n) {
      text = text.replace(NUMBER_RE, (token) => (parseBig(token) === keyValue ? KEY_MARK : token));
    }
    return text;
  };
}

function replaceCaseless(text, needle, mark) {
  if (!needle) return text;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, 'gi'), mark);
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
