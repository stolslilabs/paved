<!-- Source: vercel-labs/agent-skills@063bee94c3f4df8453406c830b0a7df0f2860278, skills/react-best-practices/rules/bundle-defer-third-party.md. Licence: MIT (THIRD_PARTY_NOTICES at the repository root). Trimmed for Paved. -->

---
title: Defer Non-Critical Third-Party Libraries
impact: MEDIUM
impactDescription: loads after hydration
tags: bundle, third-party, analytics, defer
---

## Defer Non-Critical Third-Party Libraries

<!-- Paved: The app ships no analytics. If a third-party script is ever added it must be self-hosted (no CDN at run time) and loaded after first render with `React.lazy` or an `import()` in an effect; `next/dynamic` and `@vercel/analytics` below are upstream examples only. -->

Analytics, logging, and error tracking don't block user interaction. Load them after hydration.

**Incorrect (blocks initial bundle):**

```tsx
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

**Correct (loads after hydration):**

```tsx
import dynamic from 'next/dynamic'

const Analytics = dynamic(
  () => import('@vercel/analytics/react').then(m => m.Analytics),
  { ssr: false }
)

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```
