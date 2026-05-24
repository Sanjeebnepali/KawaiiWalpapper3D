// ─── Helpers ─────────────────────────────────────────────────────────────

export function formatDistance(m: number | null): string {
  if (m == null) return '— m';
  if (m < 50) return `${Math.round(m)} m`;
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  if (m < 10000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000)} km`;
}
export function formatRelative(ms: number): string {
  if (ms < 30_000) return 'just now';
  if (ms < 60_000) return 'seconds ago';
  if (ms < 60 * 60_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 24 * 60 * 60_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}
