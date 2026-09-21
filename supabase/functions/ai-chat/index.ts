/**
 * Edge Function: ai-chat
 * ----------------------------------------------------------------------
 * مساعد ذكي (Groq) لمتجر Varlo.
 *
 * - يقرأ مفتاح Groq من جدول `ai_settings` بصلاحية service_role
 *   (المفتاح لا يظهر للزبون إطلاقاً).
 * - يبني سياقاً كاملاً عن المتجر: المنتجات (الاسم/السعر/الفئة/التوفر)،
 *   الفئات، وبنية التطبيق وصفحاته، حتى يعرف المساعد وظيفته بالضبط
 *   ويستطيع مساعدة الزبون في أي مشكلة.
 * - يدعم أسئلة مثل: «بدي منتج بسعر أقل من 50$» أو «وين ألاقي طلباتي؟».
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Groq ألغت (deprecated) هذه الموديلات بتاريخ 17 يونيو 2026. هذا الجدول يحوّل
// أي موديل قديم محفوظ سابقاً بقاعدة البيانات إلى بديل شغّال حالياً تلقائياً،
// حتى لو لم يتم تحديث إعدادات الأدمن يدوياً.
const DEPRECATED_MODEL_FALLBACK: Record<string, string> = {
  'llama-3.1-8b-instant': 'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
  'qwen/qwen3-32b': 'openai/gpt-oss-120b',
  'meta-llama/llama-4-scout-17b-16e-instruct': 'openai/gpt-oss-120b',
};
const DEFAULT_MODEL = 'openai/gpt-oss-120b';

function resolveModel(raw: string | null | undefined): string {
  const model = String(raw ?? '').trim();
  if (!model) return DEFAULT_MODEL;
  return DEPRECATED_MODEL_FALLBACK[model] ?? model;
}

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function restGet(path: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

const APP_KNOWLEDGE = `
أنت «مساعد Varlo الذكي»، المساعد الرسمي لمنصة Varlo للتجارة الإلكترونية الشاملة
(ملابس، إلكترونيات، منزل وأدوات، وغيرها من الأقسام حسب ما يضيفه التجار).

## من أنت ووظيفتك
- أنت مساعد خدمة زبائن ومستشار تسوّق داخل تطبيق/موقع Varlo.
- مهمتك: مساعدة الزبون على إيجاد المنتج المناسب، شرح الأسعار والعروض،
  شرح خطوات الشراء والدفع والشحن، وحلّ أي مشكلة تواجهه داخل المتجر.
- تتكلّم بالعربية بلهجة مهذّبة وواضحة وبسيطة، وتردّ بالإنجليزية إذا سألك الزبون بالإنجليزية.
- إجاباتك قصيرة ومنظّمة ومباشرة، بدون حشو. استخدم نقاط عند تعداد المنتجات.

## بنية المتجر (تعرفها بالكامل)
- الصفحة الرئيسية: تنقسم إلى أقسام رئيسية (مثل ملابس، إلكترونيات، منزل...) يختارها الزبون
  من شريط الأقسام أعلى الصفحة، وكل قسم له تصنيفاته الفرعية ومنتجاته وبنراته الخاصة.
- البحث: البحث عن المنتجات وتصفيتها حسب القسم/التصنيف والسعر.
- صفحة المنتج: صور متعددة للمنتج (صورة رئيسية + باقي الصور)، الألوان والمقاسات
  والتوفر، التقييمات، وزر «تواصل مع التاجر» لفتح محادثة حول المنتج.
- المفضّلة: حفظ المنتجات المفضّلة.
- السلة ثم صفحة الدفع (Checkout): اختيار العنوان أو فرع الشحن، وطريقة الدفع.
- المحفظة: شحن الرصيد عبر طلب دفع يوافق عليه الأدمن. يُخصم من المحفظة
  دفعة مقدّمة عند تأكيد الطلب، والباقي يُدفع عند الاستلام.
- طلباتي: متابعة حالة كل طلب وفاتورته.
- الإشعارات: إشعارات فورية للطلبات والرسائل والدعم.
- الدعم: صفحة «التواصل مع الدعم» لإرسال تذكرة، وصفحة «رسائل الدعم» لمتابعة
  ردود فريق الدعم على التذاكر.
- حسابات خاصة: لوحة التاجر (منتجاته وطلباته ومحفظته)، لوحة الناشر/المسوّق
  (روابط الأفلييت والعمولات)، ولوحة الأدمن.

## قواعد صارمة
- اعتمد فقط على قائمة المنتجات المرفقة أدناه. لا تخترع منتجاً أو سعراً أو مقاساً غير موجود.
- إذا لم يوجد منتج مطابق لطلب الزبون، قل ذلك بوضوح واقترح أقرب البدائل من القائمة.
- إذا كان السؤال عن طلب محدّد أو دفعة أو مشكلة في الحساب، وجّه الزبون للصفحة
  المناسبة، واقترح فتح تذكرة دعم من صفحة «التواصل مع الدعم» إذا لزم الأمر.
- لا تطلب من الزبون أي معلومات حسّاسة (كلمة مرور، بيانات بطاقة).

## عرض المنتجات (مهم جداً)
كل منتج بقائمة "المنتجات المتوفرة حالياً" مذكور معه slug فريد (وأحياناً رابط صورة).
عندما تقترح أو تذكر منتجاً بعينه للزبون، **يجب** أن تُدرج بعد ذكره وسماً خاصاً بهذه الصيغة
بالضبط (بدون أي تعديل على الأقواس)، حتى يظهر للزبون ككرت منتج قابل للضغط داخل التطبيق:

[[PRODUCT:{slug}]]

قواعد استخدام الوسم:
- استخدم slug المنتج تماماً كما ورد بالقائمة (بدون تغيير حروف أو مسافات).
- ضع الوسم مباشرة بعد الجملة التي تذكر المنتج، كل منتج له وسم خاص به بسطر منفصل.
- لا تكتب رابطاً كاملاً (URL) بنفسك ولا تخترع مسارات — فقط استخدم صيغة [[PRODUCT:slug]]
  والتطبيق سيتولى تحويلها إلى بطاقة منتج حقيقية مع صورته وسعره وزر لفتح صفحته.
- لا تكرر وسم نفس المنتج أكثر من مرة بنفس الرد.
- لا تستخدم هذه الصيغة إلا لمنتج موجود فعلاً بالقائمة أدناه.

مثال على رد صحيح:
"بما إنك بتدوّر على شي كاجوال بأقل من 50$، بنصحك بـ:
- تيشيرت أوفرسايز قطن — $28
[[PRODUCT:oversized-cotton-tee]]
- جينز سترينت فيت أزرق غامق — $42
[[PRODUCT:slim-fit-dark-jeans]]
هاد الجينز من أكتر القطع اللي زباين المتجر عم يطلبوها هالفترة."
`.trim();

async function buildStoreContext(): Promise<string> {
  const [products, categories] = await Promise.all([
    restGet(
      'products?select=name,slug,price,compare_at_price,brand,status,is_featured,rating,category:categories(name)&status=eq.active&order=created_at.desc&limit=200'
    ),
    restGet('categories?select=name&is_active=eq.true&order=sort_order.asc&limit=60'),
  ]);

  const productLines = products.map((p: any) => {
    const price = Number(p.price ?? 0).toFixed(2);
    const old =
      p.compare_at_price && Number(p.compare_at_price) > Number(p.price)
        ? ` (بدلاً من $${Number(p.compare_at_price).toFixed(2)})`
        : '';
    const cat = p.category?.name ? ` | الفئة: ${p.category.name}` : '';
    const brand = p.brand ? ` | الماركة: ${p.brand}` : '';
    const featured = p.is_featured ? ' | مميّز' : '';
    return `- ${p.name} — $${price}${old}${cat}${brand}${featured} | slug: ${p.slug}`;
  });

  const catLine = categories.map((c: any) => c.name).filter(Boolean).join('، ');

  return [
    `### الفئات المتوفرة\n${catLine || 'لا توجد فئات مسجّلة حالياً.'}`,
    `### المنتجات المتوفرة حالياً (${productLines.length} منتج)\n${
      productLines.join('\n') || 'لا توجد منتجات متاحة حالياً.'
    }`,
  ].join('\n\n');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ error: 'إعدادات الخادم غير مكتملة.' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];
    if (messages.length === 0) return json({ error: 'لا توجد رسالة لإرسالها.' }, 400);

    const settingsRows = await restGet('ai_settings?select=*&id=eq.true&limit=1');
    const settings = settingsRows[0];

    if (!settings || settings.is_enabled !== true) {
      return json({ error: 'المساعد الذكي غير مُفعّل حالياً.' }, 503);
    }
    const apiKey = String(settings.api_key ?? '').trim();
    if (!apiKey) {
      return json({ error: 'لم يتم ضبط مفتاح الذكاء الاصطناعي بعد.' }, 503);
    }

    const storeContext = await buildStoreContext();
    const extraPrompt = String(settings.system_prompt ?? '').trim();

    const systemPrompt = [
      APP_KNOWLEDGE,
      extraPrompt ? `## تعليمات إضافية من إدارة المتجر\n${extraPrompt}` : '',
      `## بيانات المتجر اللحظية\n${storeContext}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: resolveModel(settings.model),
        temperature: 0.4,
        max_tokens: 900,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
            .filter(m => m && typeof m.content === 'string' && m.content.trim())
            .slice(-20)
            .map(m => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: m.content.slice(0, 4000),
            })),
        ],
      }),
    });

    const groqData = await groqRes.json().catch(() => ({}));

    if (!groqRes.ok) {
      const detail = groqData?.error?.message || `HTTP ${groqRes.status}`;
      const friendly =
        groqRes.status === 401
          ? 'مفتاح الذكاء الاصطناعي غير صالح. يرجى مراجعة الإدارة.'
          : groqRes.status === 429
          ? 'المساعد مشغول حالياً، حاول بعد لحظات.'
          : `تعذّر الحصول على رد: ${detail}`;
      return json({ error: friendly }, 502);
    }

    const reply = groqData?.choices?.[0]?.message?.content ?? '';
    if (!reply) return json({ error: 'لم يصل رد من المساعد الذكي.' }, 502);

    return json({ reply, model: resolveModel(settings.model) });
  } catch (e) {
    return json({ error: (e as Error)?.message || 'خطأ غير متوقع في المساعد الذكي.' }, 500);
  }
});
