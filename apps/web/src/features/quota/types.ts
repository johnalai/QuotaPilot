/** Quota plan components (domain-model §1.5). Money = integer minor units. */
export type QuotaComponentKey = 'new_business' | 'expansion' | 'renewals' | 'services';

export interface QuotaComponent {
  key: QuotaComponentKey;
  amountMinor: number;
}

/** UI projection of a quota plan (domain-model §1.5). */
export interface QuotaPlan {
  id: string;
  name: string;
  targetAmountMinor: number;
  currency: string;
  components: QuotaComponent[];
}
