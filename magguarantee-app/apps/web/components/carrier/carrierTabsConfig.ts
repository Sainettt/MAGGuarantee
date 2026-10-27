// The carrier shell's top-level tabs (docs/14 «Carrier shell»), framework-free
// so the order and the conditional «Dokumenty» tab are unit-testable
// (`carrierTabsConfig.test.ts`). Rendered by <CarrierTabs>.

export interface CarrierTab {
  href: string;
  /** Match `pathname.startsWith(matchPrefix)` for active state. */
  matchPrefix: string;
  emoji: string;
  /** i18n key — `carrier.tabs.*` except `km`, which reuses the `myKm.tab` key. */
  labelKey:
    | 'claims'
    | 'newClaim'
    | 'fleet'
    | 'delegations'
    | 'porozumienie'
    | 'km'
    | 'documents';
}

/** Every carrier gets these, in this order. */
export const CARRIER_TABS: readonly CarrierTab[] = [
  {
    href: '/carrier/claims',
    matchPrefix: '/carrier/claims',
    emoji: '📋',
    labelKey: 'claims',
  },
  {
    href: '/carrier/claims/new',
    matchPrefix: '/carrier/claims/new',
    emoji: '➕',
    labelKey: 'newClaim',
  },
  {
    href: '/carrier/fleet',
    matchPrefix: '/carrier/fleet',
    emoji: '🚛',
    labelKey: 'fleet',
  },
  {
    href: '/carrier/delegations',
    matchPrefix: '/carrier/delegations',
    emoji: '🗺️',
    labelKey: 'delegations',
  },
  // Phase 12 — «Porozumienie» (docs/14 §12.3): the guarantee-obligation home.
  // Sits next to the wyjazd flow it drives. Carries an attention badge counting
  // owed vehicles (violated + dueSoon), hidden when 0.
  {
    href: '/carrier/porozumienie',
    matchPrefix: '/carrier/porozumienie',
    emoji: '🤝',
    labelKey: 'porozumienie',
  },
  // Phase 7.8 — «Przebieg» (docs/14 §7.8): the read-only weekly km tab scoped
  // to the carrier's own vehicles. Label reuses the `myKm.tab` key.
  {
    href: '/carrier/km',
    matchPrefix: '/carrier/km',
    emoji: '📈',
    labelKey: 'km',
  },
];

/**
 * docs/25 B6 / docs/14 B.2 — «Dokumenty», only for a carrier an admin granted
 * `carrier_documents.read` (`carrierDocumentsCarrierId`). LAST, so it never
 * shifts the tabs every carrier has (support instructions count them).
 */
export const DOCUMENTS_TAB: CarrierTab = {
  href: '/carrier/dokumenty',
  matchPrefix: '/carrier/dokumenty',
  emoji: '📁',
  labelKey: 'documents',
};

const WITH_DOCUMENTS: readonly CarrierTab[] = [...CARRIER_TABS, DOCUMENTS_TAB];

/** The tabs to render — `showDocuments` = the viewer may open his company's documents. */
export function carrierTabsFor(showDocuments: boolean): readonly CarrierTab[] {
  return showDocuments ? WITH_DOCUMENTS : CARRIER_TABS;
}
