// Stack of the open modal overlays (<Dialog>, <Sheet>) — so Escape closes only
// the TOPMOST one (docs/14 §17.2 «вложенный диалог»).
//
// Every open overlay registers a `keydown` listener on `document`; with two of
// them open (e.g. the transfer-request dialog over the vehicle form, or a
// confirm over a km-cell editor) one Escape used to close BOTH — the outer
// form lost its unsaved edits. `stopPropagation` cannot help: the listeners
// share the same target, and the outer one was registered first. Instead each
// overlay pushes a token when it opens and only reacts while it is on top.
//
// Module state is fine: overlays are client-only and there is one document.

const stack: symbol[] = [];

/** Register an overlay that just opened; keep the token for the other calls. */
export function pushOverlay(): symbol {
  const token = Symbol('overlay');
  stack.push(token);
  return token;
}

/** Unregister (on close / unmount). Safe to call twice. */
export function popOverlay(token: symbol): void {
  const i = stack.lastIndexOf(token);
  if (i !== -1) stack.splice(i, 1);
}

/** `true` when no overlay was opened above this one. */
export function isTopOverlay(token: symbol): boolean {
  return stack[stack.length - 1] === token;
}
