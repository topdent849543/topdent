import { View, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Text } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, ShieldCheck } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';

const LAST_UPDATED = '12 أغسطس 2026';
const CONTACT_EMAIL = 'charlegilmore75@gmail.com';

type Section = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

const SECTIONS: Section[] = [
  {
    title: '١. مقدمة',
    paragraphs: [
      'تشرح سياسة الخصوصية هذه كيفية جمعنا لمعلوماتك واستخدامنا لها وحمايتنا لها عند استخدامك لتطبيق وموقع "فارلو" (VARLO) والخدمات المرتبطة به، بما في ذلك التسوّق، حسابات الناشرين (التسويق بالعمولة)، وحسابات التجار.',
      'باستخدامك للتطبيق أو الموقع، فإنك توافق على جمع بياناتك واستخدامها وفق ما هو موضّح في هذه السياسة. إذا كنت لا توافق على أي جزء منها، فيُرجى التوقف عن استخدام الخدمة.',
    ],
  },
  {
    title: '٢. المعلومات التي نقوم بجمعها',
    bullets: [
      'معلومات الحساب: الاسم الكامل، البريد الإلكتروني، كلمة المرور (مخزّنة بشكل مشفّر)، ورقم الهاتف عند توفيره.',
      'معلومات تسجيل الدخول عبر جوجل: عند استخدامك "تسجيل الدخول عبر جوجل"، نحصل على اسمك وبريدك الإلكتروني وصورتك الشخصية من حساب جوجل الخاص بك.',
      'معلومات الطلبات والشحن: عنوان التوصيل، رقم الهاتف، ومحتويات سلة التسوّق وسجل الطلبات.',
      'معلومات الدفع: تفاصيل عمليات الدفع التي تتم عبر شام كاش، سيريتيل كاش، أو التحويل البنكي (رقم العملية، اسم المرسل، والمبلغ). نحن لا نجمع أو نخزّن أرقام البطاقات المصرفية الكاملة على خوادمنا.',
      'الصور ومقاطع الفيديو: التي يقوم التجار برفعها لعرض منتجاتهم عبر مزوّد الاستضافة السحابية Cloudinary.',
      'بيانات الاستخدام: المنتجات التي تتصفحها أو تضيفها إلى المفضلة، سجل الطلبات، ورابط الإحالة الخاص بالناشر عند وصولك عبره.',
      'بيانات المحفظة والعمولات: أرصدة المحفظة، وطلبات السحب الخاصة بحسابات الناشرين والتجار.',
      'معلومات الجهاز الأساسية: نوع نظام التشغيل وإصدار التطبيق، لأغراض الدعم الفني وتحسين الأداء واستكشاف الأخطاء.',
    ],
  },
  {
    title: '٣. كيف نستخدم معلوماتك',
    bullets: [
      'إنشاء حسابك وإدارته والتحقق من هويتك عند تسجيل الدخول.',
      'معالجة طلباتك ومدفوعاتك وتنسيق عمليات الشحن والتوصيل مع التاجر أو فرع الشحن المختص.',
      'التواصل معك بخصوص حالة طلبك، أو الدعم الفني، أو التحديثات الهامة المتعلقة بالخدمة.',
      'احتساب عمولات الإحالة الخاصة بحسابات الناشرين ومعالجة طلبات سحب الأرباح.',
      'تحسين أداء التطبيق وتجربة الاستخدام، واكتشاف الأنشطة الاحتيالية أو المخالفة لشروط الاستخدام ومنعها.',
      'إرسال إشعارات متعلقة بالطلبات أو المحفظة أو العروض، والتي يمكنك التحكم بها من إعدادات الحساب.',
    ],
  },
  {
    title: '٤. مشاركة المعلومات مع أطراف ثالثة',
    paragraphs: [
      'نحن لا نبيع بياناتك الشخصية لأي طرف ثالث لأغراض تسويقية. تتم مشاركة بياناتك فقط في الحالات التالية:',
    ],
    bullets: [
      'مزوّدو الخدمات التقنية: نستخدم Supabase لاستضافة قاعدة البيانات ونظام تسجيل الدخول، وCloudinary لاستضافة الصور ومقاطع الفيديو، وGoogle لخدمة تسجيل الدخول عبر حساب جوجل.',
      'التجار على المنصة: تتم مشاركة البيانات الضرورية لتنفيذ طلبك فقط (الاسم، العنوان، رقم الهاتف، ومحتوى الطلب) مع التاجر المعني بتجهيز الطلب.',
      'الجهات القانونية: قد نكشف عن معلوماتك إذا اقتضى ذلك القانون، أو للدفاع عن حقوقنا، أو لحماية سلامة المستخدمين.',
    ],
  },
  {
    title: '٥. أمان البيانات',
    paragraphs: [
      'نعتمد إجراءات تقنية وتنظيمية معقولة لحماية بياناتك، منها تشفير كلمات المرور وتأمين الاتصال بين التطبيق وخوادمنا عبر بروتوكول HTTPS، إضافة إلى تقييد صلاحيات الوصول إلى البيانات على فريق العمل المخوّل فقط.',
      'مع ذلك، لا توجد وسيلة نقل أو تخزين إلكتروني آمنة بنسبة 100%، ونعمل باستمرار على تطوير إجراءات الحماية لدينا.',
    ],
  },
  {
    title: '٦. الاحتفاظ بالبيانات',
    paragraphs: [
      'نحتفظ ببياناتك طوال مدة نشاط حسابك، وللمدة اللازمة لتحقيق الأغراض الموضحة في هذه السياسة، أو للامتثال لالتزامات محاسبية أو قانونية. عند حذف حسابك، نقوم بحذف أو إخفاء هويّة بياناتك الشخصية خلال فترة زمنية معقولة، باستثناء ما يلزم الاحتفاظ به لأغراض قانونية.',
    ],
  },
  {
    title: '٧. حقوقك',
    bullets: [
      'الوصول إلى بياناتك الشخصية المخزّنة لدينا والاطلاع عليها.',
      'تعديل أو تصحيح بياناتك من خلال صفحة "حسابي".',
      'طلب حذف حسابك وبياناتك الشخصية.',
      'سحب موافقتك على تسجيل الدخول عبر جوجل في أي وقت من إعدادات حسابك في جوجل.',
    ],
    paragraphs: [
      'يمكنك ممارسة هذه الحقوق بالتواصل معنا عبر البريد الإلكتروني الموضّح في نهاية هذه الصفحة.',
    ],
  },
  {
    title: '٨. خصوصية الأطفال',
    paragraphs: [
      'خدماتنا غير موجهة للأطفال دون سن 16 عامًا، ولا نقوم عن قصد بجمع بيانات شخصية من قاصرين. إذا تبيّن لنا أننا جمعنا بيانات من طفل دون هذا السن دون موافقة ولي الأمر، سنقوم بحذفها فور علمنا بذلك.',
    ],
  },
  {
    title: '٩. التخزين المحلي على الجهاز',
    paragraphs: [
      'يستخدم التطبيق التخزين المحلي على جهازك لحفظ حالة تسجيل الدخول وبعض التفضيلات (مثل رابط الإحالة) لتحسين تجربة الاستخدام. عند استخدام النسخة الإلكترونية عبر المتصفح، قد تُستخدم تقنيات مشابهة (تخزين محلي) لنفس الغرض.',
    ],
  },
  {
    title: '١٠. التغييرات على هذه السياسة',
    paragraphs: [
      'قد نقوم بتحديث سياسة الخصوصية هذه من وقت لآخر. سيتم نشر أي تعديلات على هذه الصفحة مع تحديث تاريخ "آخر تحديث" أعلاه. استمرارك في استخدام الخدمة بعد نشر التعديلات يُعد موافقة منك عليها.',
    ],
  },
  {
    title: '١١. تواصل معنا',
    paragraphs: [
      `لأي استفسار متعلق بهذه السياسة أو ببياناتك الشخصية، يمكنك التواصل معنا عبر البريد الإلكتروني: ${CONTACT_EMAIL}`,
    ],
  },
];

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>سياسة الخصوصية</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <ShieldCheck size={32} color={colors.primary[600]} />
          </View>
          <Text style={styles.introTitle}>خصوصيتك تهمّنا</Text>
          <Text style={styles.introText}>
            نلتزم بحماية بياناتك الشخصية والتعامل معها بشفافية ومسؤولية.
          </Text>
          <Text style={styles.updatedText}>آخر تحديث: {LAST_UPDATED}</Text>
        </View>

        {SECTIONS.map((section, idx) => (
          <View key={idx} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.paragraphs?.map((p, i) => (
              <Text key={`p-${i}`} style={styles.paragraph}>{p}</Text>
            ))}
            {section.bullets?.map((b, i) => (
              <View key={`b-${i}`} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{b}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  introCard: {
    margin: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.primary[50],
    borderRadius: radius.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  introIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  introTitle: {
    ...typography.h4,
    color: colors.text,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  introText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 22,
  },
  updatedText: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    writingDirection: 'rtl',
  },
  section: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h4,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  paragraph: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 24,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: spacing.sm,
  },
  bulletRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  bulletDot: {
    ...typography.bodySmall,
    color: colors.primary[600],
    fontWeight: '700',
    lineHeight: 24,
  },
  bulletText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 24,
    textAlign: 'right',
    writingDirection: 'rtl',
    flex: 1,
  },
});
