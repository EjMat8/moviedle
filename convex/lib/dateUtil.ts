// Pure date helpers. All dates are UTC YYYY-MM-DD strings to match the schema.

export function todayUtcDate(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function addDaysUtc(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function yesterdayUtc(date: string): string {
  return addDaysUtc(date, -1);
}
