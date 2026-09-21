/**
 * الإعدادات العامة للتطبيق (يديرها الأدمن من: لوحة التحكم ← إعدادات عامة).
 *
 * تُقرأ عبر الدالة الآمنة `get_app_settings()` وتُحدَّث عبر
 * `update_app_settings(jsonb)` — التي ترفض أي مستخدم غير أدمن.
 *
 * كل المبالغ في هذا الكائن بالليرة السورية (ل.س) — لا يوجد أي دولار
 * أو سعر صرف في التطبيق.
 */
import { supabase } from '@/lib/supabase';

export type AppSettings = {
  /** نسبة الدفعة المقدمة المطلوبة من المحفظة عند الطلب (%) */
  upfront_percentage: number;
  /** نسبة عمولة الأفلييت (%) */
  affiliate_percentage: number;
  /** نسبة أرباح التاجر (%) */
  merchant_percentage: number;
  /** كلفة الشحن الثابتة (ل.س) */
  shipping_flat_cost: number;
  /** نسبة الضريبة (%) */
  tax_rate: number;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  upfront_percentage: 25,
  affiliate_percentage: 10,
  merchant_percentage: 75,
  shipping_flat_cost: 5000,
  tax_rate: 8,
};

export const SETTINGS_LABELS: Record<keyof AppSettings, { label: string; hint: string; suffix: string }> = {
  upfront_percentage: {
    label: 'نسبة الدفعة المقدمة',
    hint: 'النسبة التي تُخصم فوراً من محفظة الزبون عند تأكيد الطلب.',
    suffix: '%',
  },
  affiliate_percentage: {
    label: 'نسبة عمولة الأفلييت',
    hint: 'النسبة التي يحصل عليها المسوّق من قيمة الأصناف المباعة عبر رابطه.',
    suffix: '%',
  },
  merchant_percentage: {
    label: 'نسبة أرباح التاجر',
    hint: 'النسبة التي تُضاف لرصيد التاجر المعلّق من قيمة الأصناف.',
    suffix: '%',
  },
  shipping_flat_cost: {
    label: 'كلفة الشحن',
    hint: 'كلفة شحن ثابتة بالليرة السورية تُضاف لكل طلب.',
    suffix: 'ل.س',
  },
  tax_rate: {
    label: 'نسبة الضريبة',
    hint: 'تُحتسب على المجموع الفرعي للطلب.',
    suffix: '%',
  },
};

function normalize(raw: Record<string, unknown> | null | undefined): AppSettings {
  const out = { ...DEFAULT_APP_SETTINGS };
  if (raw) {
    (Object.keys(DEFAULT_APP_SETTINGS) as (keyof AppSettings)[]).forEach(key => {
      const value = Number(raw[key]);
      if (Number.isFinite(value) && value >= 0) out[key] = value;
    });
  }
  return out;
}

/** قراءة الإعدادات — ترجع القيم الافتراضية عند أي خطأ حتى لا تتعطّل الواجهة. */
export async function fetchAppSettings(): Promise<AppSettings> {
  try {
    const { data, error } = await supabase.rpc('get_app_settings');
    if (error) throw error;
    return normalize(data as Record<string, unknown>);
  } catch (e) {
    console.warn('[settings] fallback to defaults', e);
    return { ...DEFAULT_APP_SETTINGS };
  }
}

/** تحديث الإعدادات (أدمن فقط) — يرمي خطأً واضحاً عند الفشل. */
export async function saveAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const { data, error } = await supabase.rpc('update_app_settings', { p_settings: patch });
  if (error) throw error;
  return normalize(data as Record<string, unknown>);
}
