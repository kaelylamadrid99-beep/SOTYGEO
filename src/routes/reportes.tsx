import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listCatalog, runReport } from "@/lib/sotygeo/api";
import { downloadText, escapeHtml, printHtml, toCsv, toExcelXml } from "@/lib/sotygeo/export";
import { fmtDate } from "@/lib/sotygeo/format";

export const Route = createFileRoute("/reportes")({ component: Page });

const KINDS = [
  { id: "mileage", label: "Kilometraje" },
  { id: "speed", label: "Excesos" },
  { id: "zones", label: "Zonas" },
  { id: "inspections", label: "Inspecciones" },
  { id: "utilization", label: "Utilización" },
  { id: "drivers", label: "Conductores" },
  { id: "services", label: "Servicios" },
  { id: "profitability", label: "Rentabilidad" },
] as const;

function Page() {
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("mileage");
  const [clientId, setClientId] = useState("");
  const [fleetId, setFleetId] = useState("");
  const [from, setFrom] = useState(() => new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 16));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 16));
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => listCatalog() });
  const report = useQuery({
    queryKey: ["report", kind, clientId, fleetId, from, to],
    queryFn: () =>
      runReport({
        data: {
          kind,
          clientId: clientId || null,
          fleetId: fleetId || null,
          from: new Date(from).toISOString(),
          to: new Date(to).toISOString(),
        },
      }),
  });
  const rows = (report.data?.rows ?? []) as Record<string, unknown>[];
  const headers = useMemo(() => (rows[0] ? Object.keys(rows[0]) : []), [rows]);
  const chart = rows.slice(0, 12).map((r) => ({
    name: String(r.economic_number ?? r.name ?? r.geofence_name ?? "").slice(0, 12),
    value: Number(r.km ?? r.utilization_pct ?? r.speed ?? r.speed_alerts ?? 1),
  }));

  function exportCsv() {
    downloadText(`sotygeo-${kind}.csv`, toCsv(headers, rows.map((r) => headers.map((h) => r[h] as never))), "text/csv;charset=utf-8");
  }
  function exportXls() {
    downloadText(`sotygeo-${kind}.xls`, toExcelXml(kind, headers, rows.map((r) => headers.map((h) => r[h] as never))), "application/vnd.ms-excel");
  }
  function exportPdf() {
    // Todo valor que viene de la BD pasa por escapeHtml: el HTML de impresión/PDF
    // no puede ejecutar contenido almacenado (XSS vía reporte).
    const body = `<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows
      .map((r) => `<tr>${headers.map((h) => `<td>${escapeHtml(String(r[h] ?? ""))}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;
    printHtml(`SOTYGEO · ${KINDS.find((k) => k.id === kind)?.label}`, body);
  }

  return (
    <div>
      <PageHeader kicker="Administración" title="Reportes" description="Ocho reportes operativos y financieros, con tabla, gráfica, PDF y Excel." />
      <Tabs value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
        <TabsList className="flex flex-wrap">
          {KINDS.map((k) => (
            <TabsTrigger key={k.id} value={k.id}>{k.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="my-4 flex flex-wrap gap-2">
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Cliente</option>
          {(catalog.data?.clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.trade_name}</option>)}
        </select>
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={fleetId} onChange={(e) => setFleetId(e.target.value)}>
          <option value="">Flotilla</option>
          {(catalog.data?.fleets ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <input type="datetime-local" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="datetime-local" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button variant="outline" onClick={exportCsv}>CSV</Button>
        <Button variant="outline" onClick={exportXls}>Excel</Button>
        <Button variant="outline" onClick={exportPdf}>PDF</Button>
      </div>
      <Card className="mb-4 rounded-2xl">
        <CardContent className="h-64 pt-5">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0" }} />
              <Bar dataKey="value" fill="#0d9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>{headers.map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                {headers.map((h) => (
                  <td key={h} className="px-3 py-2">
                    {h.includes("at") && typeof r[h] === "string" ? fmtDate(String(r[h])) : String(r[h] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
