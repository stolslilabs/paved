<!-- Source: vercel-labs/agent-skills@063bee94c3f4df8453406c830b0a7df0f2860278, skills/react-best-practices/rules/rendering-svg-precision.md. Licence: MIT (THIRD_PARTY_NOTICES at the repository root). Trimmed for Paved. -->

---
title: Optimize SVG Precision
impact: LOW
impactDescription: reduces file size
tags: rendering, svg, optimization, svgo
---

## Optimize SVG Precision

<!-- Paved: Run `svgo` as a dev tool on an icon before committing it, with the options shown. This skill adds no dependency. Icons are Font Awesome through `<Icon>` (`paved-ui`), so this applies to hand-made SVG only. -->

Reduce SVG coordinate precision to decrease file size. The optimal precision depends on the viewBox size, but in general reducing precision should be considered.

**Incorrect (excessive precision):**

```svg
<path d="M 10.293847 20.847362 L 30.938472 40.192837" />
```

**Correct (1 decimal place):**

```svg
<path d="M 10.3 20.8 L 30.9 40.2" />
```

**Automate with SVGO:**

```bash
svgo --precision=1 --multipass icon.svg
```
