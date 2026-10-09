#!/usr/bin/env python3
"""The expected table of `Economy`'s end-to-end fixture (P8 E2, `test_fixture_matches_sim` in
contracts/src/tests/economy/economy.cairo), from sim.py's formulas.

    python3 -I -B scripts/montecarlo/fixture.py [--sim-pool]

It imports sim.py's `payout_factor` and `Ema` and runs the purchase and day lines of `simulate` on
the fixture's inputs: the launch pool (800,000 PAVED and 10,000 USDC) and the initial supply, the
decided configuration, the initial mean 3,353, nine games over two days, the first day settled
before the second day's purchases, and players who keep their rewards (sell = 0). It adds what
sim.py does not model and Economy does: the price guard, from the post-fee launch rate (76 PAVED per
USDC), with its EMA and its clamp.

The pool keeps its fee in its reserves, as MockRouter does (sim.py keeps it out: `--sim-pool` runs
sim.py's pool instead, to measure that gap). It prints the day means and the rows of `expected()` in
the test: (PAVED bought, R, payout), in base units.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sim  # noqa: E402

SIM_POOL = "--sim-pool" in sys.argv[1:]

MEAN0 = 3353.0
SIGMA, SLOPE, CAP = 0.0, 1.813, 5
TARGET = 1_000_000.0
# The guard: the launch rate after the pool's fee, its EMA step and its bound (Economy, curve.cairo)
RATE0 = sim.POOL_PAVED / sim.POOL_USDC * (1 - sim.POOL_FEE)
RATE_STEP = 32
GUARD = 1.1
# (game id, day, stake, referred, score), as `games()` in the test
GAMES = [
    (1, 0, 1, False, 5000),
    (2, 0, 3, True, 2000),
    (3, 0, 10, False, 15000),
    (4, 0, 5, True, 50),
    (5, 0, 2, False, 4300),
    (6, 1, 4, False, 6000),
    (7, 1, 7, True, 9000),
    (8, 1, 1, False, 4300),
    (9, 1, 6, False, 800),
]


def main():
    ema = sim.Ema(MEAN0, 100, 1000, 100)
    supply = sim.INITIAL_SUPPLY
    pool_usdc, pool_paved = sim.POOL_USDC, sim.POOL_PAVED
    rate = RATE0
    rows = {}
    for d in (0, 1):
        pending = []
        for game_id, day, stake, referred, score in GAMES:
            if day != d:
                continue
            # The purchase, as sim.py's `simulate` (the referral leaves the burn unchanged)
            price = stake * sim.BASE_PRICE
            quote = price * sim.BURN
            fee = quote * sim.POOL_FEE
            out = pool_paved * (quote - fee) / (pool_usdc + quote - fee)
            pool_usdc += quote - fee if SIM_POOL else quote
            pool_paved -= out
            supply -= out
            factor = min(max((2 * TARGET - supply) / TARGET, 0.0), 2.0)
            # The guard, then sim.py's R
            counted = min(out, quote * rate * GUARD)
            rate = (rate * (RATE_STEP - 1) + min(max(out / quote, rate / GUARD), rate * GUARD)) / RATE_STEP
            reference = counted * (1 + stake / 100) * factor
            pending.append((game_id, stake, reference, score, out))
        # The day's mean and the settlement, as sim.py's option B
        prior = ema.mean()
        day_total = 0.0
        day_weight = 0
        for _, stake, _, score, _ in pending:
            if score >= 100:
                day_total += stake * min(score, 4 * prior)
                day_weight += stake
        mean = (prior * 100 + day_total) / (100 + day_weight)
        for game_id, stake, reference, score, out in pending:
            reward = reference * sim.payout_factor(score / mean, SIGMA, SLOPE, CAP)
            supply += reward
            rows[game_id] = (out, reference, reward)
        if day_weight:
            ema.push(day_total / day_weight, day_weight, 0)
        print(f"// day {d}: prior {prior:.6f}, mean {mean:.6f}, EMA after {ema.mean():.6f}")
    e18 = 10**18
    for game_id in sorted(rows):
        out, reference, reward = rows[game_id]
        print(f"({round(out * e18)}, {round(reference * e18)}, {round(reward * e18)}),")


if __name__ == "__main__":
    main()
