/**
 * دوال تنسيق العملة
 * كل الأسعار في هذا التطبيق مُخزَّنة ومُعروضة بالليرة السورية فقط — لا يوجد أي تحويل عملة.
 */

/**
 * تنسيق مبلغ بالليرة السورية
 */
export function formatSyp(amount: number): string {
  return `${Math.round(Number(amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ل.س`;
}
