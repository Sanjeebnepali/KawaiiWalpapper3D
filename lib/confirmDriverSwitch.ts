/**
 * Confirm-before-switch for the mutually-exclusive automation drivers.
 *
 * The app runs ONE continuous wallpaper driver at a time — Theme shuffle /
 * Mood-based / Friend check-in (see `lib/automationMode.ts`). Enabling one
 * pauses the others. That trade-off used to be surfaced only by a transient
 * toast AFTER the switch, so a user who turned on Friend check-in or Mood-based
 * never registered that their Theme shuffle had been silently stopped — it read
 * as "shuffle is broken, it stopped changing the wallpaper" (the reported bug,
 * changes/189).
 *
 * This shows an explicit confirmation dialog BEFORE the switch whenever
 * something would actually be paused, and runs `onConfirm` only if the user
 * agrees. When nothing else is running it skips the dialog and runs `onConfirm`
 * immediately, so the common (first-feature) case stays a single tap.
 */
import { otherActiveDriverLabels, type DriverId } from './automationMode';
import { premiumAlert } from '../components/PremiumAlert';

export function confirmDriverSwitch(opts: {
  /** The driver the user is turning ON (the one to KEEP). */
  keep: DriverId;
  /** Human label of the feature being enabled — used in the dialog title. */
  enablingLabel: string;
  /** Runs when there's nothing to pause, or after the user confirms. */
  onConfirm: () => void;
}): void {
  const paused = otherActiveDriverLabels(opts.keep);
  if (paused.length === 0) {
    // Nothing else is driving the wallpaper — no trade-off to confirm.
    opts.onConfirm();
    return;
  }
  premiumAlert({
    title: `Turn on ${opts.enablingLabel}?`,
    message:
      `Only one background mode runs at a time, so this will pause ` +
      `${paused.join(' + ')}. You can switch back anytime.`,
    icon: 'swap-horizontal-outline',
    buttons: [
      { label: 'Cancel', style: 'default' },
      { label: 'Turn on', style: 'primary', onPress: opts.onConfirm },
    ],
  });
}
