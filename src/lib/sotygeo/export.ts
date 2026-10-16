export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return `\uFEFF${[headers, ...rows].map((r) => r.map(esc).join(",")).join("\n")}`;
}

/** Escape HTML para contenido interpolado en documentos de impresión/PDF. */
export function escapeHtml(v: string | number | null | undefined): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function xmlEscape(v: string | number | null | undefined): string {
  return String(v ?? "")
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;");
}

export function toExcelXml(sheet: string, headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const cell = (v: string | number | null | undefined) =>
    `<Cell><Data ss:Type="${typeof v === "number" ? "Number" : "String"}">${xmlEscape(v)}</Data></Cell>`;
  const rowXml = (r: Array<string | number | null | undefined>) => `<Row>${r.map(cell).join("")}</Row>`;
  const sheetName = xmlEscape(sheet).slice(0, 31) || "SOTYGEO";
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${sheetName}"><Table>
${rowXml(headers)}
${rows.map(rowXml).join("\n")}
</Table></Worksheet></Workbook>`;
}

export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function reportDocument(title: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>${xmlEscape(title)}</title>
    <style>
      @page { margin: 16mm; }
      body { font: 13px/1.45 "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; color: #111; padding: 24px; }
      h1 { font-family: "Barlow Condensed", sans-serif; font-size: 22px; letter-spacing: .06em; margin: 0 0 4px; }
      p.meta { color: #555; margin: 0 0 16px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; font-size: 12px; }
      th { background: #f3f3f3; }
    </style></head><body>
    <h1>${xmlEscape(title)}</h1>
    <p class="meta">SOTYGEO · ${new Date().toLocaleString("es-MX")}</p>
    ${body}
    </body></html>`;
}

export function printHtml(title: string, body: string) {
  const html = reportDocument(title, body);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    downloadText(`${title.replace(/\s+/g, "-").toLowerCase()}.html`, html, "text/html;charset=utf-8");
    return;
  }
  const cleanup = () => {
    window.setTimeout(() => iframe.remove(), 1500);
  };
  win.addEventListener("afterprint", cleanup);
  doc.open();
  doc.write(html);
  doc.close();
  window.setTimeout(() => {
    win.focus();
    win.print();
    cleanup();
  }, 50);
}
