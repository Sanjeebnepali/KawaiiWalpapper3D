import { getPhotoById } from '../../constants/mockData';

/**
 * Resolve a custom-pair ID (either a catalog ID or a `file://` /
 * `content://` URI from the user's phone gallery) to a displayable image.
 *
 * Lives at module scope so both the in-picker `CustomSlot` and the main
 * SW card's dual-thumb can share it.
 */
export function resolveCustomImage(id: string | null | undefined): string | null {
  if (!id) return null;
  if (id.startsWith('file://') || id.startsWith('content://')) {
    return id; // gallery URI — use directly
  }
  return getPhotoById(id)?.image ?? null;
}

export function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
}

export function labelForSource(s: string): string {
  switch (s) {
    case 'manual': return 'Manual pick';
    case 'camera': return 'Camera scan';
    case 'background': return 'Background (time + steps)';
    case 'notification': return 'Notification';
    default: return s;
  }
}

export function timeAgo(at: number | null): string {
  if (at == null) return 'never';
  const sec = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  if (m === 60) return `1 hour`;
  if (m % 60 === 0) return `${m / 60} hours`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem}m`;
}

export function nextDailyAt(hour: number): string {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  const isTomorrow =
    next.getDate() !== now.getDate() ||
    next.getMonth() !== now.getMonth() ||
    next.getFullYear() !== now.getFullYear();
  return `${isTomorrow ? 'tomorrow' : 'today'} at ${formatHour(hour)}`;
}
