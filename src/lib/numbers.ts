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
  const labels = ['', '1st', '2nd', '3rd', '4th'];
  return labels[rank] ?? `${rank}th`;
}
