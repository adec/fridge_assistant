/* Shelf lives remain whole calendar days in storage. */
export function parseShelfDuration(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const match = /^(\d+)\s*([dw]?)$/i.exec(text);
  if (!match) throw new Error('Invalid duration');
  const days = Number(match[1]) * (match[2].toLowerCase() === 'w' ? 7 : 1);
  if (!Number.isSafeInteger(days) || days > 3650) throw new Error('Invalid duration');
  return days || null;
}

export function formatShelfDuration(days) {
  if (!days) return '';
  return days % 7 === 0 ? `${days / 7}w` : `${days}d`;
}
