function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Returns the player's local calendar date as YYYY-MM-DD (local timezone).
 */
export function localDateYYYYMMDD(d = new Date()): string {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}


