import { Platform, Share, Linking } from 'react-native';

/**
 * Triggers a CSV download / share on the device.
 * On web: creates a Blob and triggers download.
 * On native: uses the Share API to share the CSV file content.
 */
export async function downloadCSV(
  csvContent: string,
  filename: string
): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } else {
    // On native, use the Share API
    try {
      await Share.share({
        message: csvContent,
        title: filename,
      });
    } catch {
      // Fallback: open a data URL
      const dataUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`;
      await Linking.openURL(dataUrl);
    }
  }
}

/**
 * Builds a CSV string from an array of row objects.
 */
export function buildCSV(
  headers: string[],
  rows: (string | number | null | undefined)[][]
): string {
  const escapeValue = (val: string | number | null | undefined): string => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers.map(escapeValue).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeValue).join(','));
  }
  return lines.join('\n');
}

/**
 * Opens a print-friendly HTML view that the user can save as PDF.
 * On web: opens a new window with print dialog.
 * On native: opens a data URL in the browser.
 */
export async function exportPDF(
  htmlContent: string,
  title: string
): Promise<void> {
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 24px; color: #171717; }
  h1 { font-size: 24px; margin-bottom: 8px; }
  .meta { color: #525252; font-size: 14px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { text-align: left; padding: 10px 12px; border-bottom: 2px solid #171717; font-size: 13px; font-weight: 600; color: #171717; }
  td { padding: 10px 12px; border-bottom: 1px solid #e5e5e5; font-size: 13px; color: #404040; }
  tr:nth-child(even) { background-color: #fafafa; }
  .summary-card { display: inline-block; margin-right: 16px; margin-bottom: 16px; padding: 16px 20px; border: 1px solid #e5e5e5; border-radius: 12px; }
  .summary-card .label { font-size: 12px; color: #737373; text-transform: uppercase; font-weight: 600; }
  .summary-card .value { font-size: 20px; font-weight: 700; color: #171717; margin-top: 4px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
${htmlContent}
<script>
  window.onload = function() { window.print(); };
</script>
</body>
</html>`;

  if (Platform.OS === 'web') {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(fullHtml);
      printWindow.document.close();
    }
  } else {
    // On native, encode and open in browser
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`;
    await Linking.openURL(dataUrl);
  }
}

/**
 * Helper to build a simple HTML table for PDF export.
 */
export function buildHTMLTable(
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): string {
  const summaryDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const tableRows = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell) => `<td>${String(cell ?? '')}</td>`)
          .join('')}</tr>`
    )
    .join('');

  return `
    <h1>${title}</h1>
    <div class="meta">${subtitle} &middot; Generated on ${summaryDate}</div>
    <table>
      <thead>
        <tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  `;
}
