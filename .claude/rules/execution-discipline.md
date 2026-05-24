# Execution discipline (always active)

- **make → test → fix → test.** After any code edit, verify before claiming done.
  This project has no unit-test suite; the available verification gates are:
  - `npx tsc --noEmit` (type check — note: 5 pre-existing, unrelated errors exist;
    your change must not *add* new ones).
  - A real build/run when behaviour matters: `npx expo run:android` (or the
    release-APK path in CLAUDE.md). Paste the actual result.
- **Never stop mid-task.** If a change spans multiple steps, finish the whole unit
  (edit + verify + changelog) before yielding. Don't leave the build broken.
- **TodoWrite / task tracking on multi-step work.** Break multi-file or multi-stage
  work into tracked steps and keep their status current.
- **Behaviour-preserving by default.** Unless the task is explicitly to change
  behaviour, every refactor must leave runtime behaviour identical.
