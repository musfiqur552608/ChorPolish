const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function localizeNumber(value: number | string, language: string): string {
  const text = String(value);
  if (language !== 'bn') return text;
  return text.replace(/\d/g, (digit) => BENGALI_DIGITS[Number(digit)] ?? digit);
}

export function ordinalPlace(rank: number, language: string): string {
  if (language === 'bn') {
    const labels = ['', 'প্রথম', 'দ্বিতীয়', 'তৃতীয়', 'চতুর্থ'];
    return labels[rank] ?? `${localizeNumber(rank, language)}তম`;
  }
  const absolute = Math.abs(Math.trunc(rank));
  const mod100 = absolute % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`;
  switch (absolute % 10) {
    case 1:
      return `${rank}st`;
    case 2:
      return `${rank}nd`;
    case 3:
      return `${rank}rd`;
    default:
      return `${rank}th`;
  }
}
