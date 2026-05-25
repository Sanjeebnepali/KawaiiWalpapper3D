/**
 * Unit tests for the entitlement logic in `lib/billing.ts` (changes/158).
 *
 * Exercised purely through the imperative API + `useSettingsStore.getState()` —
 * no React, no render. The grant / reconcile / purchase functions are
 * independent of the `SUBSCRIPTIONS_ENABLED` switch (they only read/write the
 * persisted flags), so they're asserted directly. `hasEntitlement` IS gated by
 * that switch, so its assertions branch on the shipped value.
 *
 * AsyncStorage is mocked so the settings store's lazy `require` resolves to an
 * in-memory no-op; the store's debounced persist never fires here because the
 * store is never hydrated in the test (set() only schedules a write when
 * `hydrated` is true).
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { SUBSCRIPTIONS_ENABLED } from '../../constants/billing';
import {
  grantCoupleEntitlement,
  hasEntitlement,
  purchasePlans,
  reconcileCoupleEntitlement,
} from '../billing';
import { useSettingsStore } from '../../store/settings';

jest.useFakeTimers();

// Reset the entitlement-relevant slice to "nothing owned" before each test.
beforeEach(() => {
  useSettingsStore.setState({
    allAccess: false,
    entThemePacks: false,
    entMood: false,
    entCollection: false,
    isCouplePremium: false,
    coupleSource: null,
    billingPeriod: 'monthly',
  });
});

afterEach(() => {
  jest.clearAllTimers();
});

const st = () => useSettingsStore.getState();

describe('grantCoupleEntitlement', () => {
  it('grants inherited from a clean slate', () => {
    grantCoupleEntitlement('inherited');
    expect(st().isCouplePremium).toBe(true);
    expect(st().coupleSource).toBe('inherited');
  });

  it('never downgrades a purchase to inherited', () => {
    grantCoupleEntitlement('purchased');
    grantCoupleEntitlement('inherited'); // e.g. buyer later accepts a code
    expect(st().isCouplePremium).toBe(true);
    expect(st().coupleSource).toBe('purchased');
  });

  it('records a direct purchase', () => {
    grantCoupleEntitlement('purchased');
    expect(st().coupleSource).toBe('purchased');
  });
});

describe('reconcileCoupleEntitlement', () => {
  it('re-locks an inherited partner when the pair ends', () => {
    grantCoupleEntitlement('inherited');
    reconcileCoupleEntitlement(false);
    expect(st().isCouplePremium).toBe(false);
    expect(st().coupleSource).toBeNull();
  });

  it('keeps the buyer entitled after unlink', () => {
    grantCoupleEntitlement('purchased');
    reconcileCoupleEntitlement(false);
    expect(st().isCouplePremium).toBe(true);
    expect(st().coupleSource).toBe('purchased');
  });

  it('keeps an All Access holder entitled after unlink', () => {
    useSettingsStore.setState({ allAccess: true });
    grantCoupleEntitlement('inherited');
    reconcileCoupleEntitlement(false);
    expect(st().isCouplePremium).toBe(true);
  });

  it('does nothing while still linked', () => {
    grantCoupleEntitlement('inherited');
    reconcileCoupleEntitlement(true);
    expect(st().isCouplePremium).toBe(true);
    expect(st().coupleSource).toBe('inherited');
  });
});

describe('purchasePlans', () => {
  it('grants a single à la carte area and records the cadence', () => {
    purchasePlans(['mood'], 'yearly');
    expect(st().entMood).toBe(true);
    expect(st().entThemePacks).toBe(false);
    expect(st().billingPeriod).toBe('yearly');
  });

  it('grants the All Access bundle', () => {
    purchasePlans(['allAccess'], 'monthly');
    expect(st().allAccess).toBe(true);
  });

  it('buying couple marks the source purchased (kept on unlink)', () => {
    purchasePlans(['couple'], 'monthly');
    expect(st().isCouplePremium).toBe(true);
    expect(st().coupleSource).toBe('purchased');
    reconcileCoupleEntitlement(false);
    expect(st().isCouplePremium).toBe(true);
  });

  it('grants multiple areas at once', () => {
    purchasePlans(['themePacks', 'collection'], 'monthly');
    expect(st().entThemePacks).toBe(true);
    expect(st().entCollection).toBe(true);
    expect(st().entMood).toBe(false);
  });
});

describe('hasEntitlement', () => {
  it('reflects ownership per area', () => {
    if (!SUBSCRIPTIONS_ENABLED) {
      // Testing-mode bypass: everything is unlocked regardless of flags.
      expect(hasEntitlement('mood')).toBe(true);
      return;
    }
    expect(hasEntitlement('mood')).toBe(false);
    purchasePlans(['mood'], 'monthly');
    expect(hasEntitlement('mood')).toBe(true);
    expect(hasEntitlement('themePacks')).toBe(false);
  });

  it('All Access unlocks every area', () => {
    if (!SUBSCRIPTIONS_ENABLED) return;
    purchasePlans(['allAccess'], 'monthly');
    expect(hasEntitlement('themePacks')).toBe(true);
    expect(hasEntitlement('mood')).toBe(true);
    expect(hasEntitlement('collection')).toBe(true);
    expect(hasEntitlement('couple')).toBe(true);
  });
});
