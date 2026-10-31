/**
 * Shorten a cashaddr for tight spaces: drop the "bitcoincash:" prefix, keep the first `head` and the last
 * `tail` characters (the end is what people compare by eye). Short values come back unchanged.
 */
export function truncateMiddle(value: string, head = 8, tail = 8): string {
  const i = value.indexOf(':');
  const body = i === -1 ? value : value.slice(i + 1);
  if (body.length <= head + tail + 1) return body;
  return `${body.slice(0, head)}…${body.slice(-tail)}`;
}
