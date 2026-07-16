export function formatDate(value: string | null): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(date)
    : "Date unavailable";
}

export function isoWeekRange(key: string): { from: string; to: string } | null {
  const match = key.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const day = januaryFourth.getUTCDay() || 7;
  const monday = new Date(januaryFourth);
  monday.setUTCDate(januaryFourth.getUTCDate() - day + 1 + (week - 1) * 7);
  const to = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { from: monday.toISOString(), to: to.toISOString() };
}

export function monthRange(yearValue: string, monthValue: string): { from: string; to: string } | null {
  if (!/^\d{4}$/.test(yearValue) || !/^\d{2}$/.test(monthValue)) return null;
  const year = Number(yearValue); const month = Number(monthValue);
  if (month < 1 || month > 12) return null;
  return {
    from: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
    to: new Date(Date.UTC(year, month, 1)).toISOString()
  };
}

export function currentIsoWeekKey(date = new Date()): string {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((value.getTime() - start.getTime()) / 86_400_000) + 1) / 7);
  return `${value.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
