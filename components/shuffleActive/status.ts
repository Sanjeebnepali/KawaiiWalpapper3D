import { Platform } from 'react-native';
import { useShuffleEngine } from '../../hooks/useShuffleEngine';

export function describeStatus(
  status: ReturnType<typeof useShuffleEngine>['status'],
): { heading: string; body: string } {
  switch (status.kind) {
    case 'idle':
      switch (status.reason) {
        case 'no-active':
          return { heading: 'Idle', body: 'No active collection' };
        case 'empty':
          return { heading: 'Idle', body: 'Add photos to the collection' };
        case 'paused':
          return { heading: 'Paused', body: 'Shuffle is paused' };
        case 'dnd':
          return { heading: 'Quiet hours', body: 'Shuffle resumes after DND window' };
        case 'ios':
          return { heading: 'iOS manual', body: 'Tap to save next wallpaper' };
      }
      // Defensive: TS exhaustiveness — never reached
      return { heading: 'Idle', body: '' };
    case 'applying':
      return { heading: 'Updating', body: Platform.OS === 'ios' ? 'Saving to Photos…' : 'Applying wallpaper…' };
    case 'running': {
      const ms = Math.max(0, status.nextChangeAt - Date.now());
      return { heading: 'Next change in', body: formatCountdown(ms) };
    }
  }
}

function formatCountdown(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}
