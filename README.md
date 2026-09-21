# TopDent - منصة تجارة أدوات طب الأسنان

منصة متخصصة واحترافية لبيع وشراء مستلزمات وأدوات طب الأسنان - تطبيق موبايل متقدم مبني بتقنيات Expo (React Native) و Supabase.

🦷 **TopDent** - Your Professional Dental Equipment Marketplace

## الميزات الرئيسية

### تطبيق العميل
- **المصادقة**: تسجيل دخول وإنشاء حسابات آمنة
- **الصفحة الرئيسية**: عرض البنرات التسويقية، الفئات، المنتجات المميزة، أحدث المنتجات، الأكثر مبيعاً
- **البحث والتصفية**: تصفح الفئات المتخصصة، البحث المتقدم في أدوات طب الأسنان
- **تفاصيل المنتج**: صور متعددة، مواصفات تفصيلية، آراء المستخدمين، منتجات مرتبطة
- **السلة**: إضافة/حذف المنتجات، التحكم في الكميات، تطبيق رموز الخصم
- **الدفع**: اختيار العناوين، طرق الشحن، خيارات الدفع، إتمام الطلب
- **الطلبات**: سجل الطلبات، تتبع الحالة، الجدول الزمني
- **المفضلة**: حفظ المنتجات المفضلة
- **العناوين**: إضافة وتعديل وحذف عناوين الشحن
- **الخصومات**: عرض ونسخ رموز الخصم المتاحة
- **الاستبدالات والمرتجعات**: طلب استبدال أو مرتجعات مع تحديد الأسباب
- **التقييمات**: عرض وإضافة تقييمات المنتجات
- **الإشعارات**: تحديثات الطلبات والإشعارات الترويجية
- **الدعم**: نموذج التواصل، الأسئلة الشائعة، مركز المساعدة
- **الملف الشخصي**: تحرير المعلومات الشخصية

### ميزات متخصصة بطب الأسنان 🦷
- **نظام الشهادات**: عرض شهادات FDA و ISO و CE والشهادات الإقليمية
- **معلومات طبية دقيقة**: مكونات المواد، مدة الصلاحية، متطلبات التخزين
- **توصيات متخصصة**: توصيات بناءً على تخصص العيادة
- **معايير التعقيم**: معلومات كاملة عن تعقيم المنتجات
- **دعم العيادات**: حسابات خاصة بالعيادات مع أسعار الجملة

## الألوان والتصميم

### نظام الألوان المحسّن
- **الأزرق الطبي الأساسي**: #34a8d1 (الأيقونات والأزرار الرئيسية)
- **الأزرق الفاتح**: #c2e9f3 (الخلفيات والعناصر الثانوية)
- **الأبيض**: #ffffff (السطوح والنصوص الرئيسية)
- **الأزرق السماوي**: #0ea5e9 (العناصر التفاعلية)

## Tech Stack

- **Frontend**: Expo (React Native), TypeScript
- **Backend**: Supabase (PostgreSQL, Auth, RLS)
- **Icons**: Lucide React Native
- **Database**: PostgreSQL with specialized dental fields

## المتطلبات الأساسية

- Node.js 22+
- npm أو yarn
- Expo CLI
- Supabase Account

## التثبيت والإعداد

### 1. تثبيت المتطلبات

```bash
npm install
# أو
yarn install
```

### 2. إعداد متغيرات البيئة

انسخ ملف .env.example وأنشئ .env:

```bash
cp .env.example .env
```

ثم ملء البيانات:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
```

### 3. إعداد قاعدة البيانات

قم بتشغيل ملفات SQL:

```bash
# تثبيت Supabase CLI
npm install -g supabase

# تشغيل migrations
supabase db push

# أو استخدم واجهة Supabase لتشغيل الملف:
supabase/migrations/topdent_setup.sql
```

### 4. تشغيل التطبيق محلياً

```bash
# تشغيل على الويب
npm run dev

# تشغيل على الهاتف
npm run android  # لـ Android
npm run ios      # لـ iOS
```

## البناء والنشر

### بناء APK لـ Android

```bash
npm install -g eas-cli
eas build --platform android --profile production
```

### بناء IPA لـ iOS

```bash
eas build --platform ios --profile production
```

### نشر الويب

```bash
npm run build:web
```

## هيكل قاعدة البيانات

### الجداول الرئيسية
- `profiles` - معلومات ملف المستخدم
- `categories` - فئات وأقسام المنتجات
- `products` - كتالوج المنتجات
- `product_variants` - المتغيرات والمخزون
- `product_images` - صور المنتجات
- `product_certifications` - الشهادات الطبية
- `cart_items` - السلة
- `wishlist_items` - المفضلة
- `orders` - الطلبات
- `order_items` - بند الطلب
- `addresses` - عناوين الشحن
- `reviews` - التقييمات
- `coupons` - رموز الخصم
- `banners` - البنرات الترويجية
- `notifications` - الإشعارات
- `return_requests` - طلبات المرتجعات
- `support_tickets` - تذاكر الدعم

### الحقول الخاصة بطب الأسنان
- `sterility_certification` - شهادة التعقيم
- `material_composition` - مكونات المادة
- `shelf_life_months` - مدة الصلاحية
- `storage_requirements` - متطلبات التخزين
- `dental_specialty` - التخصص المخصص له
- `compatibility_info` - معلومات التوافقية
- `is_medical_device` - هل هو جهاز طبي

## الملفات الجديدة المهمة

- `TOPDENT_TRANSFORMATION.md` - دليل التحويل الكامل
- `lib/topdent-categories.json` - فئات وأقسام TopDent
- `supabase/migrations/topdent_setup.sql` - إعدادات قاعدة البيانات
- `lib/theme.ts` - نظام الألوان والتصميم (محدث)

## متطلبات GitHub للنشر

اضبط هذه المتغيرات في إعدادات المستودع:

- `EXPO_PUBLIC_SUPABASE_URL` - رابط Supabase
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - مفتاح Supabase
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID` - معرف Google
- `EXPO_TOKEN` - رمز Expo (من https://expo.dev)

## اختبار التطبيق

### قائمة الفحص الأساسية

- [ ] التحقق من الألوان والتصميم
- [ ] اختبار تسجيل الدخول والخروج
- [ ] اختبار البحث والتصفية
- [ ] اختبار السلة والدفع
- [ ] اختبار الطلبات والتتبع
- [ ] اختبار الإشعارات
- [ ] اختبار الأداء

## الدعم والمساعدة

للمساعدة في المشاكل التقنية:
1. تحقق من ملف `TOPDENT_TRANSFORMATION.md`
2. تحقق من سجلات الأخطاء
3. تواصل مع فريق Supabase للمشاكل المتعلقة بقاعدة البيانات

## الترخيص

MIT License - انظر LICENSE للتفاصيل

---

**TopDent v1.0.0** - تم الإطلاق September 2026
تطبيق متخصص لبيع وشراء أدوات وأجهزة طب الأسنان

## Tech Stack

- **Frontend**: Expo (React Native), TypeScript
- **Backend**: Supabase (PostgreSQL, Auth, RLS)
- **Icons**: Lucide React Native
- **Images**: Pexels stock photos

## Setup

### Prerequisites
- Node.js 20+
- npm or yarn
- Expo CLI

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file in the root directory:

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Running the App

```bash
npm start
```

This starts the Expo dev server. Scan the QR code with the Expo Go app or press `w` for web.

### Building the APK

The GitHub Actions workflow (`.github/workflows/build-apk.yml`) automatically builds an Android APK on push to main/master.

For local builds:
```bash
npm install -g eas-cli
eas build --platform android --profile production
```

## Database Schema

The app uses Supabase with the following tables:
- `profiles` - user profile extensions
- `categories` - product categories
- `products` - product catalog
- `product_variants` - size/color combinations with stock
- `product_images` - product images
- `cart_items` - shopping cart
- `wishlist_items` - saved products
- `orders` - order headers
- `order_items` - order line items
- `addresses` - shipping addresses
- `reviews` - product reviews
- `coupons` - discount codes
- `banners` - home screen banners
- `notifications` - user notifications
- `return_requests` - return/exchange requests
- `support_tickets` - customer support tickets

All tables have Row Level Security (RLS) enabled with appropriate policies.

## GitHub Secrets for APK Build

Set these secrets in your GitHub repository settings:
- `EXPO_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon key
- `EXPO_TOKEN` - Your Expo access token (from https://expo.dev/accounts/[account]/settings/access-tokens)

## License

MIT
