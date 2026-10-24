export function secondsUntil(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return 0;
  return Math.max(0, Math.ceil((target - now) / 1000));
}

export function clockOffset(serverNow: string | null | undefined): number {
  if (!serverNow) return 0;
  const parsed = new Date(serverNow).getTime();
  return Number.isNaN(parsed) ? 0 : parsed - Date.now();
}

export function formatDate(language: string, date = new Date()): string {
  try {
    return new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

export function relativeMinutes(iso: string | null): number {
  if (!iso) return 99;
  const parsed = new Date(iso).getTime();
  if (Number.isNaN(parsed)) return 99;
  return Math.max(0, Math.floor((Date.now() - parsed) / 60_000));
}
