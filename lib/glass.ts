/**
 * iOS-style depth hierarchy — use sparingly.
 *
 * glass-nav      → sticky Navbar / BottomNav only
 * glass-panel    → primary cards & sheets (one per surface)
 * glass-control  → floating controls over map/content (FABs, search field, tab shell)
 * glass-subtle   → nested inset cells on a panel (NO blur — solid muted fill)
 *
 * Badges, body text, map canvas, and most buttons stay solid/clear.
 */
export const glass = {
  nav: 'glass-nav',
  panel: 'glass-panel',
  control: 'glass-control',
  subtle: 'glass-subtle',
  interactive: 'glass-interactive',
} as const;

export type GlassLevel = keyof typeof glass;
