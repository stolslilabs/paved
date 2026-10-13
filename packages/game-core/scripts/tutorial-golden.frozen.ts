// The Tutorial's golden game, frozen (D-21: the tutorial left the contracts, and the off-chain one on the engine is the only
// tutorial). Transcribed once by `transcribe-goldens.ts` at commit 38f1c95, the last one holding its two Cairo sources:
// `contracts/src/tests/golden/tutorial.cairo` (`test_golden_tutorial_full_sequence`: the moves, the scores and the
// outcome) and `contracts/src/elements/decks/tutorial.cairo` (`parameters`: the scripted placements). CORE's step D
// deleted both, so this entry is no longer read from Cairo; `engine-parity.test.ts` still replays it on the engine, and
// the off-chain `/tutorial` page must end on its score (2794). Never edit it by hand.

import type { ParityGame } from "./transcribe-goldens";

export const FROZEN_TUTORIAL_GAME: ParityGame = {
  "name": "tutorial_full",
  "source": "frozen at 38f1c95 from contracts/src/tests/golden/tutorial.cairo:17 (test_golden_tutorial_full_sequence); placements from contracts/src/elements/decks/tutorial.cairo (parameters)",
  "deck": "tutorial",
  "seed": "0x0",
  "seedSource": "contracts/src/types/mode.cairo, Mode::seed: 0 for the Tutorial",
  "tileLimit": null,
  "moves": [
    {
      "drawn": "SFRFRFCFR",
      "plan": "SFRFRFCFR",
      "action": "build",
      "score": 0,
      "orientation": "North",
      "x": -1,
      "y": 0
    },
    {
      "drawn": "CFFFCFFFC",
      "plan": "CFFFCFFFC",
      "action": "build",
      "score": 0,
      "orientation": "East",
      "x": -1,
      "y": -1
    },
    {
      "drawn": "FFCFFFFFC",
      "plan": "FFCFFFFFC",
      "action": "build",
      "score": 643,
      "orientation": "East",
      "x": -1,
      "y": -2
    },
    {
      "drawn": "WFFFFFFFR",
      "plan": "WFFFFFFFR",
      "action": "build",
      "score": 643,
      "orientation": "West",
      "x": 0,
      "y": -1
    },
    {
      "drawn": "RFRFFFCFR",
      "plan": "RFRFFFCFR",
      "action": "build",
      "score": 1062,
      "orientation": "East",
      "x": 0,
      "y": -2
    },
    {
      "drawn": "RFRFFFFFR",
      "plan": "RFRFFFFFR",
      "action": "build",
      "score": 1062,
      "orientation": "North",
      "x": 1,
      "y": -2
    },
    {
      "drawn": "RFFFRFFFR",
      "plan": "RFFFRFFFR",
      "action": "build",
      "score": 1062,
      "orientation": "East",
      "x": 1,
      "y": -1
    },
    {
      "drawn": "CCCCCCCCC",
      "plan": "CCCCCCCCC",
      "action": "discard",
      "score": 1012
    },
    {
      "drawn": "SFRFRFFFR",
      "plan": "SFRFRFFFR",
      "action": "build",
      "score": 2794,
      "orientation": "West",
      "x": 1,
      "y": 0
    }
  ],
  "outcome": {
    "score": 2794,
    "built": 8,
    "discarded": 1,
    "tileCount": 10,
    "over": true
  }
};
