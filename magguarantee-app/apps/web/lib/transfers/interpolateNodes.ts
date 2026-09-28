// Put React nodes (e.g. `<time dateTime>`) into a translated sentence while
// keeping the TRANSLATION in charge of the word order.
//
// next-intl values must be primitives, and these messages carry no rich-text
// tags («od {from}», «{from} – {to}»). So the caller translates with MARKER
// strings as the values, and `splitMarked` cuts the result back into literal
// text and placeholder names, in the order the locale put them:
//
//   const text = t('history.range', { from: marker('from'), to: marker('to') });
//   splitMarked(text) → ['', {name:'from'}, ' – ', {name:'to'}, '']
//
// The marker uses a private-use code point that never occurs in real copy.

const MARK = '';

/** The value to pass for `{name}` when the node should be substituted later. */
export function marker(name: string): string {
  return `${MARK}${name}${MARK}`;
}

export type MarkedPart = string | { name: string };

/** Splits a message translated with `marker(...)` values; odd parts are names. */
export function splitMarked(text: string): MarkedPart[] {
  return text
    .split(MARK)
    .map((part, i) => (i % 2 === 1 ? { name: part } : part));
}
