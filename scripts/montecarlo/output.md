## Sample

| Strategy | Games | Mean | Median | Min | Max | Zero scores |
|---|---:|---:|---:|---:|---:|---:|
| greedy | 50 | 3,640 | 3,446 | 0 | 8,074 | 2 |
| noisy | 100 | 2,965 | 2,443 | 0 | 9,062 | 14 |
| novice | 50 | 287 | 0 | 0 | 1,755 | 37 |
| bare | 5 | 0 | 0 | 0 | 0 | 5 |

Day effect, greedy: 50 days, mean of the day 3,640, standard deviation 1,992 (coefficient of variation 55%)

Day effect, noisy: 50 days, mean of the day 2,965, standard deviation 1,495 (coefficient of variation 50%)

## Calibration of the slope (E[h] = rho on the stationary sample, cap 5)

| sigma | share below the threshold | slope for rho 0.8 | rho 0.9 | rho 1.0 |
|---:|---:|---:|---:|---:|
| -0.3 | 56% | 0.921 | 1.036 | 1.151 |
| -0.2 | 62% | 1.131 | 1.272 | 1.414 |
| -0.1 | 64% | 1.312 | 1.476 | 1.640 |
| +0.0 | 69% | 1.612 | 1.813 | 2.022 |
| +0.1 | 72% | 1.916 | 2.159 | 2.429 |
| +0.2 | 74% | 2.144 | 2.421 | 2.736 |
| +0.3 | 76% | 2.497 | 2.843 | 3.276 |

h at sigma 0, rho 0.9, cap 5 (slope 1.813): median 0.00, p90 3.16, p99 4.60, capped 0.0%

Mean of the sample as the contract tracks it (population 25 % greedy, 50 % noisy, 25 % novice; scores below 100 left out): 3,353

## Runs A. The mean frozen at spawn, settled at game over (Nums): 365 days x 200 games, seed 8

| Run | slope | mint / burn | house edge | games lost | lost per day p10-p90 | return p50 | p90 | p99 | max | supply end | price end / start | return by player kind |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| base: sigma 0, rho 0.9 | 1.813 | 0.989 | 37.3% | 69% | 46%-100% | 0.00 | 2.13 | 3.08 | 3.9 | 905k | 8.29 | greedy 0.99, noisy 0.75, novice 0.00 |
| sigma -0.2 | 1.272 | 0.993 | 37.0% | 60% | 26%-87% | 0.00 | 1.83 | 2.64 | 3.7 | 937k | 7.50 | greedy 1.01, noisy 0.75, novice 0.00 |
| sigma -0.1 | 1.476 | 0.986 | 37.4% | 64% | 38%-100% | 0.00 | 1.95 | 2.83 | 3.9 | 886k | 8.61 | greedy 0.99, noisy 0.75, novice 0.00 |
| sigma +0.1 | 2.159 | 0.989 | 37.1% | 72% | 47%-100% | 0.00 | 2.32 | 3.37 | 4.0 | 907k | 7.88 | greedy 0.97, noisy 0.77, novice 0.00 |
| sigma +0.2 | 2.421 | 0.975 | 37.8% | 76% | 48%-100% | 0.00 | 2.54 | 3.69 | 4.2 | 814k | 9.86 | greedy 0.95, noisy 0.77, novice 0.00 |
| rho 0.8 | 1.612 | 0.966 | 38.1% | 69% | 46%-100% | 0.00 | 2.10 | 3.04 | 4.3 | 771k | 10.87 | greedy 0.98, noisy 0.75, novice 0.00 |
| rho 1.0 | 2.022 | 1.002 | 36.8% | 69% | 46%-100% | 0.00 | 2.15 | 3.10 | 3.6 | 1,018k | 7.03 | greedy 1.00, noisy 0.76, novice 0.00 |
| rho 1.2 | 2.520 | 1.015 | 36.3% | 69% | 46%-100% | 0.00 | 2.22 | 2.77 | 3.3 | 1,198k | 5.82 | greedy 1.02, noisy 0.76, novice 0.00 |
| cap 10 | 1.813 | 0.989 | 37.3% | 69% | 46%-100% | 0.00 | 2.13 | 3.08 | 5.1 | 906k | 8.29 | greedy 0.99, noisy 0.76, novice 0.00 |
| cap 2 | inf | 0.887 | 42.0% | 69% | 46%-100% | 0.00 | 1.88 | 2.00 | 2.0 | 535k | 27.38 | greedy 0.95, noisy 0.68, novice 0.00 |
| stakes all 1 | 1.813 | 0.970 | 38.3% | 69% | 44%-100% | 0.00 | 2.13 | 3.20 | 3.7 | 873k | 2.90 | greedy 0.96, noisy 0.75, novice 0.00 |
| stakes all 10 | 1.813 | 0.998 | 36.9% | 67% | 46%-93% | 0.00 | 2.10 | 3.03 | 3.7 | 972k | 34.77 | greedy 1.02, noisy 0.75, novice 0.00 |
| stakes uniform | 1.813 | 0.993 | 37.2% | 68% | 46%-100% | 0.00 | 2.10 | 3.05 | 3.8 | 929k | 15.64 | greedy 1.00, noisy 0.75, novice 0.00 |
| players keep half | 1.813 | 0.986 | 39.5% | 69% | 46%-100% | 0.00 | 2.05 | 2.94 | 3.6 | 980k | 375.61 | greedy 0.95, noisy 0.73, novice 0.00 |
| pool depth x0.1 | 1.813 | 1.001 | 42.1% | 69% | 46%-100% | 0.00 | 1.96 | 2.82 | 3.5 | 1,002k | 1891.40 | greedy 0.91, noisy 0.70, novice 0.00 |
| pool depth x10 | 1.813 | 0.998 | 36.9% | 69% | 46%-100% | 0.00 | 2.15 | 3.17 | 4.3 | 954k | 1.37 | greedy 1.00, noisy 0.76, novice 0.00 |
| max weight 100 | 1.813 | 0.996 | 36.8% | 65% | 47%-80% | 0.00 | 1.95 | 2.76 | 3.7 | 962k | 6.95 | greedy 1.05, noisy 0.73, novice 0.00 |
| initial mean x0.5 | 1.813 | 0.989 | 37.3% | 69% | 46%-100% | 0.00 | 2.13 | 3.08 | 3.9 | 905k | 8.41 | greedy 0.99, noisy 0.75, novice 0.00 |
| initial mean x2 | 1.813 | 0.989 | 37.2% | 69% | 46%-100% | 0.00 | 2.14 | 3.09 | 3.9 | 905k | 8.14 | greedy 0.99, noisy 0.76, novice 0.00 |
| all greedy | 1.426 | 0.996 | 36.4% | 52% | 0%-100% | 0.00 | 1.50 | 2.12 | 3.6 | 966k | 5.86 | greedy 0.64 |
| half novices | 2.328 | 0.986 | 37.3% | 77% | 57%-100% | 0.00 | 2.70 | 3.72 | 4.1 | 886k | 8.39 | greedy 1.52, noisy 1.13, novice 0.00 |
| 10 % replayers, slope as base | 1.813 | 1.008 | 36.6% | 69% | 42%-100% | 0.00 | 1.73 | 2.46 | 3.8 | 1,096k | 7.92 | greedy 0.65, noisy 0.51, novice 0.00, replayer 1.31 |
| 30 % replayers, slope as base | 1.813 | 1.010 | 36.8% | 66% | 39%-100% | 0.00 | 1.45 | 2.04 | 3.5 | 1,151k | 13.10 | greedy 0.37, noisy 0.33, novice 0.00, replayer 0.93 |
| supply target 500k | 1.813 | 0.793 | 41.9% | 69% | 46%-100% | 0.00 | 2.01 | 2.96 | 3.8 | 458k | 26.68 | greedy 0.92, noisy 0.70, novice 0.00 |

## Runs B. The day's mean blended with the EMA (prior weight 100), settled after the day: 365 days x 200 games, seed 8

| Run | slope | mint / burn | house edge | games lost | lost per day p10-p90 | return p50 | p90 | p99 | max | supply end | price end / start | return by player kind |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| base: sigma 0, rho 0.9 | 1.813 | 0.988 | 37.0% | 66% | 48%-78% | 0.00 | 2.00 | 2.58 | 3.2 | 901k | 7.63 | greedy 1.05, noisy 0.73, novice 0.00 |
| sigma -0.2 | 1.272 | 0.996 | 36.7% | 56% | 26%-76% | 0.00 | 1.68 | 2.17 | 2.7 | 961k | 6.79 | greedy 1.08, noisy 0.71, novice 0.02 |
| sigma -0.1 | 1.476 | 0.991 | 36.9% | 60% | 46%-78% | 0.00 | 1.78 | 2.30 | 2.9 | 923k | 7.27 | greedy 1.07, noisy 0.72, novice 0.01 |
| sigma +0.1 | 2.159 | 0.985 | 37.2% | 70% | 48%-80% | 0.00 | 2.21 | 2.85 | 3.6 | 878k | 7.94 | greedy 1.00, noisy 0.75, novice 0.00 |
| sigma +0.2 | 2.421 | 0.950 | 38.7% | 76% | 50%-100% | 0.00 | 2.53 | 3.27 | 4.1 | 706k | 12.80 | greedy 0.93, noisy 0.76, novice 0.00 |
| rho 0.8 | 1.612 | 0.963 | 37.9% | 66% | 48%-78% | 0.00 | 1.98 | 2.55 | 3.2 | 762k | 10.01 | greedy 1.04, noisy 0.72, novice 0.00 |
| rho 1.0 | 2.022 | 1.002 | 36.6% | 66% | 48%-78% | 0.00 | 2.02 | 2.61 | 3.3 | 1,017k | 6.52 | greedy 1.06, noisy 0.73, novice 0.00 |
| rho 1.2 | 2.520 | 1.016 | 36.2% | 66% | 48%-78% | 0.00 | 2.04 | 2.64 | 3.5 | 1,217k | 5.42 | greedy 1.06, noisy 0.74, novice 0.00 |
| cap 10 | 1.813 | 0.988 | 37.0% | 66% | 48%-78% | 0.00 | 2.00 | 2.58 | 3.2 | 901k | 7.63 | greedy 1.05, noisy 0.73, novice 0.00 |
| cap 2 | inf | 0.919 | 39.3% | 66% | 48%-78% | 0.00 | 1.81 | 1.93 | 2.0 | 621k | 15.26 | greedy 1.05, noisy 0.68, novice 0.00 |
| stakes all 1 | 1.813 | 0.954 | 39.1% | 68% | 47%-100% | 0.00 | 2.07 | 2.67 | 3.1 | 823k | 3.28 | greedy 0.96, noisy 0.73, novice 0.00 |
| stakes all 10 | 1.813 | 0.999 | 36.5% | 64% | 48%-78% | 0.00 | 2.00 | 2.68 | 3.6 | 988k | 29.67 | greedy 1.09, noisy 0.72, novice 0.00 |
| stakes uniform | 1.813 | 0.993 | 36.8% | 65% | 48%-78% | 0.00 | 2.00 | 2.60 | 3.3 | 930k | 13.29 | greedy 1.06, noisy 0.73, novice 0.00 |
| players keep half | 1.813 | 0.963 | 37.9% | 66% | 48%-78% | 0.00 | 1.97 | 2.50 | 3.0 | 948k | 360.91 | greedy 1.04, noisy 0.72, novice 0.00 |
| pool depth x0.1 | 1.813 | 0.940 | 40.3% | 66% | 48%-78% | 0.00 | 1.90 | 2.60 | 6.7 | 956k | 1226.91 | greedy 0.99, noisy 0.69, novice 0.00 |
| pool depth x10 | 1.813 | 0.999 | 36.8% | 66% | 48%-78% | 0.00 | 2.00 | 2.61 | 3.0 | 968k | 1.36 | greedy 1.06, noisy 0.73, novice 0.00 |
| max weight 100 | 1.813 | 0.992 | 36.9% | 65% | 48%-78% | 0.00 | 1.98 | 2.58 | 3.1 | 928k | 7.14 | greedy 1.06, noisy 0.73, novice 0.00 |
| initial mean x0.5 | 1.813 | 0.988 | 37.1% | 66% | 48%-78% | 0.00 | 2.00 | 2.58 | 3.2 | 901k | 7.71 | greedy 1.05, noisy 0.73, novice 0.00 |
| initial mean x2 | 1.813 | 0.988 | 37.0% | 66% | 48%-78% | 0.00 | 2.00 | 2.58 | 3.2 | 901k | 7.61 | greedy 1.05, noisy 0.73, novice 0.00 |
| all greedy | 1.426 | 0.943 | 38.0% | 50% | 0%-100% | 0.00 | 1.31 | 1.42 | 1.6 | 698k | 10.60 | greedy 0.62 |
| half novices | 2.328 | 0.984 | 37.3% | 76% | 62%-87% | 0.00 | 2.57 | 3.67 | 4.3 | 873k | 8.26 | greedy 1.60, noisy 1.10, novice 0.00 |
| 10 % replayers, slope as base | 1.813 | 1.011 | 36.5% | 64% | 45%-72% | 0.00 | 1.48 | 1.81 | 2.4 | 1,145k | 7.71 | greedy 0.62, noisy 0.50, novice 0.00, replayer 1.36 |
| 30 % replayers, slope as base | 1.813 | 1.016 | 36.8% | 55% | 42%-61% | 0.00 | 1.10 | 1.30 | 2.0 | 1,265k | 12.72 | greedy 0.37, noisy 0.31, novice 0.00, replayer 0.94 |
| supply target 500k | 1.813 | 0.785 | 41.8% | 66% | 48%-78% | 0.00 | 1.88 | 2.44 | 3.1 | 456k | 26.10 | greedy 0.98, noisy 0.67, novice 0.00 |
| prior weight 20 | 1.813 | 0.996 | 36.6% | 64% | 47%-78% | 0.00 | 1.93 | 2.49 | 3.2 | 965k | 6.46 | greedy 1.09, noisy 0.72, novice 0.00 |
| prior weight 1000 | 1.813 | 0.987 | 37.5% | 68% | 46%-100% | 0.00 | 2.08 | 2.93 | 3.9 | 887k | 9.04 | greedy 1.00, noisy 0.74, novice 0.00 |
| 20 games a day | 1.813 | 0.959 | 39.1% | 67% | 35%-100% | 0.00 | 2.03 | 2.79 | 3.2 | 920k | 1.63 | greedy 0.99, noisy 0.70, novice 0.00 |
| 20 games a day, prior weight 20 | 1.813 | 0.959 | 39.1% | 66% | 40%-90% | 0.00 | 1.95 | 2.66 | 3.4 | 921k | 1.62 | greedy 0.99, noisy 0.70, novice 0.00 |

