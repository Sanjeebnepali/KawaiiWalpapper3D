/**
 * Unit tests for the in-memory action surface of `store/ai.ts`.
 *
 * Validates the store after the refactor that split its types into
 * `store/ai.types.ts` and its persistence into `store/ai.persistence.ts`.
 * We exercise behaviour only through `useAIStore.getState()` — no React,
 * no render. The persistence layer (AsyncStorage + a 200ms debounced
 * setTimeout in `schedulePersist`) is neutralised two ways:
 *
 *   1. The AsyncStorage native module is mocked with the package's own
 *      jest mock (below), so `getStorage()` resolves to a no-op store and
 *      nothing touches a real device API.
 *   2. `jest.useFakeTimers()` means the debounce timer never actually
 *      fires during a test, and `afterEach` clears any pending timer so
 *      Jest reports no open handles.
 *
 * Expected values are derived from the real implementation:
 *   - HISTORY_LIMIT is imported from the store (currently 30).
 *   - DEFAULTS are reconstructed locally to match `store/ai.ts`.
 */

// Mock AsyncStorage before the store module is imported so the lazy
// `require('@react-native-async-storage/async-storage')` inside
// `getStorage()` resolves to the package's in-memory jest mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { HISTORY_LIMIT, useAIStore } from '../ai';
import type { AIGeneration } from '../ai';
import { localDayKey } from '../ai.persistence';

// The persistence debounce uses setTimeout(…, 200); fake timers stop it
// from firing mid-test and let afterEach prove there are no open handles.
jest.useFakeTimers();

// Mirror of DEFAULTS in store/ai.ts (kept local — the store doesn't
// export it). Used to assert reset() and field independence.
const DEFAULTS = {
  hfToken: '',
  pollToken: '',
  openaiToken: '',
  geminiToken: '',
  hfModelId: '',
  providerId: 'pollinations' as const,
  history: [] as AIGeneration[],
  dailyGen: { dayKey: '', count: 0 },
};

/** Build an AIGeneration, distinguishable by its localUri. */
function gen(uri: string, overrides: Partial<AIGeneration> = {}): AIGeneration {
  return {
    localUri: uri,
    prompt: `prompt for ${uri}`,
    provider: 'pollinations',
    model: 'flux',
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

const todayKey = () => localDayKey(new Date());

beforeEach(() => {
  // The store is a module singleton shared across tests — reset() restores
  // DEFAULTS (and keeps hydrated true), giving each test a clean slate.
  useAIStore.getState().reset();
});

afterEach(() => {
  // Drain the 200ms persistence debounce so no timer leaks between tests
  // and Jest reports no open handles.
  jest.clearAllTimers();
});

describe('recordGeneration', () => {
  it('prepends newest-first', () => {
    const { recordGeneration } = useAIStore.getState();
    recordGeneration(gen('a'));
    recordGeneration(gen('b'));
    recordGeneration(gen('c'));

    const ids = useAIStore.getState().history.map((g) => g.localUri);
    expect(ids).toEqual(['c', 'b', 'a']);
  });

  it('caps history at HISTORY_LIMIT, dropping the oldest', () => {
    const { recordGeneration } = useAIStore.getState();
    // Record one more than the limit; the very first one must fall off.
    const total = HISTORY_LIMIT + 5;
    for (let i = 0; i < total; i++) {
      recordGeneration(gen(`uri-${i}`));
    }

    const history = useAIStore.getState().history;
    expect(history).toHaveLength(HISTORY_LIMIT);
    // Newest-first: index 0 is the last recorded.
    expect(history[0].localUri).toBe(`uri-${total - 1}`);
    // The most recent HISTORY_LIMIT survive; everything older is gone.
    expect(history[HISTORY_LIMIT - 1].localUri).toBe(`uri-${total - HISTORY_LIMIT}`);
    expect(history.some((g) => g.localUri === 'uri-0')).toBe(false);
  });
});

describe('bumpDailyGen / todayCount', () => {
  it('increments same-day and todayCount reflects it', () => {
    const { bumpDailyGen, todayCount } = useAIStore.getState();
    expect(todayCount()).toBe(0);

    bumpDailyGen();
    expect(useAIStore.getState().dailyGen).toEqual({ dayKey: todayKey(), count: 1 });
    expect(useAIStore.getState().todayCount()).toBe(1);

    bumpDailyGen();
    expect(useAIStore.getState().dailyGen.count).toBe(2);
    expect(useAIStore.getState().todayCount()).toBe(2);
  });

  it('rolls over to count 1 when the stored dayKey is a previous local day', () => {
    // Seed a stale counter from "yesterday" so bumpDailyGen sees a day change.
    useAIStore.setState({ dailyGen: { dayKey: '2000-01-01', count: 9 } });
    // A stale day means todayCount is 0 until the next bump rolls it over.
    expect(useAIStore.getState().todayCount()).toBe(0);

    useAIStore.getState().bumpDailyGen();
    expect(useAIStore.getState().dailyGen).toEqual({ dayKey: todayKey(), count: 1 });
    expect(useAIStore.getState().todayCount()).toBe(1);
  });

  it('is independent of history — recording generations does not change todayCount', () => {
    const { bumpDailyGen, recordGeneration } = useAIStore.getState();
    bumpDailyGen();
    recordGeneration(gen('x'));
    recordGeneration(gen('y'));
    expect(useAIStore.getState().history).toHaveLength(2);
    expect(useAIStore.getState().todayCount()).toBe(1);
  });

  it('clearing history does not change todayCount', () => {
    const { bumpDailyGen, recordGeneration, clearHistory } = useAIStore.getState();
    bumpDailyGen();
    bumpDailyGen();
    recordGeneration(gen('x'));
    clearHistory();
    expect(useAIStore.getState().history).toEqual([]);
    expect(useAIStore.getState().todayCount()).toBe(2);
  });
});

describe('removeGeneration', () => {
  it('removes the matching localUri', () => {
    const { recordGeneration, removeGeneration } = useAIStore.getState();
    recordGeneration(gen('a'));
    recordGeneration(gen('b'));
    recordGeneration(gen('c'));

    removeGeneration('b');
    const ids = useAIStore.getState().history.map((g) => g.localUri);
    expect(ids).toEqual(['c', 'a']);
  });

  it('is a no-op for an unknown localUri (history reference unchanged)', () => {
    const { recordGeneration, removeGeneration } = useAIStore.getState();
    recordGeneration(gen('a'));
    recordGeneration(gen('b'));
    const before = useAIStore.getState().history;

    removeGeneration('does-not-exist');
    const after = useAIStore.getState().history;
    // Early-return means set() is never called, so the array identity holds.
    expect(after).toBe(before);
    expect(after.map((g) => g.localUri)).toEqual(['b', 'a']);
  });
});

describe('clearHistory', () => {
  it('empties history but leaves dailyGen untouched', () => {
    const { recordGeneration, bumpDailyGen, clearHistory } = useAIStore.getState();
    recordGeneration(gen('a'));
    recordGeneration(gen('b'));
    bumpDailyGen();
    const dailyBefore = useAIStore.getState().dailyGen;

    clearHistory();
    expect(useAIStore.getState().history).toEqual([]);
    expect(useAIStore.getState().dailyGen).toEqual(dailyBefore);
    expect(useAIStore.getState().dailyGen.count).toBe(1);
  });
});

describe('reset', () => {
  it('restores DEFAULTS and keeps hydrated true', () => {
    const s = useAIStore.getState();
    s.setHFToken('hf_secret');
    s.setProviderId('huggingface');
    s.recordGeneration(gen('a'));
    s.bumpDailyGen();
    // Mark hydrated so we can prove reset keeps it true.
    useAIStore.setState({ hydrated: true });

    useAIStore.getState().reset();
    const after = useAIStore.getState();
    expect(after.hfToken).toBe(DEFAULTS.hfToken);
    expect(after.providerId).toBe(DEFAULTS.providerId);
    expect(after.hfModelId).toBe(DEFAULTS.hfModelId);
    expect(after.history).toEqual(DEFAULTS.history);
    expect(after.dailyGen).toEqual(DEFAULTS.dailyGen);
    expect(after.hydrated).toBe(true);
  });
});

describe('field setters', () => {
  it('setHFToken trims and stores the token', () => {
    useAIStore.getState().setHFToken('  hf_abc123  ');
    expect(useAIStore.getState().hfToken).toBe('hf_abc123');
  });

  it('setPollToken / setOpenAIToken / setGeminiToken trim and store', () => {
    const s = useAIStore.getState();
    s.setPollToken('  poll_tok  ');
    s.setOpenAIToken('\tsk-openai\n');
    s.setGeminiToken(' gem_key ');
    const after = useAIStore.getState();
    expect(after.pollToken).toBe('poll_tok');
    expect(after.openaiToken).toBe('sk-openai');
    expect(after.geminiToken).toBe('gem_key');
  });

  it('setHFModelId stores the model id verbatim', () => {
    useAIStore.getState().setHFModelId('black-forest-labs/FLUX.1-schnell');
    expect(useAIStore.getState().hfModelId).toBe('black-forest-labs/FLUX.1-schnell');
  });

  it('setProviderId updates the active provider', () => {
    useAIStore.getState().setProviderId('dalle');
    expect(useAIStore.getState().providerId).toBe('dalle');
  });
});
