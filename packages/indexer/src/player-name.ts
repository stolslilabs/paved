// A player's name as `Avatar` takes it (PLAYER-RENAME, `contracts/src/avatar/name.cairo`): UTF-8 text of 3 to 15 characters, the
// letters and digits of any script with single spaces and hyphens between them, no invisible character and no mix of the scripts
// whose letters look alike. `nameKey` is the contract's `name_key`, code point for code point (as `@paved/chain`'s, which the
// indexer does not import): the folded text two names share when they are one. A copy kept on the same vectors by the tests.

export const NAME_MIN = 3;
export const NAME_MAX = 15;

const SPACE = 0x20;
const HYPHEN = 0x2d;
/** The scripts whose letters look alike, one bit each: a name holds letters of one of them at most. */
const LATIN = 1;
const GREEK = 2;
const CYRILLIC = 4;

/** Whether a character other than the space and the hyphen may be in a name, as the contract's `allowed`. */
export function allowedCode(code: number): boolean {
  if (code < 0x80) return (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
  return !(
    code <= 0xbf ||
    code === 0xd7 ||
    code === 0xf7 ||
    (code >= 0x300 && code <= 0x36f) ||
    code === 0x61c ||
    code === 0x115f ||
    code === 0x1160 ||
    code === 0x17b4 ||
    code === 0x17b5 ||
    (code >= 0x180b && code <= 0x180f) ||
    code === 0x3164 ||
    code === 0xffa0 ||
    (code >= 0x2000 && code <= 0x2bff) ||
    (code >= 0x2e00 && code <= 0x2e7f) ||
    (code >= 0x3000 && code <= 0x3004) ||
    (code >= 0x3008 && code <= 0x303f) ||
    // Lone surrogates (a JavaScript string may hold one; UTF-8 cannot) and private use
    (code >= 0xd800 && code <= 0xf8ff) ||
    (code >= 0xfe00 && code <= 0xfe6f) ||
    (code >= 0xfeff && code <= 0xff65) ||
    (code >= 0xffe0 && code <= 0xffff) ||
    (code >= 0x1f000 && code <= 0x1fbff) ||
    code >= 0xe0000
  );
}

/** The script of a letter among Latin (1), Greek (2) and Cyrillic (4); 0 for another, or not a letter. As the contract's `script_of`. */
export function scriptOf(code: number): number {
  if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a) || (code >= 0xc0 && code <= 0x24f) || (code >= 0x1e00 && code <= 0x1eff)) return LATIN;
  if ((code >= 0x370 && code <= 0x3ff) || (code >= 0x1f00 && code <= 0x1fff)) return GREEK;
  if (code >= 0x400 && code <= 0x52f) return CYRILLIC;
  return 0;
}

/** A character's case folded for the key, as the contract's `fold`: ASCII, Latin-1, Latin Extended-A, Greek and Cyrillic capitals. */
export function foldCode(code: number): number {
  if (code >= 0x41 && code <= 0x5a) return code + 0x20;
  if (code >= 0xc0 && code <= 0xde && code !== 0xd7) return code + 0x20;
  if (code >= 0x100 && code <= 0x17f) {
    if (code === 0x178) return 0xff;
    const even = code % 2 === 0;
    if (code <= 0x137 || (code >= 0x14a && code <= 0x177)) return even ? code + 1 : code;
    if ((code >= 0x139 && code <= 0x148) || (code >= 0x179 && code <= 0x17e)) return even ? code : code + 1;
    return code;
  }
  if (code >= 0x391 && code <= 0x3a9 && code !== 0x3a2) return code + 0x20;
  if (code >= 0x410 && code <= 0x42f) return code + 0x20;
  if (code >= 0x400 && code <= 0x40f) return code + 0x50;
  return code;
}

/**
 * The key of a name the contract takes (`name_key`), as text: its characters, their case folded; null for any other text (fewer
 * than 3 or more than 15 characters, a sign, a separator first, last or doubled, an invisible character, mixed lookalike scripts).
 * Two names of one key are the same name.
 */
export function nameKey(name: string): string | null {
  const codes = Array.from(name, (c) => c.codePointAt(0)!);
  if (codes.length < NAME_MIN || codes.length > NAME_MAX) return null;
  let afterSeparator = true;
  let scripts = 0;
  for (const code of codes) {
    if (code === SPACE || code === HYPHEN) {
      if (afterSeparator) return null;
      afterSeparator = true;
    } else {
      if (!allowedCode(code)) return null;
      afterSeparator = false;
      scripts |= scriptOf(code);
    }
  }
  if (afterSeparator) return null;
  if (scripts !== 0 && scripts !== LATIN && scripts !== GREEK && scripts !== CYRILLIC) return null;
  return String.fromCodePoint(...codes.map(foldCode));
}

