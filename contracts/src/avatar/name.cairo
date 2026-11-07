//! A player's name on chain (PLAYER-RENAME): UTF-8 text (a `ByteArray`) of 3 to 15 characters,
//! the owner's asks of 2026-11-07: the letters and digits of any script (Latin with its accents,
//! Chinese, Cyrillic, Arabic, ...), and single spaces and hyphens between them. Within the name
//! plate's 15 characters. Pure: no storage, no system.
//!
//! What the chain refuses, so that no name hides another: invalid UTF-8; an ASCII sign other than
//! the space and the hyphen; a space or a hyphen first, last or beside another; the characters
//! that show nothing or look like a sign (controls, the other spaces, zero-width and direction
//! marks, fillers, punctuation, symbols, emoji, private use); the combining accents of the Latin,
//! Greek and Cyrillic letters (the client sends composed text: "é" is one character); fullwidth
//! ASCII; and Latin, Greek and Cyrillic letters mixed in one name (their lookalikes). Which
//! characters are letters is the client's to check (Unicode's letter, mark and number classes).
//!
//! Its key folds the case of the Latin (accented too), Greek and Cyrillic letters: `Avatar` holds
//! one player per key, so "Élodie" and "ÉLODIE" are one name.

use core::poseidon::poseidon_hash_span;

/// The fewest and the most characters (code points) of a name.
pub const NAME_MIN: u32 = 3;
pub const NAME_MAX: u32 = 15;
/// The most bytes: 15 characters of 4 bytes.
pub const NAME_MAX_BYTES: u32 = 60;

const SPACE: u32 = 0x20;
const HYPHEN: u32 = 0x2d;

/// The scripts whose letters look alike, one bit each; a name holds letters of one of them at most.
const LATIN: u8 = 1;
const GREEK: u8 = 2;
const CYRILLIC: u8 = 4;

/// The key of a valid name: the poseidon hash of its characters, their case folded (`fold`).
/// `None` for anything else.
pub fn name_key(name: @ByteArray) -> Option<felt252> {
    let len = name.len();
    if len < NAME_MIN || len > NAME_MAX_BYTES {
        return None;
    }
    let mut folded: Array<felt252> = array![];
    let mut at: u32 = 0;
    let mut count: u32 = 0;
    let mut scripts: u8 = 0;
    // A separator may not come first: as if one came before
    let mut after_separator = true;
    let mut valid = true;
    while at < len {
        let (code, size) = match decode(name, at) {
            Some(read) => read,
            None => {
                valid = false;
                break;
            },
        };
        at += size;
        count += 1;
        if count > NAME_MAX {
            valid = false;
            break;
        }
        if code == SPACE || code == HYPHEN {
            // One separator between two characters
            if after_separator {
                valid = false;
                break;
            }
            after_separator = true;
        } else {
            if !allowed(code) {
                valid = false;
                break;
            }
            after_separator = false;
            scripts = scripts | script_of(code);
        }
        folded.append(fold(code).into());
    }
    // Not last either, and 3 characters at least
    if !valid || after_separator || count < NAME_MIN {
        return None;
    }
    if scripts != 0 && scripts != LATIN && scripts != GREEK && scripts != CYRILLIC {
        return None;
    }
    Some(poseidon_hash_span(folded.span()))
}

/// The character at byte `at` and its length in bytes, from well-formed UTF-8 only (no overlong
/// form, no surrogate, nothing past U+10FFFF); `None` otherwise.
pub fn decode(text: @ByteArray, at: u32) -> Option<(u32, u32)> {
    let first: u32 = text.at(at)?.into();
    if first < 0x80 {
        return Some((first, 1));
    }
    // The length, the bounds of the second byte and the bits of the first
    let (size, low, high, bits) = if first >= 0xc2 && first <= 0xdf {
        (2, 0x80, 0xbf, first & 0x1f)
    } else if first >= 0xe0 && first <= 0xef {
        (
            3,
            if first == 0xe0 {
                0xa0
            } else {
                0x80
            },
            if first == 0xed {
                0x9f
            } else {
                0xbf
            },
            first & 0x0f,
        )
    } else if first >= 0xf0 && first <= 0xf4 {
        (
            4,
            if first == 0xf0 {
                0x90
            } else {
                0x80
            },
            if first == 0xf4 {
                0x8f
            } else {
                0xbf
            },
            first & 0x07,
        )
    } else {
        return None;
    };
    let mut code: u32 = bits;
    let mut k: u32 = 1;
    let mut valid = true;
    while k < size {
        let byte: u32 = match text.at(at + k) {
            Some(byte) => byte.into(),
            None => {
                valid = false;
                break;
            },
        };
        let (min, max) = if k == 1 {
            (low, high)
        } else {
            (0x80, 0xbf)
        };
        if byte < min || byte > max {
            valid = false;
            break;
        }
        code = code * 64 + (byte & 0x3f);
        k += 1;
    }
    if valid {
        Some((code, size))
    } else {
        None
    }
}

/// Whether a character other than the space and the hyphen may be in a name: an ASCII letter or
/// digit, or a character beyond ASCII that shows something and is not a sign (see the module).
pub fn allowed(code: u32) -> bool {
    if code < 0x80 {
        return (code >= 0x30 && code <= 0x39)
            || (code >= 0x41 && code <= 0x5a)
            || (code >= 0x61 && code <= 0x7a);
    }
    !( // C1 controls, the no-break space, Latin-1's signs, the soft hyphen
    code <= 0xbf
        || code == 0xd7
        || code == 0xf7
        // The combining accents of Latin, Greek and Cyrillic (composed text only)
        || (code >= 0x300 && code <= 0x36f)
        // Invisible marks and fillers: Arabic letter mark, Hangul fillers, Khmer, Mongolian
        || code == 0x61c
        || code == 0x115f
        || code == 0x1160
        || code == 0x17b4
        || code == 0x17b5
        || (code >= 0x180b && code <= 0x180f)
        || code == 0x3164
        || code == 0xffa0
        // Spaces, zero-width and direction marks, punctuation, symbols, arrows, shapes, braille
        || (code >= 0x2000 && code <= 0x2bff)
        || (code >= 0x2e00 && code <= 0x2e7f)
        // CJK punctuation and the ideographic space (not the marks 々, 〆, 〇 of names)
        || (code >= 0x3000 && code <= 0x3004)
        || (code >= 0x3008 && code <= 0x303f)
        // Private use
        || (code >= 0xe000 && code <= 0xf8ff)
        // Variation selectors, vertical and small forms
        || (code >= 0xfe00 && code <= 0xfe6f)
        // The byte-order mark, fullwidth ASCII and punctuation, fullwidth signs, specials
        || (code >= 0xfeff && code <= 0xff65)
        || (code >= 0xffe0 && code <= 0xffff)
        // Emoji and symbols
        || (code >= 0x1f000 && code <= 0x1fbff)
        // Tags, variation selectors, private use
        || code >= 0xe0000)
}

/// The script of a letter among the three whose letters look alike (0: another, or not a letter).
pub fn script_of(code: u32) -> u8 {
    if (code >= 0x41 && code <= 0x5a)
        || (code >= 0x61 && code <= 0x7a)
        || (code >= 0xc0 && code <= 0x24f)
        || (code >= 0x1e00 && code <= 0x1eff) {
        LATIN
    } else if (code >= 0x370 && code <= 0x3ff) || (code >= 0x1f00 && code <= 0x1fff) {
        GREEK
    } else if code >= 0x400 && code <= 0x52f {
        CYRILLIC
    } else {
        0
    }
}

/// A character's case folded for the key: the capitals of ASCII, Latin-1 and Latin Extended-A,
/// Greek and Cyrillic to their small letters; any other unchanged.
pub fn fold(code: u32) -> u32 {
    if code >= 0x41 && code <= 0x5a {
        return code + 0x20;
    }
    if code >= 0xc0 && code <= 0xde && code != 0xd7 {
        return code + 0x20;
    }
    if code >= 0x100 && code <= 0x17f {
        if code == 0x178 {
            return 0xff;
        }
        let even = code % 2 == 0;
        if code <= 0x137 || (code >= 0x14a && code <= 0x177) {
            return if even {
                code + 1
            } else {
                code
            };
        }
        if (code >= 0x139 && code <= 0x148) || (code >= 0x179 && code <= 0x17e) {
            return if even {
                code
            } else {
                code + 1
            };
        }
        return code;
    }
    if code >= 0x391 && code <= 0x3a9 && code != 0x3a2 {
        return code + 0x20;
    }
    if code >= 0x410 && code <= 0x42f {
        return code + 0x20;
    }
    if code >= 0x400 && code <= 0x40f {
        return code + 0x50;
    }
    code
}
