#!/usr/bin/env python3
"""Monte-Carlo of the P8 economy (docs/architecture/economy.md, section 3).

Deterministic: fixed seeds, the standard library only, no input but the score sample.

    python3 -I scripts/montecarlo/sim.py [scripts/montecarlo/scores.csv]

The score sample (`scores.csv`: day, strategy, seed, score) holds whole Daily games played by bots on
the contracts (`sampler.cairo`, run one game per snforge run). Strategies: 0 greedy (the bot of the
full-deck golden), 4 greedy with random ties, 1 random legal placement with characters on half the
moves, 2 greedy without characters.

Units: USDC in whole USDC (the contracts use 6 decimals), PAVED in whole tokens (18 decimals),
scores in points. Every printed figure comes from this script; nothing is measured on chain.
"""

import csv
import math
import random
import sys
from pathlib import Path

# Fixed by the owner (D-10)
BASE_PRICE = 2.0  # USDC per stake unit
BURN = 0.70  # share of the price swapped to PAVED and burned
REFERRAL = 0.05  # share of the price paid to a referrer, out of the margin (recommended)
POOL_FEE = 0.05  # Ekubo pool fee, on the input of every swap
INITIAL_SUPPLY = 1_000_000.0
STAKES = range(1, 11)

# Assumptions of the model (economy.md says which are the owner's acts)
POOL_PAVED = 800_000.0  # the LP at launch, as Nums: 800k tokens and 10k USDC
POOL_USDC = 10_000.0

TYPES = {"greedy": "0", "noisy": "4", "novice": "1", "bare": "2"}


def load(path):
    """day -> type -> list of scores."""
    days = {}
    with open(path, newline="") as handle:
        for row in csv.DictReader(handle):
            for name, code in TYPES.items():
                if row["strategy"] == code:
                    days.setdefault(int(row["day"]), {}).setdefault(name, []).append(
                        int(row["score"])
                    )
    return days


def draw_score(rng, day, kind):
    if kind == "replayer":
        # The best line known for the day (D-3: the seed of the day is public)
        return max(max(scores) for scores in day.values())
    return rng.choice(day[kind])


def stake_weights(profile):
    if profile == "inverse":  # more small stakes than large ones
        weights = [1.0 / k for k in STAKES]
    elif profile == "one":
        weights = [1.0 if k == 1 else 0.0 for k in STAKES]
    elif profile == "ten":
        weights = [1.0 if k == 10 else 0.0 for k in STAKES]
    else:
        weights = [1.0 for _ in STAKES]
    total = sum(weights)
    return [w / total for w in weights]


def payout_factor(x, sigma, slope, cap):
    """The curve h: the reward in units of the reference reward R, for x = score / mean."""
    tau = 1.0 + sigma
    if x < tau:
        return 0.0
    return min(slope * x / tau, cap)


def mixture(days, population):
    """The stationary score sample: every (score, weight) of the population over every day."""
    sample = []
    for day in days.values():
        for kind, share in population.items():
            if share == 0:
                continue
            if kind == "replayer":
                sample.append((max(max(s) for s in day.values()), share))
            else:
                scores = day[kind]
                for score in scores:
                    sample.append((score, share / len(scores)))
    return sample


def chain_mean(sample, min_score):
    """The mean the contract tracks: scores below `min_score` never enter it."""
    kept = [(s, w) for s, w in sample if s >= min_score]
    return sum(s * w for s, w in kept) / sum(w for _, w in kept)


def expected_factor(sample, sigma, slope, cap, min_score):
    total = sum(w for _, w in sample)
    mean = chain_mean(sample, min_score)
    return sum(payout_factor(s / mean, sigma, slope, cap) * w for s, w in sample) / total, mean


def calibrate(sample, sigma, rho, cap, min_score):
    """The slope for which E[h(X)] = rho, by bisection (h grows with the slope)."""
    low, high = 0.0, 100.0
    if expected_factor(sample, sigma, high, cap, min_score)[0] < rho:
        return math.inf
    for _ in range(100):
        mid = (low + high) / 2
        if expected_factor(sample, sigma, mid, cap, min_score)[0] < rho:
            low = mid
        else:
            high = mid
    return high


class Ema:
    """Nums' weighted mean: cumulative up to `max_weight`, then an EMA of step weight / max_weight."""

    def __init__(self, initial, initial_weight, max_weight, min_score):
        self.total = initial * initial_weight
        self.weight = initial_weight
        self.max_weight = max_weight
        self.min_score = min_score

    def mean(self):
        return self.total / self.weight

    def push(self, score, weight, clamp):
        if score < self.min_score:
            return
        # A step never weighs more than the whole mean (a day of option B may)
        weight = min(weight, self.max_weight)
        if clamp:
            score = min(score, clamp * self.mean())
        if self.weight < self.max_weight:
            step = min(weight, self.max_weight - self.weight)
            self.total += score * step
            self.weight += step
            weight -= step
        if weight > 0:
            self.total += weight * score - weight * self.total / self.weight


def simulate(days, params, seed):
    rng = random.Random(seed)
    day_ids = sorted(days)
    kinds = [k for k, v in params["population"].items() if v > 0]
    shares = [params["population"][k] for k in kinds]
    weights = stake_weights(params["stakes"])
    ema = Ema(params["mean0"], 100, params["max_weight"], params["min_score"])
    supply = INITIAL_SUPPLY
    target = params["target"]
    pool_usdc = POOL_USDC * params["depth"]
    pool_paved = POOL_PAVED * params["depth"]
    price0 = pool_usdc / pool_paved
    paid = received = burned = minted = vault = lp_usdc = lp_paved = referral = 0.0
    games = lost = 0
    by_kind = {k: [0.0, 0.0, 0] for k in kinds}
    multiples = []
    daily_lost = []
    lost_today = 0
    pending = []

    def settle(game, mean):
        nonlocal supply, minted, pool_paved, pool_usdc, lp_paved, received, lost_today, lost
        kind, stake, price, reference, score = game
        reward = reference * payout_factor(score / mean, params["sigma"], params["slope"], params["cap"])
        supply += reward
        minted += reward
        sold = reward * params["sell"]
        fee_p = sold * POOL_FEE
        usdc = pool_usdc * (sold - fee_p) / (pool_paved + sold - fee_p)
        pool_paved += sold - fee_p
        lp_paved += fee_p
        pool_usdc -= usdc
        # The rest of the reward is valued at the pool price
        value = usdc + (reward - sold) * pool_usdc / pool_paved
        received += value
        if reward == 0:
            lost += 1
            lost_today += 1
        by_kind[kind][1] += value
        multiples.append(value / price)

    for _ in range(params["days"]):
        day = days[rng.choice(day_ids)]
        lost_today = 0
        for _ in range(params["games"]):
            kind = rng.choices(kinds, shares)[0]
            stake = 10 if kind == "replayer" else rng.choices(list(STAKES), weights)[0]
            price = stake * BASE_PRICE
            # Purchase: referral and margin in USDC, the burn share swapped and burned
            ref = price * REFERRAL if rng.random() < params["referred"] else 0.0
            quote = price * BURN
            fee = quote * POOL_FEE
            out = pool_paved * (quote - fee) / (pool_usdc + quote - fee)
            pool_usdc += quote - fee
            lp_usdc += fee
            pool_paved -= out
            supply -= out
            burned += out
            vault += price - quote - ref
            referral += ref
            # The supply factor is read at spawn, after the burn
            factor = min(max((2 * target - supply) / target, 0.0), 2.0)
            reference = out * (1 + stake / 100) * factor
            score = draw_score(rng, day, kind)
            paid += price
            games += 1
            by_kind[kind][0] += price
            by_kind[kind][2] += 1
            game = (kind, stake, price, reference, score)
            if params["settle"] == "spawn":
                # Nums: the mean frozen at spawn, the reward minted at game over
                settle(game, ema.mean())
                ema.push(score, stake, params["clamp"])
            else:
                pending.append(game)
        if params["settle"] == "day":
            # After the day: the mean of the day's paid games, blended with the EMA as a prior
            prior = ema.mean()
            total = prior * params["prior_weight"]
            weight = params["prior_weight"]
            day_total = 0.0
            day_weight = 0
            for kind, stake, price, reference, score in pending:
                if score >= params["min_score"]:
                    day_total += stake * min(score, params["clamp"] * prior)
                    day_weight += stake
            mean = (total + day_total) / (weight + day_weight)
            for game in pending:
                settle(game, mean)
            # The day enters the EMA once, with its own mean and weight
            if day_weight:
                ema.push(day_total / day_weight, day_weight, 0)
            pending = []
        daily_lost.append(lost_today / params["games"])
    multiples.sort()
    daily_lost.sort()

    def pct(values, q):
        return values[min(int(q * len(values)), len(values) - 1)]

    return {
        "games": games,
        "mint_per_burn": minted / burned,
        "house_edge": 1 - received / paid,
        "lost": lost / games,
        "p50": pct(multiples, 0.5),
        "p90": pct(multiples, 0.9),
        "p99": pct(multiples, 0.99),
        "max": multiples[-1],
        "vault_share": vault / paid,
        "referral_share": referral / paid,
        "lp_usdc_share": lp_usdc / paid,
        "supply": supply,
        "price_ratio": (pool_usdc / pool_paved) / price0,
        "mean_end": ema.mean(),
        "daily_lost_p10": pct(daily_lost, 0.1),
        "daily_lost_p90": pct(daily_lost, 0.9),
        "by_kind": {k: (v[1] / v[0] if v[0] else 0.0, v[2]) for k, v in by_kind.items()},
    }


def describe(days):
    print("## Sample")
    print()
    print("| Strategy | Games | Mean | Median | Min | Max | Zero scores |")
    print("|---|---:|---:|---:|---:|---:|---:|")
    for kind in TYPES:
        scores = sorted(s for day in days.values() for s in day.get(kind, []))
        if not scores:
            continue
        print(
            f"| {kind} | {len(scores)} | {sum(scores) / len(scores):,.0f} | {scores[len(scores) // 2]:,} | "
            f"{scores[0]:,} | {scores[-1]:,} | {sum(1 for s in scores if s == 0)} |"
        )
    means = [sum(day["greedy"]) / len(day["greedy"]) for day in days.values() if "greedy" in day]
    noisy = [sum(day["noisy"]) / len(day["noisy"]) for day in days.values() if "noisy" in day]
    for name, values in (("greedy", means), ("noisy", noisy)):
        m = sum(values) / len(values)
        sd = math.sqrt(sum((v - m) ** 2 for v in values) / (len(values) - 1))
        print(f"\nDay effect, {name}: {len(values)} days, mean of the day {m:,.0f}, standard deviation {sd:,.0f} "
              f"(coefficient of variation {sd / m:.0%})")
    print()


def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("scores.csv")
    days = {d: v for d, v in load(path).items() if all(k in v for k in ("greedy", "noisy", "novice"))}
    describe(days)

    population = {"greedy": 0.25, "noisy": 0.5, "novice": 0.25, "replayer": 0.0}
    sample = mixture(days, population)
    min_score = 100
    mean = chain_mean(sample, min_score)

    print("## Calibration of the slope (E[h] = rho on the stationary sample, cap 5)")
    print()
    print("| sigma | share below the threshold | slope for rho 0.8 | rho 0.9 | rho 1.0 |")
    print("|---:|---:|---:|---:|---:|")
    for sigma in (-0.3, -0.2, -0.1, 0.0, 0.1, 0.2, 0.3):
        total = sum(w for _, w in sample)
        below = sum(w for s, w in sample if s / mean < 1 + sigma) / total
        cells = [calibrate(sample, sigma, rho, 5, min_score) for rho in (0.8, 0.9, 1.0)]
        print(f"| {sigma:+.1f} | {below:.0%} | " + " | ".join(f"{c:.3f}" for c in cells) + " |")
    slope = calibrate(sample, 0.0, 0.9, 5, min_score)
    values = sorted((payout_factor(s / mean, 0.0, slope, 5), w) for s, w in sample)
    total = sum(w for _, w in values)

    def quantile(q):
        acc = 0.0
        for value, w in values:
            acc += w
            if acc >= q * total:
                return value
        return values[-1][0]

    capped = sum(w for v, w in values if v >= 5) / total
    print(
        f"\nh at sigma 0, rho 0.9, cap 5 (slope {slope:.3f}): median {quantile(0.5):.2f}, p90 {quantile(0.9):.2f}, "
        f"p99 {quantile(0.99):.2f}, capped {capped:.1%}"
    )
    print(
        f"\nMean of the sample as the contract tracks it (population 25 % greedy, 50 % noisy, 25 % novice; "
        f"scores below {min_score} left out): {mean:,.0f}"
    )
    print()

    base = {
        "population": population,
        "stakes": "inverse",
        "sigma": 0.0,
        "rho": 0.9,
        "cap": 5,
        "mean0": mean,
        "max_weight": 1000,
        "min_score": min_score,
        "settle": "spawn",
        "prior_weight": 100,
        "clamp": 4,
        "target": INITIAL_SUPPLY,
        "depth": 1.0,
        "referred": 0.5,
        "sell": 1.0,
        "days": 365,
        "games": 200,
    }

    def run(label, **changes):
        params = dict(base)
        params.update(changes)
        pop_sample = mixture(days, params["population"])
        if "slope" not in changes:
            params["slope"] = calibrate(
                pop_sample, params["sigma"], params["rho"], params["cap"], params["min_score"]
            )
        r = simulate(days, params, seed=8)
        kinds = ", ".join(f"{k} {v[0]:.2f}" for k, v in r["by_kind"].items())
        print(
            f"| {label} | {params['slope']:.3f} | {r['mint_per_burn']:.3f} | {r['house_edge']:.1%} | {r['lost']:.0%} | "
            f"{r['daily_lost_p10']:.0%}-{r['daily_lost_p90']:.0%} | {r['p50']:.2f} | {r['p90']:.2f} | {r['p99']:.2f} | "
            f"{r['max']:.1f} | {r['supply'] / 1e3:,.0f}k | {r['price_ratio']:.2f} | {kinds} |"
        )

    header = (
        "| Run | slope | mint / burn | house edge | games lost | lost per day p10-p90 | return p50 | p90 | p99 | "
        "max | supply end | price end / start | return by player kind |\n"
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|"
    )
    replayers10 = {"greedy": 0.225, "noisy": 0.45, "novice": 0.225, "replayer": 0.1}
    replayers30 = {"greedy": 0.175, "noisy": 0.35, "novice": 0.175, "replayer": 0.3}
    base_slope = calibrate(mixture(days, population), 0.0, 0.9, 5, min_score)

    for mode, title in (
        ("spawn", "A. The mean frozen at spawn, settled at game over (Nums)"),
        ("day", "B. The day's mean blended with the EMA (prior weight 100), settled after the day"),
    ):
        base["settle"] = mode
        print(f"## Runs {title}: 365 days x 200 games, seed 8")
        print()
        print(header)
        run("base: sigma 0, rho 0.9")
        for sigma in (-0.2, -0.1, 0.1, 0.2):
            run(f"sigma {sigma:+.1f}", sigma=sigma)
        for rho in (0.8, 1.0, 1.2):
            run(f"rho {rho}", rho=rho)
        run("cap 10", cap=10)
        run("cap 2", cap=2)
        run("stakes all 1", stakes="one")
        run("stakes all 10", stakes="ten")
        run("stakes uniform", stakes="uniform")
        run("players keep half", sell=0.5)
        run("pool depth x0.1", depth=0.1)
        run("pool depth x10", depth=10.0)
        run("max weight 100", max_weight=100)
        run("initial mean x0.5", mean0=mean * 0.5)
        run("initial mean x2", mean0=mean * 2)
        run("all greedy", population={"greedy": 1.0, "noisy": 0.0, "novice": 0.0, "replayer": 0.0})
        run("half novices", population={"greedy": 0.15, "noisy": 0.35, "novice": 0.5, "replayer": 0.0})
        run("10 % replayers, slope as base", population=replayers10, slope=base_slope)
        run("30 % replayers, slope as base", population=replayers30, slope=base_slope)
        run("supply target 500k", target=500_000.0)
        if mode == "day":
            run("prior weight 20", prior_weight=20)
            run("prior weight 1000", prior_weight=1000)
            run("20 games a day", games=20)
            run("20 games a day, prior weight 20", games=20, prior_weight=20)
        print()

if __name__ == "__main__":
    main()
