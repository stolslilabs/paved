## Sample

| Strategy | Games | Mean | Median | Min | Max | Zero scores |
|---|---:|---:|---:|---:|---:|---:|
| greedy | 50 | 5,176 | 4,820 | 1,518 | 9,117 | 0 |
| noisy | 100 | 4,670 | 4,694 | 900 | 8,599 | 0 |
| novice | 50 | 1,405 | 1,257 | 209 | 4,343 | 0 |
| bare | 5 | 4,248 | 4,327 | 3,305 | 4,980 | 0 |

Day effect, greedy: 50 days, mean of the day 5,176, standard deviation 1,604 (coefficient of variation 31%)

Day effect, noisy: 50 days, mean of the day 4,670, standard deviation 1,003 (coefficient of variation 21%)

## Calibration of the slope (E[h] = rho on the stationary sample, cap 5)

| sigma | share below the threshold | slope for rho 0.8 | rho 0.9 | rho 1.0 |
|---:|---:|---:|---:|---:|
| -0.3 | 28% | 0.618 | 0.695 | 0.772 |
| -0.2 | 32% | 0.737 | 0.829 | 0.921 |
| -0.1 | 39% | 0.885 | 0.995 | 1.106 |
| +0.0 | 47% | 1.087 | 1.222 | 1.358 |
| +0.1 | 55% | 1.339 | 1.506 | 1.674 |
| +0.2 | 65% | 1.791 | 2.015 | 2.239 |
| +0.3 | 73% | 2.384 | 2.682 | 2.984 |

h at sigma 0, rho 0.9, cap 5 (slope 1.222): median 1.27, p90 2.03, p99 2.54, capped 0.0%

Mean of the sample as the contract tracks it (population 25 % greedy, 50 % noisy, 25 % novice; scores below 100 left out): 3,980

## Runs A. The mean frozen at spawn, settled at game over (Nums): 365 days x 200 games, seed 8

| Run | slope | mint / burn | house edge | games lost | lost per day p10-p90 | return p50 | p90 | p99 | max | supply end | price end / start | return by player kind |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| base: sigma 0, rho 0.9 | 1.222 | 0.998 | 36.7% | 45% | 24%-73% | 0.87 | 1.33 | 1.70 | 2.5 | 977k | 6.68 | greedy 0.96, noisy 0.77, novice 0.02 |
| sigma -0.2 | 0.829 | 0.994 | 37.0% | 32% | 21%-51% | 0.75 | 1.15 | 1.46 | 2.1 | 949k | 7.52 | greedy 0.91, noisy 0.79, novice 0.03 |
| sigma -0.1 | 0.995 | 0.996 | 36.8% | 38% | 22%-56% | 0.79 | 1.22 | 1.55 | 2.2 | 963k | 7.05 | greedy 0.94, noisy 0.78, novice 0.03 |
| sigma +0.1 | 1.506 | 0.994 | 37.1% | 54% | 26%-82% | 0.00 | 1.52 | 1.95 | 2.8 | 941k | 7.69 | greedy 0.97, noisy 0.76, novice 0.01 |
| sigma +0.2 | 2.015 | 0.993 | 37.8% | 64% | 36%-100% | 0.00 | 1.81 | 2.35 | 3.3 | 933k | 9.90 | greedy 0.97, noisy 0.75, novice 0.01 |
| rho 0.8 | 1.087 | 0.979 | 37.3% | 45% | 24%-73% | 0.86 | 1.33 | 1.69 | 2.5 | 844k | 8.20 | greedy 0.95, noisy 0.76, novice 0.02 |
| rho 1.0 | 1.358 | 1.007 | 36.4% | 45% | 24%-73% | 0.87 | 1.34 | 1.71 | 2.5 | 1,082k | 6.00 | greedy 0.97, noisy 0.77, novice 0.02 |
| rho 1.2 | 1.630 | 1.017 | 36.2% | 45% | 24%-73% | 0.87 | 1.34 | 1.71 | 2.6 | 1,238k | 5.42 | greedy 0.97, noisy 0.78, novice 0.02 |
| cap 10 | 1.222 | 0.998 | 36.7% | 45% | 24%-73% | 0.87 | 1.33 | 1.70 | 2.5 | 977k | 6.68 | greedy 0.96, noisy 0.77, novice 0.02 |
| cap 2 | 1.276 | 0.999 | 36.7% | 45% | 24%-73% | 0.90 | 1.31 | 1.42 | 1.5 | 986k | 6.62 | greedy 0.95, noisy 0.78, novice 0.02 |
| stakes all 1 | 1.222 | 0.982 | 37.6% | 46% | 23%-76% | 0.87 | 1.37 | 1.74 | 2.4 | 921k | 2.54 | greedy 0.95, noisy 0.76, novice 0.02 |
| stakes all 10 | 1.222 | 1.001 | 36.5% | 44% | 24%-69% | 0.89 | 1.32 | 1.67 | 2.6 | 1,020k | 29.51 | greedy 0.99, noisy 0.77, novice 0.01 |
| stakes uniform | 1.222 | 1.000 | 36.6% | 44% | 24%-72% | 0.87 | 1.32 | 1.67 | 2.5 | 996k | 12.09 | greedy 0.97, noisy 0.77, novice 0.02 |
| players keep half | 1.222 | 0.996 | 37.1% | 45% | 24%-73% | 0.86 | 1.33 | 1.68 | 2.4 | 994k | 353.51 | greedy 0.96, noisy 0.77, novice 0.02 |
| pool depth x0.1 | 1.222 | 1.001 | 39.0% | 45% | 24%-73% | 0.84 | 1.29 | 1.63 | 2.3 | 1,001k | 810.99 | greedy 0.93, noisy 0.74, novice 0.02 |
| pool depth x10 | 1.222 | 0.999 | 36.9% | 45% | 24%-73% | 0.86 | 1.33 | 1.71 | 2.6 | 976k | 1.36 | greedy 0.96, noisy 0.77, novice 0.02 |
| max weight 100 | 1.222 | 0.999 | 36.7% | 44% | 26%-64% | 0.88 | 1.29 | 1.69 | 3.3 | 990k | 6.59 | greedy 0.98, noisy 0.77, novice 0.01 |
| initial mean x0.5 | 1.222 | 0.998 | 36.7% | 45% | 24%-73% | 0.86 | 1.33 | 1.70 | 2.5 | 977k | 6.73 | greedy 0.96, noisy 0.77, novice 0.02 |
| initial mean x2 | 1.222 | 0.998 | 36.6% | 45% | 24%-74% | 0.87 | 1.34 | 1.71 | 2.5 | 978k | 6.51 | greedy 0.96, noisy 0.77, novice 0.02 |
| all greedy | 1.655 | 1.000 | 37.9% | 51% | 0%-100% | 0.00 | 1.37 | 1.78 | 2.4 | 997k | 10.13 | greedy 0.62 |
| half novices | 1.186 | 0.994 | 37.0% | 53% | 44%-68% | 0.00 | 1.56 | 2.07 | 3.1 | 945k | 7.61 | greedy 1.33, noisy 1.16, novice 0.04 |
| 10 % replayers, slope as base | 1.222 | 0.997 | 37.0% | 50% | 24%-75% | 0.00 | 1.24 | 1.55 | 2.3 | 966k | 9.65 | greedy 0.72, noisy 0.61, novice 0.00, replayer 1.08 |
| 30 % replayers, slope as base | 1.222 | 0.997 | 36.9% | 53% | 28%-100% | 0.00 | 1.14 | 1.43 | 2.0 | 971k | 13.57 | greedy 0.50, noisy 0.42, novice 0.00, replayer 0.87 |
| supply target 500k | 1.222 | 0.817 | 40.7% | 45% | 24%-73% | 0.80 | 1.28 | 1.65 | 2.4 | 488k | 21.15 | greedy 0.90, noisy 0.72, novice 0.02 |

## Runs B. The day's mean blended with the EMA (prior weight 100), settled after the day: 365 days x 200 games, seed 8

| Run | slope | mint / burn | house edge | games lost | lost per day p10-p90 | return p50 | p90 | p99 | max | supply end | price end / start | return by player kind |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| base: sigma 0, rho 0.9 | 1.222 | 0.999 | 36.6% | 43% | 24%-70% | 0.88 | 1.27 | 1.63 | 2.1 | 987k | 6.40 | greedy 1.01, noisy 0.76, novice 0.00 |
| sigma -0.2 | 0.829 | 0.995 | 36.9% | 30% | 21%-50% | 0.76 | 1.09 | 1.39 | 1.8 | 957k | 7.31 | greedy 0.90, noisy 0.79, novice 0.02 |
| sigma -0.1 | 0.995 | 0.996 | 36.7% | 37% | 22%-53% | 0.82 | 1.18 | 1.50 | 2.0 | 962k | 6.69 | greedy 0.95, noisy 0.78, novice 0.02 |
| sigma +0.1 | 1.506 | 0.999 | 36.3% | 52% | 28%-74% | 0.00 | 1.45 | 1.85 | 2.4 | 992k | 5.80 | greedy 1.01, noisy 0.77, novice 0.00 |
| sigma +0.2 | 2.015 | 0.999 | 36.7% | 61% | 46%-78% | 0.00 | 1.74 | 2.24 | 3.0 | 990k | 6.62 | greedy 1.00, noisy 0.76, novice 0.00 |
| rho 0.8 | 1.087 | 0.981 | 37.1% | 43% | 24%-70% | 0.87 | 1.26 | 1.61 | 2.1 | 854k | 7.77 | greedy 1.00, noisy 0.76, novice 0.00 |
| rho 1.0 | 1.358 | 1.008 | 36.3% | 43% | 24%-70% | 0.88 | 1.28 | 1.64 | 2.1 | 1,092k | 5.75 | greedy 1.01, noisy 0.77, novice 0.00 |
| rho 1.2 | 1.630 | 1.018 | 36.1% | 43% | 24%-70% | 0.88 | 1.29 | 1.66 | 2.2 | 1,248k | 5.17 | greedy 1.01, noisy 0.77, novice 0.00 |
| cap 10 | 1.222 | 0.999 | 36.6% | 43% | 24%-70% | 0.88 | 1.27 | 1.63 | 2.1 | 987k | 6.40 | greedy 1.01, noisy 0.76, novice 0.00 |
| cap 2 | 1.276 | 1.002 | 36.4% | 43% | 24%-70% | 0.90 | 1.28 | 1.43 | 1.6 | 1,018k | 6.03 | greedy 1.01, noisy 0.76, novice 0.00 |
| stakes all 1 | 1.222 | 0.986 | 37.3% | 43% | 24%-70% | 0.89 | 1.29 | 1.59 | 1.8 | 937k | 2.43 | greedy 0.99, noisy 0.75, novice 0.01 |
| stakes all 10 | 1.222 | 1.002 | 36.4% | 44% | 24%-72% | 0.87 | 1.33 | 1.72 | 2.6 | 1,026k | 26.97 | greedy 1.01, noisy 0.77, novice 0.00 |
| stakes uniform | 1.222 | 1.000 | 36.5% | 44% | 24%-72% | 0.88 | 1.29 | 1.66 | 2.2 | 1,000k | 11.42 | greedy 1.00, noisy 0.76, novice 0.00 |
| players keep half | 1.222 | 0.992 | 35.9% | 43% | 24%-70% | 0.90 | 1.28 | 1.62 | 2.0 | 989k | 342.74 | greedy 1.01, noisy 0.77, novice 0.00 |
| pool depth x0.1 | 1.222 | 0.983 | 37.3% | 43% | 24%-70% | 0.80 | 1.31 | 1.92 | 4.0 | 981k | 399.87 | greedy 0.99, noisy 0.75, novice 0.00 |
| pool depth x10 | 1.222 | 1.001 | 36.7% | 43% | 24%-70% | 0.89 | 1.26 | 1.61 | 2.0 | 1,031k | 1.34 | greedy 1.00, noisy 0.76, novice 0.00 |
| max weight 100 | 1.222 | 0.999 | 36.6% | 43% | 24%-70% | 0.88 | 1.27 | 1.61 | 2.1 | 989k | 6.47 | greedy 1.00, noisy 0.76, novice 0.00 |
| initial mean x0.5 | 1.222 | 0.999 | 36.6% | 43% | 24%-70% | 0.88 | 1.27 | 1.63 | 2.1 | 987k | 6.40 | greedy 1.01, noisy 0.76, novice 0.00 |
| initial mean x2 | 1.222 | 0.999 | 36.6% | 43% | 24%-70% | 0.88 | 1.27 | 1.63 | 2.1 | 987k | 6.38 | greedy 1.01, noisy 0.76, novice 0.00 |
| all greedy | 1.655 | 0.977 | 38.7% | 50% | 0%-100% | 0.00 | 1.31 | 1.42 | 1.6 | 813k | 12.85 | greedy 0.61 |
| half novices | 1.186 | 0.992 | 36.9% | 54% | 46%-68% | 0.00 | 1.60 | 2.03 | 2.9 | 933k | 7.12 | greedy 1.35, noisy 1.20, novice 0.02 |
| 10 % replayers, slope as base | 1.222 | 1.003 | 36.7% | 45% | 24%-68% | 0.81 | 1.11 | 1.29 | 1.6 | 1,033k | 8.50 | greedy 0.75, noisy 0.60, novice 0.00, replayer 1.09 |
| 30 % replayers, slope as base | 1.222 | 1.009 | 36.5% | 43% | 31%-56% | 0.74 | 0.94 | 1.09 | 1.4 | 1,119k | 11.11 | greedy 0.46, noisy 0.41, novice 0.00, replayer 0.89 |
| supply target 500k | 1.222 | 0.819 | 40.6% | 43% | 24%-70% | 0.82 | 1.22 | 1.56 | 1.9 | 492k | 20.42 | greedy 0.95, noisy 0.71, novice 0.00 |
| prior weight 20 | 1.222 | 0.999 | 36.6% | 43% | 24%-70% | 0.88 | 1.28 | 1.65 | 2.2 | 990k | 6.36 | greedy 1.00, noisy 0.76, novice 0.00 |
| prior weight 1000 | 1.222 | 0.999 | 36.5% | 44% | 24%-74% | 0.87 | 1.32 | 1.66 | 2.3 | 988k | 6.20 | greedy 0.98, noisy 0.77, novice 0.02 |
| 20 games a day | 1.222 | 0.974 | 38.5% | 44% | 20%-70% | 0.87 | 1.30 | 1.59 | 1.9 | 945k | 1.55 | greedy 0.94, noisy 0.73, novice 0.02 |
| 20 games a day, prior weight 20 | 1.222 | 0.983 | 37.9% | 43% | 20%-65% | 0.87 | 1.26 | 1.59 | 2.2 | 963k | 1.48 | greedy 0.96, noisy 0.75, novice 0.00 |

