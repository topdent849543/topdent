/**
 * Professional A4 invoice document (HTML) + PDF export.
 *
 * Web    : renders the document in a hidden iframe and calls print() so the
 *          user can "Save as PDF" (works in every browser, no native deps).
 * Native : uses expo-print to produce a real PDF file, then expo-sharing.
 */
import { Platform } from 'react-native';
import QRCode from 'qrcode';
import {
  type Invoice,
  buildInvoiceUrl,
  formatDateTime,
  money,
  statusLabel,
} from '@/lib/invoice';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function qrDataUrl(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 320,
      color: { dark: '#0a0a0a', light: '#ffffff' },
    });
  } catch {
    return '';
  }
}

export async function buildInvoiceHtml(invoice: Invoice): Promise<string> {
  const url = buildInvoiceUrl(invoice.token);
  const qr = await qrDataUrl(url);
  const isOrder = invoice.kind === 'order';
  const t = invoice.totals ?? { total: 0 };

  const paidAmount = Number(t.paid ?? t.upfront ?? 0);
  const remainingAmount = Number(t.remaining ?? 0);
  const upfrontPct = Number(t.upfront_percentage ?? 0);

  const shipping = (invoice.shipping ?? {}) as Record<string, string | undefined>;
  const shippingLines = [
    shipping.governorate,
    shipping.branch_name,
    shipping.branch_address,
    shipping.branch_phone,
  ].filter(Boolean) as string[];

  const itemRows = (invoice.items ?? [])
    .map(
      (item, index) => `
      <tr>
        <td class="c">${index + 1}</td>
        <td>
          <div class="pname">${esc(item.name)}</div>
          ${
            item.size || item.color
              ? `<div class="pmeta">${esc(
                  [item.size ? `المقاس: ${item.size}` : '', item.color ? `اللون: ${item.color}` : '']
                    .filter(Boolean)
                    .join(' • ')
                )}</div>`
              : ''
          }
        </td>
        <td class="c">${esc(item.quantity)}</td>
        <td class="c">${esc(money(item.unit_price))}</td>
        <td class="c strong">${esc(money(item.subtotal))}</td>
      </tr>`
    )
    .join('');

  const totalsRows = isOrder
    ? [
        ['المجموع الفرعي', money(t.subtotal)],
        ['الشحن', money(t.shipping_cost)],
        ['الضريبة', money(t.tax)],
        ...(Number(t.discount ?? 0) > 0 ? [['الخصم', `- ${money(t.discount)}`]] : []),
      ]
    : [];

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(invoice.invoice_number ?? 'Invoice')}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", Tahoma, "Noto Naskh Arabic", Arial, sans-serif;
    color: #171717; background: #fff; direction: rtl; -webkit-print-color-adjust: exact;
    print-color-adjust: exact; font-size: 12px; line-height: 1.6;
  }
  .sheet { max-width: 820px; margin: 0 auto; padding: 24px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start;
         border-bottom: 3px solid #0a0a0a; padding-bottom: 18px; }
  .brand { display: flex; gap: 12px; align-items: center; }
  .logo { width: 54px; height: 54px; border-radius: 14px; background: #0a0a0a; color: #d4af37;
          font-size: 26px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
  .bname { font-size: 24px; font-weight: 800; letter-spacing: 2px; }
  .btag { font-size: 11px; color: #737373; letter-spacing: 1px; }
  .doc { text-align: left; direction: ltr; }
  .doct { font-size: 20px; font-weight: 800; letter-spacing: 3px; color: #0a0a0a; }
  .docn { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px;
          font-weight: 700; margin-top: 4px; }
  .docd { font-size: 11px; color: #737373; margin-top: 2px; }
  .badges { display: flex; gap: 8px; margin: 16px 0 4px; flex-wrap: wrap; }
  .badge { border: 1px solid #e5e5e5; background: #fafafa; border-radius: 999px;
           padding: 5px 12px; font-size: 11px; font-weight: 700; }
  .badge.ok { background: #f0fdf4; border-color: #bbf7d0; color: #15803d; }
  .badge.warn { background: #fffbeb; border-color: #fde68a; color: #b45309; }
  .grid { display: flex; gap: 14px; margin-top: 18px; }
  .card { flex: 1; border: 1px solid #e5e5e5; border-radius: 12px; padding: 14px; background: #fafafa; }
  .card h3 { font-size: 10px; letter-spacing: 1.5px; color: #737373; text-transform: uppercase;
             margin-bottom: 8px; font-weight: 800; }
  .row { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; }
  .row .k { color: #525252; }
  .row .v { font-weight: 700; text-align: left; direction: ltr; }
  .qrbox { width: 190px; text-align: center; border: 1px solid #e5e5e5; border-radius: 12px;
           padding: 12px; background: #fff; }
  .qrbox img { width: 150px; height: 150px; display: block; margin: 0 auto 6px; }
  .qrbox .h { font-size: 10px; font-weight: 800; letter-spacing: 1px; color: #0a0a0a; }
  .qrbox .s { font-size: 9px; color: #737373; margin-top: 3px; }
  .tok { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 7.5px;
         color: #a3a3a3; word-break: break-all; margin-top: 6px; direction: ltr; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  thead th { background: #0a0a0a; color: #fff; font-size: 10.5px; letter-spacing: 1px;
             padding: 10px 8px; text-align: right; }
  thead th.c, tbody td.c { text-align: center; }
  tbody td { padding: 10px 8px; border-bottom: 1px solid #ececec; vertical-align: top; }
  tbody tr:nth-child(even) { background: #fbfbfb; }
  .pname { font-weight: 700; }
  .pmeta { font-size: 10px; color: #737373; margin-top: 2px; }
  .strong { font-weight: 800; }
  .totals { margin-top: 18px; display: flex; justify-content: flex-start; }
  .totals .box { width: 330px; border: 1px solid #e5e5e5; border-radius: 12px; overflow: hidden; }
  .totals .line { display: flex; justify-content: space-between; padding: 9px 14px; font-size: 12px; }
  .totals .line + .line { border-top: 1px solid #f0f0f0; }
  .totals .grand { background: #0a0a0a; color: #fff; font-size: 15px; font-weight: 800; }
  .totals .split { background: #fafafa; }
  .refbox { margin-top: 18px; border: 1.5px dashed #0a0a0a; border-radius: 12px;
            padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; }
  .refbox .q { font-size: 22px; font-weight: 900; letter-spacing: 4px; }
  .refbox .val { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 15px;
                 font-weight: 800; direction: ltr; }
  .notes { margin-top: 16px; font-size: 11px; color: #525252; border-right: 3px solid #e5e5e5;
           padding-right: 10px; }
  footer { margin-top: 26px; border-top: 1px solid #e5e5e5; padding-top: 12px;
           text-align: center; font-size: 10px; color: #a3a3a3; line-height: 1.8; }
</style>
</head>
<body>
<div class="sheet">
  <div class="top">
    <div class="brand">
      <div class="logo">V</div>
      <div>
        <div class="bname">VARLO</div>
        <div class="btag">ONLINE MARKETPLACE</div>
      </div>
    </div>
    <div class="doc">
      <div class="doct">${isOrder ? 'INVOICE' : 'PAYOUT INVOICE'}</div>
      <div class="docn">${esc(invoice.invoice_number ?? invoice.reference ?? '')}</div>
      <div class="docd">${esc(formatDateTime(invoice.issued_at))}</div>
    </div>
  </div>

  <div class="badges">
    <span class="badge ${invoice.status === 'delivered' || invoice.status === 'paid' ? 'ok' : 'warn'}">
      الحالة: ${esc(statusLabel(invoice.status))}
    </span>
    ${
      invoice.payment_status
        ? `<span class="badge ${invoice.payment_status === 'paid' ? 'ok' : 'warn'}">الدفع: ${esc(
            statusLabel(invoice.payment_status)
          )}</span>`
        : ''
    }
    ${invoice.reference ? `<span class="badge">المرجع: ${esc(invoice.reference)}</span>` : ''}
  </div>

  <div class="grid">
    <div class="card">
      <h3>${isOrder ? 'بيانات الزبون' : 'بيانات المستفيد'}</h3>
      <div class="row"><span class="k">الاسم</span><span class="v">${esc(
        isOrder ? invoice.customer?.name ?? '—' : invoice.party?.name ?? '—'
      )}</span></div>
      ${
        isOrder
          ? `<div class="row"><span class="k">الهاتف</span><span class="v">${esc(
              invoice.customer?.phone ?? '—'
            )}</span></div>`
          : `<div class="row"><span class="k">معلومات الدفع</span><span class="v">${esc(
              invoice.payment_info ?? '—'
            )}</span></div>`
      }
      ${
        isOrder && shipping.governorate
          ? `<div class="row"><span class="k">المحافظة</span><span class="v">${esc(
              shipping.governorate
            )}</span></div>`
          : ''
      }
      ${
        isOrder && shipping.branch_name
          ? `<div class="row"><span class="k">فرع الشحن</span><span class="v">${esc(
              shipping.branch_name
            )}</span></div>`
          : ''
      }
      ${
        isOrder && shipping.branch_address
          ? `<div class="row"><span class="k">عنوان الفرع</span><span class="v">${esc(
              shipping.branch_address
            )}</span></div>`
          : ''
      }
      ${
        isOrder && shipping.branch_phone
          ? `<div class="row"><span class="k">هاتف الفرع</span><span class="v">${esc(
              shipping.branch_phone
            )}</span></div>`
          : ''
      }
      ${
        isOrder && !shipping.branch_name && shippingLines.length
          ? `<div class="row"><span class="k">الاستلام</span><span class="v">${esc(
              shippingLines.join(' — ')
            )}</span></div>`
          : ''
      }
      ${
        isOrder
          ? `<div class="row"><span class="k">طريقة الدفع</span><span class="v">${esc(
              invoice.payment_method === 'wallet' ? 'المحفظة' : (invoice.payment_method ?? '—')
            )}</span></div>`
          : `<div class="row"><span class="k">تاريخ المعالجة</span><span class="v">${esc(
              formatDateTime(invoice.processed_at ?? null)
            )}</span></div>`
      }
      ${
        invoice.tracking_number
          ? `<div class="row"><span class="k">رقم التتبع</span><span class="v">${esc(
              invoice.tracking_number
            )}</span></div>`
          : ''
      }
    </div>

    <div class="qrbox">
      ${qr ? `<img src="${qr}" alt="QR" />` : ''}
      <div class="h">امسح للتحقق</div>
      <div class="s">فاتورة موثّقة إلكترونياً</div>
      <div class="tok">${esc(invoice.token)}</div>
    </div>
  </div>

  ${
    isOrder
      ? `<table>
    <thead>
      <tr>
        <th class="c" style="width:34px">#</th>
        <th>الصنف</th>
        <th class="c" style="width:60px">الكمية</th>
        <th class="c" style="width:90px">السعر</th>
        <th class="c" style="width:100px">الإجمالي</th>
      </tr>
    </thead>
    <tbody>${itemRows || '<tr><td colspan="5" class="c">لا توجد أصناف</td></tr>'}</tbody>
  </table>`
      : ''
  }

  <div class="totals">
    <div class="box">
      ${totalsRows
        .map(
          ([k, v]) => `<div class="line"><span>${esc(k)}</span><span>${esc(v)}</span></div>`
        )
        .join('')}
      <div class="line grand"><span>${isOrder ? 'الإجمالي' : 'مبلغ السحب'}</span><span>${esc(
    money(t.total ?? t.amount)
  )}</span></div>
      ${
        isOrder && (paidAmount > 0 || remainingAmount > 0)
          ? `<div class="line split"><span>${esc(
              upfrontPct > 0 ? `تم دفع مبلغ (${upfrontPct}%)` : 'تم دفع مبلغ'
            )}</span><span>${esc(money(paidAmount))}</span></div>
             <div class="line split"><span>المتبقي عند الاستلام</span><span>${esc(
               money(remainingAmount)
             )}</span></div>`
          : ''
      }
    </div>
  </div>

  <div class="refbox">
    <span class="q">؟؟؟ =</span>
    <span class="val">${esc(invoice.party_ref ?? '—')}</span>
  </div>

  ${invoice.notes ? `<div class="notes">${esc(invoice.notes)}</div>` : ''}
  ${invoice.admin_notes ? `<div class="notes">${esc(invoice.admin_notes)}</div>` : ''}

  <footer>
    هذه فاتورة إلكترونية صادرة تلقائياً ولا تحتاج إلى توقيع.<br />
    للتحقق من صحّتها امسح رمز الـ QR أو افتح: ${esc(buildInvoiceUrl(invoice.token))}
  </footer>
</div>
</body>
</html>`;
}

/** Download / share the invoice as a professional PDF. */
export async function downloadInvoicePdf(invoice: Invoice): Promise<void> {
  const html = await buildInvoiceHtml(invoice);
  const filename = `${invoice.invoice_number ?? invoice.token}.pdf`;

  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') return;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '-10000px';
    iframe.style.bottom = '0';
    iframe.style.width = '210mm';
    iframe.style.height = '297mm';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();

    const run = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        }, 1500);
      }
    };
    // give images (QR data-url) a tick to decode
    setTimeout(run, 350);
    return;
  }

  try {
    const Print = require('expo-print');
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    try {
      const Sharing = require('expo-sharing');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: filename });
        return;
      }
    } catch {
      /* sharing unavailable — fall through */
    }
    await Print.printAsync({ html });
  } catch {
    /* printing unavailable on this platform */
  }
}
