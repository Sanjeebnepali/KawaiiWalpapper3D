# Production code-quality bar (always active)

- **The 6-month test.** Write it so a teammate (or you) reading it in 6 months, with
  no context, understands *why* it does what it does. Comments explain the *why*, not
  the *what*. The existing `MoodEngineHost.tsx` camera-positioning comment is the
  model: it records the evidence (logcat) and the dead ends, so nobody re-walks them.
- **Types at boundaries.** Public function signatures, store actions, hook params,
  and module exports must be precisely typed. Internal locals can rely on inference.
  No `any` at a boundary — ever.
- **Structured logs at decision points.** Where the code makes a non-obvious branch
  (a fallback, a skip, a retry, a guard that returns early), log it (guarded by
  `__DEV__` for dev-only noise) so failures are diagnosable from output, not guesswork.
- **Fail loud in dev, degrade gracefully in prod.** e.g. the mood engine `catch`
  logs under `__DEV__` and the app keeps running — it never crashes the user.
