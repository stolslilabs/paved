#!/usr/bin/env python3
"""The selective buyer's edge under a per-token seed (D-23s, docs/measures/selective-buyer.md).

    python3 -I -B scripts/montecarlo/selective.py [scores.csv] [decks.csv]

Under D-23 a game's seed is Poseidon(salt, token id), and the next token id is known before the purchase. A buyer
can play the next deck with a bot first, and buy only when the bot's score is at or above a threshold `t`. This
script measures what such a buyer gets, `E[h | bought]`, against the `E[h] = 0.9` the slope is calibrated for.

The bot is the sampler's greedy strategy (0): one deterministic score per deck. Its decks are the greedy games of
`scores.csv` (days 11 to 60) and of `decks.csv` (days 61 on, the same sampler, strategy and seed). A day's seed is
Poseidon(0, 1000 + day), so each day is a distinct deck, as each token id is under D-23.

The economy math is sim.py's (imported, not copied): the population sample, the mean as the contract tracks it,
the calibrated slope, the curve `h`. Deterministic: the standard library only, a fixed bootstrap seed.
"""

import csv
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sim  # noqa: E402

SIGMA, RHO, CAP, MIN_SCORE = 0.0, 0.9, 5, 100
GREEDY = "0"
PERCENTILES = (0.0, 0.50, 0.75, 0.90, 0.95, 0.99)  # 0: every id, the bot without selection
SHARES = (0.1, 0.5, 1.0)  # the selective buyer's share of the purchases, when its scores feed the mean
BOOTSTRAP = 2000
STAKE = 10  # the selective buyer stakes the most on the decks it buys
# The other buyers' mean stake, under sim.py's base stake mix ("inverse"): the chain mean weights a score by its stake
POP_STAKE = sum(k * w for k, w in zip(sim.STAKES, sim.stake_weights("inverse")))


def value_per_price(stake):
    """USDC back per USDC paid, per unit of h: the burn share bought through the pool fee, the stake boost, the
    reward sold back through the fee. Supply factor 1, no slippage (a deep pool)."""
    return sim.BURN * (1 - sim.POOL_FEE) * (1 + stake / 100) * (1 - sim.POOL_FEE)


def bot_decks(paths):
    """day -> the greedy bot's score on that day's deck; a day seen twice must give the same score."""
    decks = {}
    for path in paths:
        with open(path, newline="") as handle:
            for row in csv.DictReader(handle):
                if row["strategy"] != GREEDY:
                    continue
                day, score = int(row["day"]), int(row["score"])
                if decks.setdefault(day, score) != score:
                    raise SystemExit(f"day {day} gives two greedy scores")
    return decks


def threshold(sorted_scores, q):
    """The nearest-rank percentile: the smallest score with at least a share q of the scores at or below it."""
    return sorted_scores[max(math.ceil(q * len(sorted_scores)) - 1, 0)]


def fed_mean(population, buyer, share):
    """The chain mean when a share of the purchases are the buyer's. `buyer` holds its (score, stake) purchases.
    Each score weighs its stake, as on chain: the others' purchases weigh POP_STAKE each on average."""
    total = sum(w for _, w in population)
    sample = [(s, w / total * (1 - share) * POP_STAKE) for s, w in population]
    sample += [(s, share * k / len(buyer)) for s, k in buyer]
    return sim.chain_mean(sample, MIN_SCORE)


def stats(scores, q, population, mean0, slope):
    """Per mean case: share taken, E[h | bought], share at the cap."""
    ordered = sorted(scores)
    t = threshold(ordered, q)
    bought = [s for s in ordered if s >= t]
    taken = len(bought) / len(ordered)
    out = {"t": t, "taken": taken}
    for case, share in [("held", 0.0)] + [(f"fed {s:g}", s) for s in SHARES]:
        mean = mean0 if share == 0 else fed_mean(population, [(s, STAKE) for s in bought], share)
        hs = [sim.payout_factor(s / mean, SIGMA, slope, CAP) for s in bought]
        out[case] = (sum(hs) / len(hs), sum(1 for h in hs if h >= CAP) / len(hs), mean)
    return out


def label(q):
    return "all ids" if q == 0 else f"p{round(q * 100)}"


def sized(scores, t, share, population, mean0, slope):
    """USDC back per USDC paid by a buyer who takes every id, at stake 10 when the bot's score is at or above t
    and at stake 1 otherwise, holding `share` of the purchases (0: the mean held at mean0; 1: the buyer alone)."""
    stakes = [STAKE if s >= t else 1 for s in scores]
    mean = mean0 if share == 0 else fed_mean(population, list(zip(scores, stakes)), share)
    paid = sum(sim.BASE_PRICE * k for k in stakes)
    back = sum(sim.BASE_PRICE * k * value_per_price(k) * sim.payout_factor(s / mean, SIGMA, slope, CAP)
               for s, k in zip(scores, stakes))
    return back / paid, mean


def interval(values):
    values = sorted(values)
    return values[int(0.025 * len(values))], values[min(int(0.975 * len(values)), len(values) - 1)]


def main():
    here = Path(__file__).resolve().parent
    scores_path = Path(sys.argv[1]) if len(sys.argv) > 1 else here / "scores.csv"
    decks_path = Path(sys.argv[2]) if len(sys.argv) > 2 else here / "decks.csv"

    # The economy as sim.py calibrates it
    days = {d: v for d, v in sim.load(scores_path).items() if all(k in v for k in ("greedy", "noisy", "novice"))}
    population = sim.mixture(days, {"greedy": 0.25, "noisy": 0.5, "novice": 0.25, "replayer": 0.0})
    mean0 = sim.chain_mean(population, MIN_SCORE)
    slope = sim.calibrate(population, SIGMA, RHO, CAP, MIN_SCORE)
    e_h, _ = sim.expected_factor(population, SIGMA, slope, CAP, MIN_SCORE)

    decks = bot_decks([scores_path, decks_path])
    scores = [decks[d] for d in sorted(decks)]
    ordered = sorted(scores)
    n = len(scores)
    cases = ["held"] + [f"fed {s:g}" for s in SHARES]

    print("## The economy (sim.py)")
    print()
    print(f"Population 25 % greedy, 50 % noisy, 25 % novice: chain mean {mean0:,.0f}, slope c {slope:.3f}, "
          f"E[h] {e_h:.3f}, cap {CAP}; h reaches the cap at a score of {CAP / slope * mean0:,.0f}.")
    print()
    print(f"The other buyers' mean stake (sim.py's stake mix): {POP_STAKE:.2f}; the selective buyer stakes {STAKE}. "
          f"A share of the purchases is a share of their count; in the mean each weighs its stake.")
    print()
    print("## The bot's decks")
    print()
    print(f"{n} distinct decks (days {min(decks)} to {max(decks)}, seed Poseidon(0, 1000 + day)), greedy bot. "
          f"Scores: mean {sum(scores) / n:,.0f}, min {ordered[0]:,}, max {ordered[-1]:,}; "
          + ", ".join(f"{label(q)} {threshold(ordered, q):,}" for q in PERCENTILES[1:]) + ".")
    base = [sim.payout_factor(s / mean0, SIGMA, slope, CAP) for s in scores]
    calib = [decks[d] for d in sorted(days) if d in decks]
    calib_h = [sim.payout_factor(s / mean0, SIGMA, slope, CAP) for s in calib]
    print(f"\nThe bot buying blind, mean held: E[h] {sum(base) / n:.3f} on the {n} decks (mean score {sum(scores) / n:,.0f}), "
          f"{sum(calib_h) / len(calib):.3f} on the {len(calib)} calibration decks of scores.csv "
          f"(mean score {sum(calib) / len(calib):,.0f}).")
    print()

    # The point estimates and their bootstrap: decks resampled with replacement, thresholds recomputed
    rng = random.Random(23)
    point = {q: stats(scores, q, population, mean0, slope) for q in PERCENTILES}
    boots = {q: [] for q in PERCENTILES}
    for _ in range(BOOTSTRAP):
        resample = [scores[rng.randrange(n)] for _ in range(n)]
        for q in PERCENTILES:
            boots[q].append(stats(resample, q, population, mean0, slope))

    for case in cases:
        if case == "held":
            title = f"Mean held by the other buyers ({mean0:,.0f})"
        else:
            share = float(case.split()[1])
            title = (f"Mean fed by the buyer's purchases, at {share:.0%} of the traffic"
                     + (" (zero traffic: the buyer alone)" if share == 1 else ""))
        print(f"## {title}")
        print()
        print("| Threshold | Score t | Ids taken | Mean | E[h \\| bought] | Edge vs 0.9 | Ratio | Selection | At the cap |")
        print("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
        for q in PERCENTILES:
            p = point[q]
            eh, capped, mean = p[case]
            b = boots[q]
            taken_lo, taken_hi = interval([x["taken"] for x in b])
            eh_lo, eh_hi = interval([x[case][0] for x in b])
            cap_lo, cap_hi = interval([x[case][1] for x in b])
            # Selection: E[h | bought] less the same bot's E[h] on every id, paired within each resample
            sel = eh - point[0.0][case][0]
            sel_lo, sel_hi = interval([x[case][0] - y[case][0] for x, y in zip(b, boots[0.0])])
            print(f"| {label(q)} | {p['t']:,} | {p['taken']:.1%} [{taken_lo:.1%}, {taken_hi:.1%}] | "
                  f"{mean:,.0f} | {eh:.3f} [{eh_lo:.3f}, {eh_hi:.3f}] | "
                  f"{eh - RHO:+.3f} [{eh_lo - RHO:+.3f}, {eh_hi - RHO:+.3f}] | "
                  f"{eh / RHO:.2f} [{eh_lo / RHO:.2f}, {eh_hi / RHO:.2f}] | "
                  f"{sel:+.3f} [{sel_lo:+.3f}, {sel_hi:+.3f}] | "
                  f"{capped:.1%} [{cap_lo:.1%}, {cap_hi:.1%}] |")
        print()

    # The threshold that maximises the profit, over every score of the sample, mean held
    k = value_per_price(STAKE)
    best_purchase = best_id = None
    for t in sorted(set(scores)):
        bought = [s for s in scores if s >= t]
        eh = sum(sim.payout_factor(s / mean0, SIGMA, slope, CAP) for s in bought) / len(bought)
        per_purchase = k * eh - 1
        per_id = len(bought) / n * per_purchase
        if best_purchase is None or per_purchase > best_purchase[1]:
            best_purchase = (t, per_purchase, len(bought))
        if best_id is None or per_id > best_id[1]:
            best_id = (t, per_id, len(bought))
    print("## The profit-maximising threshold (mean held)")
    print()
    print(f"Profit in USDC per USDC paid, at stake {STAKE}: {k:.3f} x h - 1 (break-even at h {1 / k:.2f}, "
          f"a score of {mean0 / slope / k:,.0f}).")
    print(f"\nPer purchase: t = {best_purchase[0]:,} ({best_purchase[2]} of {n} decks), "
          f"{best_purchase[1]:+.3f} per USDC; it rises with t up to the best deck of the sample.")
    print(f"\nPer id observed: t = {best_id[0]:,} ({best_id[2]} of {n} decks, {best_id[2] / n:.1%} of the ids), "
          f"{best_id[1]:+.4f} per USDC of a purchase per id observed, "
          f"{best_id[1] * n / best_id[2]:+.3f} per USDC paid.")
    print(f"\nThe same bot buying every id at stake {STAKE}: {k * sum(base) / n - 1:+.3f} per USDC paid.")


    # Zero traffic: no one else takes an id, so a bad one is skipped only by buying it, at the lowest stake
    print()
    print(f"## Skipping by buying at stake 1 (every id taken: stake {STAKE} at or above t, stake 1 below)")
    print()
    print("USDC back per USDC paid (the mean in brackets), at each share of the purchases held by the buyer.")
    print()
    print("| Threshold | Score t | Mean held | " + " | ".join(
        "Buyer alone" if s == 1 else f"Fed {s:.0%}" for s in SHARES) + " |")
    print("|---|---:|---:|" + "---:|" * len(SHARES))
    for q in PERCENTILES:
        t = threshold(ordered, q)
        cells = []
        for share in (0.0,) + SHARES:
            ret, mean = sized(scores, t, share, population, mean0, slope)
            cells.append(f"{ret:.3f} ({mean:,.0f})")
        print(f"| {label(q)} | {t:,} | " + " | ".join(cells) + " |")


if __name__ == "__main__":
    main()
