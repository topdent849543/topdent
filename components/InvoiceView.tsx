import { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Image } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Download, ShieldCheck, Share as ShareIcon } from 'lucide-react-native';
import { Share } from 'react-native';
import { colors, spacing, radius } from '@/lib/theme';
import { ArabicText as Text } from '@/components/ArabicText';
import {
  type Invoice,
  buildInvoiceUrl,
  formatDateTime,
  money,
  statusLabel,
} from '@/lib/invoice';
import { downloadInvoicePdf } from '@/lib/invoicePdf';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function InvoiceView({ invoice }: { invoice: Invoice }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const isOrder = invoice.kind === 'order';
  const t = invoice.totals ?? { total: 0 };

  useEffect(() => {
    setUrl(buildInvoiceUrl(invoice.token));
  }, [invoice.token]);

  const shipping = (invoice.shipping ?? {}) as Record<string, string | undefined>;
  const shippingLine = [
    shipping.governorate,
    shipping.branch_name,
    shipping.branch_address,
  ]
    .filter(Boolean)
    .join(' — ');

  const paidAmount = Number(t.paid ?? t.upfront ?? 0);
  const remainingAmount = Number(t.remaining ?? 0);
  const upfrontPct = Number(t.upfront_percentage ?? 0);
  const paidLabel = upfrontPct > 0 ? `المبلغ المدفوع (${upfrontPct}%)` : 'المبلغ المدفوع';

  const handleDownload = async () => {
    setBusy(true);
    try {
      await downloadInvoicePdf(invoice);
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: url || buildInvoiceUrl(invoice.token) });
    } catch {
      /* user cancelled */
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.sheet}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brand}>
            <Image source={require('@/assets/images/varlo-logo.png')} style={styles.logo} />
            <View>
              <Text style={styles.brandName}>VARLO</Text>
              <Text style={styles.brandTag}>ONLINE MARKETPLACE</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-start' }}>
            <Text style={styles.docTitle}>{isOrder ? 'INVOICE' : 'PAYOUT'}</Text>
            <Text style={styles.docNumber}>{invoice.invoice_number ?? invoice.reference ?? '—'}</Text>
            <Text style={styles.docDate}>{formatDateTime(invoice.issued_at)}</Text>
          </View>
        </View>

        {/* Verified strip */}
        <View style={styles.verified}>
          <ShieldCheck size={16} color={colors.success[600]} />
          <Text style={styles.verifiedText}>فاتورة موثّقة إلكترونياً</Text>
        </View>

        {/* QR */}
        <View style={styles.qrCard}>
          {url ? (
            <QRCode value={url} size={168} backgroundColor="#ffffff" color="#0a0a0a" ecl="H" />
          ) : (
            <ActivityIndicator color={colors.primary[600]} />
          )}
          <Text style={styles.qrHint}>امسح الرمز لفتح صفحة الفاتورة</Text>
          <Text style={styles.qrToken}>{invoice.token}</Text>
        </View>

        {/* Meta */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{isOrder ? 'بيانات الزبون' : 'بيانات المستفيد'}</Text>
          <Row label="الاسم" value={(isOrder ? invoice.customer?.name : invoice.party?.name) ?? '—'} />
          {isOrder ? (
            <Row label="الهاتف" value={invoice.customer?.phone ?? '—'} />
          ) : (
            <Row label="معلومات الدفع" value={invoice.payment_info ?? '—'} />
          )}
          {isOrder && !!shipping.governorate && <Row label="المحافظة" value={String(shipping.governorate)} />}
          {isOrder && !!shipping.branch_name && <Row label="فرع الشحن" value={String(shipping.branch_name)} />}
          {isOrder && !!shipping.branch_address && <Row label="عنوان الفرع" value={String(shipping.branch_address)} />}
          {isOrder && !!shipping.branch_phone && <Row label="هاتف الفرع" value={String(shipping.branch_phone)} />}
          {isOrder && !shipping.branch_name && !!shippingLine && <Row label="الاستلام" value={shippingLine} />}
          {isOrder && !!invoice.payment_method && <Row label="طريقة الدفع" value={invoice.payment_method === 'wallet' ? 'المحفظة' : String(invoice.payment_method)} />}
          <Row label="الحالة" value={statusLabel(invoice.status)} />
          {!!invoice.payment_status && <Row label="الدفع" value={statusLabel(invoice.payment_status)} />}
          {!!invoice.reference && <Row label="المرجع" value={invoice.reference} />}
          {!!invoice.tracking_number && <Row label="رقم التتبع" value={invoice.tracking_number} />}
          {!isOrder && <Row label="تاريخ المعالجة" value={formatDateTime(invoice.processed_at ?? null)} />}
        </View>

        {/* Items */}
        {isOrder && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>الأصناف</Text>
            {(invoice.items ?? []).map((item, index) => (
              <View key={`${item.name}-${index}`} style={styles.item}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  {!!(item.size || item.color) && (
                    <Text style={styles.itemMeta}>
                      {[item.size ? `المقاس: ${item.size}` : '', item.color ? `اللون: ${item.color}` : '']
                        .filter(Boolean)
                        .join(' • ')}
                    </Text>
                  )}
                  <Text style={styles.itemMeta}>
                    {item.quantity} × {money(item.unit_price)}
                  </Text>
                </View>
                <Text style={styles.itemTotal}>{money(item.subtotal)}</Text>
              </View>
            ))}
            {(invoice.items ?? []).length === 0 && <Text style={styles.itemMeta}>لا توجد أصناف</Text>}
          </View>
        )}

        {/* Totals */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>الحساب</Text>
          {isOrder && (
            <>
              <Row label="المجموع الفرعي" value={money(t.subtotal)} />
              <Row label="الشحن" value={money(t.shipping_cost)} />
              <Row label="الضريبة" value={money(t.tax)} />
              {Number(t.discount ?? 0) > 0 && <Row label="الخصم" value={`- ${money(t.discount)}`} />}
            </>
          )}
          <View style={styles.grand}>
            <Text style={styles.grandLabel}>{isOrder ? 'الإجمالي' : 'مبلغ السحب'}</Text>
            <Text style={styles.grandValue}>{money(t.total ?? t.amount)}</Text>
          </View>
          {isOrder && (paidAmount > 0 || remainingAmount > 0) && (
            <>
              <View style={styles.paidBox}>
                <Text style={styles.paidLabel}>{`تم دفع مبلغ ${money(paidAmount)}`}</Text>
                <Text style={styles.dueLabel}>{`المتبقي ${money(remainingAmount)} يُدفع عند الاستلام`}</Text>
              </View>
              <Row label={paidLabel} value={money(paidAmount)} />
              <Row label="المتبقي عند الاستلام" value={money(remainingAmount)} />
            </>
          )}
        </View>

        {/* Opaque party reference */}
        <View style={styles.refBox}>
          <Text style={styles.refQ}>؟؟؟ =</Text>
          <Text style={styles.refValue}>{invoice.party_ref ?? '—'}</Text>
        </View>

        {!!invoice.notes && <Text style={styles.notes}>{invoice.notes}</Text>}
        {!!invoice.admin_notes && <Text style={styles.notes}>{invoice.admin_notes}</Text>}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleDownload} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Download size={18} color="#ffffff" />
                <Text style={styles.primaryBtnText}>تحميل PDF</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleShare}>
            <ShareIcon size={18} color={colors.primary[600]} />
            <Text style={styles.secondaryBtnText}>مشاركة الرابط</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          هذه فاتورة إلكترونية صادرة تلقائياً ولا تحتاج إلى توقيع.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.md, paddingBottom: spacing.xxl, alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: colors.neutral[0],
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: colors.neutral[900],
    paddingBottom: spacing.md,
  },
  brand: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  logo: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: colors.neutral[950],
    resizeMode: 'cover',
  },
  brandName: { fontSize: 20, fontWeight: '800', letterSpacing: 2, color: colors.neutral[900] },
  brandTag: { fontSize: 10, letterSpacing: 1, color: colors.neutral[500] },
  docTitle: { fontSize: 16, fontWeight: '800', letterSpacing: 3, color: colors.neutral[900] },
  docNumber: {
    fontSize: 12, fontWeight: '700', color: colors.neutral[800], marginTop: 2,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  docDate: { fontSize: 11, color: colors.neutral[500], marginTop: 2 },
  verified: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    backgroundColor: colors.success[50], borderRadius: radius.md,
    paddingVertical: 8, paddingHorizontal: 12, marginTop: spacing.md,
  },
  verifiedText: { color: colors.success[700], fontSize: 12, fontWeight: '700' },
  qrCard: {
    alignItems: 'center', marginTop: spacing.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.lg,
    backgroundColor: colors.neutral[0],
  },
  qrHint: { marginTop: 10, fontSize: 12, fontWeight: '700', color: colors.neutral[800] },
  qrToken: {
    marginTop: 4, fontSize: 9, color: colors.neutral[400],
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  card: {
    marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.neutral[50],
  },
  cardTitle: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1,
    color: colors.neutral[500], marginBottom: spacing.sm, textAlign: 'right',
  },
  row: { flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 10, paddingVertical: 3 },
  rowLabel: { color: colors.neutral[600], fontSize: 12 },
  rowValue: { color: colors.neutral[900], fontSize: 12, fontWeight: '700', flexShrink: 1, textAlign: 'left' },
  item: {
    flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.neutral[200],
  },
  itemName: { fontSize: 13, fontWeight: '700', color: colors.neutral[900], textAlign: 'right' },
  itemMeta: { fontSize: 11, color: colors.neutral[500], marginTop: 2, textAlign: 'right' },
  itemTotal: { fontSize: 13, fontWeight: '800', color: colors.neutral[900] },
  grand: {
    flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.neutral[950], borderRadius: radius.md,
    paddingVertical: 10, paddingHorizontal: 14, marginVertical: spacing.sm,
  },
  grandLabel: { color: colors.neutral[0], fontSize: 13, fontWeight: '700' },
  grandValue: { color: '#d4af37', fontSize: 17, fontWeight: '900' },
  paidBox: {
    backgroundColor: colors.success[50], borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginVertical: spacing.sm,
  },
  paidLabel: { color: colors.success[700], fontWeight: '700', fontSize: 14 },
  dueLabel: { color: colors.warning[700], fontWeight: '600', fontSize: 12, marginTop: 2 },
  refBox: {
    marginTop: spacing.md, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: colors.neutral[900], borderRadius: radius.lg,
    paddingVertical: 12, paddingHorizontal: 16,
    flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center',
  },
  refQ: { fontSize: 20, fontWeight: '900', letterSpacing: 3, color: colors.neutral[900] },
  refValue: {
    fontSize: 14, fontWeight: '800', color: colors.neutral[900],
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  notes: {
    marginTop: spacing.sm, fontSize: 11, color: colors.neutral[600],
    borderRightWidth: 3, borderRightColor: colors.neutral[200], paddingRight: 8, textAlign: 'right',
  },
  actions: { flexDirection: 'row-reverse', gap: spacing.sm, marginTop: spacing.lg },
  primaryBtn: {
    flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.neutral[950], borderRadius: radius.md, paddingVertical: 14,
  },
  primaryBtnText: { color: colors.neutral[0], fontSize: 14, fontWeight: '800' },
  secondaryBtn: {
    flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: colors.neutral[300], borderRadius: radius.md, paddingVertical: 14,
  },
  secondaryBtnText: { color: colors.primary[600], fontSize: 14, fontWeight: '800' },
  footer: {
    marginTop: spacing.lg, textAlign: 'center', fontSize: 10, color: colors.neutral[400],
  },
});
