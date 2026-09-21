import { View, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Text } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, FileText } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@/lib/theme';

const LAST_UPDATED = '12 أغسطس 2026';
const CONTACT_EMAIL = 'charlegilmore75@gmail.com';

type Section = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

const SECTIONS: Section[] = [
  {
    title: '١. القبول بالشروط',
    paragraphs: [
      'تحكم هذه الشروط والأحكام استخدامك لتطبيق وموقع "فارلو" (VARLO) وجميع الخدمات المرتبطة به. من خلال إنشاء حساب أو استخدام التطبيق، فإنك تقرّ بأنك قرأت هذه الشروط وفهمتها ووافقت على الالتزام بها، بالإضافة إلى سياسة الخصوصية الخاصة بنا.',
      'إذا كنت لا توافق على أي بند من هذه الشروط، يُرجى عدم استخدام التطبيق أو الموقع.',
    ],
  },
  {
    title: '٢. إنشاء الحساب وأنواعه',
    paragraphs: [
      'عند التسجيل، تختار نوع الحساب المناسب لك، وتقدّم معلومات دقيقة وحديثة، وأنت المسؤول الوحيد عن الحفاظ على سرية بيانات الدخول الخاصة بحسابك وعن جميع الأنشطة التي تتم من خلاله.',
    ],
    bullets: [
      'حساب شخصي (عميل): للتسوّق وتصفح المنتجات وإتمام الطلبات.',
      'حساب ناشر: للترويج للمنتجات عبر روابط إحالة والحصول على عمولة وفق نظام الإحالة المعتمد.',
      'حساب تاجر: لعرض المنتجات وإدارة المخزون والطلبات (يخضع لموافقة إدارة المنصة).',
    ],
  },
  {
    title: '٣. الطلبات والأسعار والدفع',
    bullets: [
      'تُعرض الأسعار داخل التطبيق بالليرة السورية ما لم يُذكر خلاف ذلك، وقد تتغير من وقت لآخر دون إشعار مسبق قبل تأكيد الطلب.',
      'تشمل طرق الدفع المتاحة: شام كاش، سيريتيل كاش، أو التحويل البنكي، بحسب ما يوفره التاجر المعني.',
      'يُعد الطلب مؤكدًا بعد إتمام الدفع أو تسجيله بنجاح وفق طريقة الدفع المختارة والتحقق منها من قبل التاجر أو إدارة المنصة.',
      'تقع مسؤولية دقة عنوان الشحن ورقم الهاتف المُدخلين على عاتق المستخدم.',
    ],
  },
  {
    title: '٤. الشحن والاستلام',
    paragraphs: [
      'تتم عمليات الشحن والتوصيل بالتنسيق مع التاجر أو فرع الشحن المحدد ضمن المحافظة المختارة عند إتمام الطلب. قد تختلف مدة التوصيل والتكلفة باختلاف المنطقة الجغرافية والتاجر.',
    ],
  },
  {
    title: '٥. الإرجاع والاستبدال',
    paragraphs: [
      'يمكن للمستخدم تقديم طلب إرجاع أو استبدال من خلال صفحة "الإرجاع/الاستبدال" داخل التطبيق، وفق الأسباب والشروط المتاحة هناك. تخضع الموافقة على طلبات الإرجاع لتقييم التاجر أو إدارة المنصة بحسب حالة المنتج وسبب الطلب.',
    ],
  },
  {
    title: '٦. برنامج الناشرين (التسويق بالعمولة)',
    bullets: [
      'يحصل الناشر على عمولة عن الطلبات المؤكدة التي تتم عبر رابط الإحالة الخاص به، وفق النسب والشروط المعتمدة من إدارة المنصة والتي قد تتغير من وقت لآخر.',
      'تُحتسب الأرباح في محفظة الناشر داخل التطبيق، ويمكن طلب سحبها عبر طرق الدفع المتاحة بعد استيفاء الحد الأدنى للسحب إن وُجد.',
      'تحتفظ إدارة المنصة بحق مراجعة أو إلغاء أي عمولة ناتجة عن نشاط مخالف أو مشبوه (مثل الطلبات الوهمية أو محاولات التلاعب بنظام الإحالة).',
    ],
  },
  {
    title: '٧. التزامات التجار',
    bullets: [
      'تقديم معلومات ووصف دقيق للمنتجات المعروضة، بما في ذلك الأسعار والمخزون المتاح.',
      'الالتزام بتجهيز وشحن الطلبات ضمن المدة المعلنة والتعامل بشفافية مع طلبات الإرجاع.',
      'عدم عرض منتجات مخالفة للقانون أو حقوق الملكية الفكرية لأطراف أخرى.',
    ],
  },
  {
    title: '٨. الاستخدام المحظور',
    paragraphs: ['يُمنع على المستخدم القيام بأي مما يلي:'],
    bullets: [
      'انتحال شخصية أي فرد أو جهة، أو تقديم معلومات مضللة عند التسجيل أو الطلب.',
      'محاولة التلاعب بنظام الإحالة أو العمولات أو المحفظة بأي وسيلة احتيالية.',
      'استخدام التطبيق لأي غرض غير قانوني أو ينتهك حقوق الآخرين.',
      'محاولة الوصول غير المصرّح به إلى أنظمة المنصة أو حسابات مستخدمين آخرين.',
    ],
  },
  {
    title: '٩. الملكية الفكرية',
    paragraphs: [
      'جميع العلامات التجارية والشعارات والتصاميم والمحتوى الخاص بالتطبيق مملوكة لـ"فارلو" أو مرخّصة لها، ولا يجوز نسخها أو استخدامها دون إذن كتابي مسبق. تبقى حقوق المحتوى الذي يرفعه التجار (كصور المنتجات) ملكًا لهم، مع منحهم المنصة ترخيصًا لعرضه ضمن التطبيق.',
    ],
  },
  {
    title: '١٠. حدود المسؤولية',
    paragraphs: [
      'تُقدَّم الخدمة "كما هي"، ونعمل جاهدين لضمان دقتها وتوفرها، لكننا لا نضمن خلوها التام من الأخطاء أو الانقطاع. لا تتحمل إدارة المنصة مسؤولية أي أضرار غير مباشرة ناتجة عن استخدام الخدمة، بما يتوافق مع القوانين المعمول بها.',
    ],
  },
  {
    title: '١١. تعليق أو إنهاء الحساب',
    paragraphs: [
      'يحق لإدارة المنصة تعليق أو إنهاء أي حساب يخالف هذه الشروط، أو يُستخدم بشكل احتيالي أو مسيء، وذلك دون إشعار مسبق في حال المخالفات الجسيمة. كما يحق لك طلب حذف حسابك في أي وقت من خلال التواصل معنا.',
    ],
  },
  {
    title: '١٢. التعديلات على الشروط',
    paragraphs: [
      'قد نقوم بتحديث هذه الشروط من وقت لآخر. سيتم نشر أي تعديلات على هذه الصفحة، ويُعد استمرارك في استخدام التطبيق بعد نشر التعديلات موافقة منك عليها.',
    ],
  },
  {
    title: '١٣. القانون الواجب التطبيق',
    paragraphs: [
      'تخضع هذه الشروط وتُفسَّر وفقًا للقوانين المعمول بها، وأي نزاع ينشأ عنها يُسعى لحله وديًا أولًا قبل اللجوء إلى الجهات القضائية المختصة.',
    ],
  },
  {
    title: '١٤. تواصل معنا',
    paragraphs: [
      `لأي استفسار بخصوص هذه الشروط، يمكنك التواصل معنا عبر البريد الإلكتروني: ${CONTACT_EMAIL}`,
    ],
  },
];

export default function TermsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>الشروط والأحكام</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <FileText size={32} color={colors.primary[600]} />
          </View>
          <Text style={styles.introTitle}>شروط استخدام المنصة</Text>
          <Text style={styles.introText}>
            يُرجى قراءة هذه الشروط بعناية قبل استخدام التطبيق.
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
