/**
 * طبقة الذكاء الاصطناعي (Groq).
 *
 * - مفتاح الـ API يُحفظ في قاعدة البيانات (جدول `ai_settings`) ويُدار من
 *   لوحة تحكم الأدمن ← الإعدادات ← مساعد الذكاء الاصطناعي.
 * - المفتاح لا يصل إلى المتصفح/التطبيق إطلاقاً: كل الطلبات تمرّ عبر
 *   Edge Function باسم `ai-chat` التي تقرأ المفتاح بصلاحية الخدمة.
 */
import { supabase } from '@/lib/supabase';

const FUNCTIONS_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export type AIPublicConfig = {
  is_enabled: boolean;
  model: string;
  welcome_text: string | null;
  has_key: boolean;
};

export type AIAdminSettings = AIPublicConfig & {
  system_prompt: string | null;
  key_hint: string | null;
};

export type AIMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export const AI_MODELS = [
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B (الأذكى — موصى به)' },
  { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B (الأسرع)' },
  { id: 'qwen/qwen3.6-27b', label: 'Qwen 3.6 27B' },
];

export const DEFAULT_AI_CONFIG: AIPublicConfig = {
  is_enabled: false,
  model: 'openai/gpt-oss-120b',
  welcome_text: null,
  has_key: false,
};

/** الإعدادات العامة (بدون المفتاح) — يقرأها أي مستخدم. */
export async function fetchAIPublicConfig(): Promise<AIPublicConfig> {
  try {
    const { data, error } = await supabase.rpc('get_ai_public_config');
    if (error) throw error;
    const raw = (data ?? {}) as Partial<AIPublicConfig>;
    return {
      is_enabled: !!raw.is_enabled,
      model: raw.model || DEFAULT_AI_CONFIG.model,
      welcome_text: raw.welcome_text ?? null,
      has_key: !!raw.has_key,
    };
  } catch {
    return { ...DEFAULT_AI_CONFIG };
  }
}

/** إعدادات الأدمن الكاملة (المفتاح مخفي جزئياً). */
export async function fetchAIAdminSettings(): Promise<AIAdminSettings> {
  const { data, error } = await supabase.rpc('get_ai_admin_settings');
  if (error) throw error;
  const raw = (data ?? {}) as Partial<AIAdminSettings>;
  return {
    is_enabled: !!raw.is_enabled,
    model: raw.model || DEFAULT_AI_CONFIG.model,
    welcome_text: raw.welcome_text ?? null,
    system_prompt: raw.system_prompt ?? null,
    has_key: !!raw.has_key,
    key_hint: raw.key_hint ?? null,
  };
}

/** حفظ الإعدادات (أدمن فقط). ترك `api_key` فارغاً يبقي المفتاح الحالي كما هو. */
export async function saveAISettings(patch: {
  is_enabled?: boolean;
  api_key?: string;
  model?: string;
  system_prompt?: string;
  welcome_text?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('update_ai_settings', { p_settings: patch });
  if (error) throw error;
}

/**
 * إرسال محادثة إلى المساعد الذكي.
 * ترجع نص الرد. ترمي خطأً واضحاً بالعربية عند الفشل.
 */
export async function sendAIChat(messages: AIMessage[]): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || ANON_KEY;

  const response = await fetch(`${FUNCTIONS_BASE}/ai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages: messages.slice(-20) }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'تعذّر الوصول إلى المساعد الذكي حالياً.');
  }
  const reply = String(payload?.reply || '').trim();
  if (!reply) throw new Error('لم يصل رد من المساعد الذكي، حاول مرة أخرى.');
  return reply;
}
