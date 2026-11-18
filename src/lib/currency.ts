import type { Lang } from '../types';

export type DisplayCurrency = 'BOTH' | 'EGP' | 'SAR';

// Standard approximate conversion baseline when explicit SAR price is not overridden by admin
export const EGP_PER_SAR = 13;

export function estimateSarFromEgp(egpAmount: number): number {
  const numeric = Number(egpAmount || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.max(1, Math.round(numeric / EGP_PER_SAR));
}

export function resolveCoursePrices(
  priceMonthlyEgp: number,
  priceMonthlySar?: number | null
): { egp: number; sar: number; isEstimatedSar: boolean } {
  const egp = Math.max(0, Math.round(Number(priceMonthlyEgp || 0)));
  const explicitSar =
    priceMonthlySar !== null && priceMonthlySar !== undefined && Number(priceMonthlySar) > 0
      ? Math.round(Number(priceMonthlySar))
      : null;
  if (explicitSar !== null) {
    return { egp, sar: explicitSar, isEstimatedSar: false };
  }
  return { egp, sar: estimateSarFromEgp(egp), isEstimatedSar: true };
}

export function formatCoursePriceSummary(
  course: { price_monthly: number; price_monthly_sar?: number | null },
  lang: Lang,
  currency: DisplayCurrency = 'BOTH',
  includeMonthlySuffix = true
): string {
  const { egp, sar } = resolveCoursePrices(course.price_monthly, course.price_monthly_sar);
  const egpLabel = lang === 'ar' ? `${egp} ج.م` : `${egp} EGP`;
  const sarLabel = lang === 'ar' ? `${sar} ر.س` : `${sar} SAR`;
  const perMonth = includeMonthlySuffix ? (lang === 'ar' ? ' / شهرياً' : ' / mo') : '';

  if (currency === 'EGP') return `${egpLabel}${perMonth}`;
  if (currency === 'SAR') return `${sarLabel}${perMonth}`;
  return `${egpLabel} · ${sarLabel}${perMonth}`;
}
