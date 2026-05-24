# Code-writing rules (always active)

Adapted for Kawaii Baby Wallpapers (Expo SDK 55 + Expo Router + RN New Arch, TypeScript).
These are the project's review contract. Apply them to every code change.

## Mandatory check order

1. **Pre-Flight**
   - Search before write (is there already a helper/component/util for this?).
   - Read the target file *fully* before editing it.
   - Check if the area is converged (stable, widely-imported) — extra caution there.
   - Name the ONE thing this change does. If you can't, the change is doing too much.
   - Check applicable lessons in `changes/` and these rules.
2. **Red-Flags scan** (auto-reject — see below). Fix before proceeding.
3. **Make the edit.**
4. **Self-Review**
   - Re-read the diff as a stranger seeing it cold.
   - Justify every name you introduced.
   - Paste real command output for any claim ("tsc passes", "builds") — never assert from memory.

## Red flags — auto-reject

- `any` (use a real type, `unknown` + narrowing, or a precise structural type).
- Empty `catch {}` (handle, log via the project logger, or rethrow — never swallow).
- Vague names: `doStuff`, `process`, `handle`, `data`, `temp`, `manager`, `helper`.
  (Idiomatic React event handlers like `onPress`/`onSave` are fine.)
- The same magic number appearing 3+ times — promote to a named `const`.
- Boolean flag parameters (`fn(x, true)`) — split the function or pass an options object.
- More than 4 parameters — pass an options object.
- More than 3 levels of nesting — extract or use early returns.

## Hard limits

| Unit      | Target | Soft cap (needs justification) | Hard cap |
|-----------|--------|--------------------------------|----------|
| File      | ≤150   | 300                            | 500      |
| Function  | ≤40    | —                              | 80       |

Data-only modules (e.g. `constants/wallpaperCatalog.ts`) are exempt from the file
cap — they are tables, not logic. Logic files over the hard cap must be split.

## Word semantics

When you claim "better", "fast", "quality", or "reliable", you must deliver **all**
those dimensions at once — not pick one and regress the others. See
[four-axes-always.md](four-axes-always.md).

## Deep rulebook (load on demand)

For non-trivial coding tasks, explicitly read
`docs/rules-ondemand/code-writing-deep.md` at the start — it is NOT auto-loaded.
