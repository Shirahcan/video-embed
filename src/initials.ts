/**
 * A person's initials for an avatar: the first letters of their first and last names. A trailing
 * "(Role)" is not part of the name (a seat joins as "Amara Obi (Interpreter)"), and neither is any
 * mark that is not a letter or digit. "?" when nothing is left.
 */
export function initialsOf(name: string): string {
  const words = name
    .replace(/\s*\([^)]*\)\s*$/, '')
    .split(/\s+/)
    .map((w) => w.match(/[\p{L}\p{N}]/u)?.[0] ?? '')
    .filter(Boolean);
  const first = words[0];
  if (first === undefined) return '?';
  const last = words.length > 1 ? words[words.length - 1] ?? '' : '';
  return (first + last).toUpperCase();
}
