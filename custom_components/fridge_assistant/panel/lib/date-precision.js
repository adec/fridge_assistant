/* Calendar arithmetic avoids local timezone and leap-year assumptions. */
export function monthEnd(value) {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match || +match[1] < 1 || +match[2] < 1 || +match[2] > 12) throw new Error('Invalid month');
  const year = +match[1], month = +match[2];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month-1];
  return `${match[1]}-${match[2]}-${days}`;
}
