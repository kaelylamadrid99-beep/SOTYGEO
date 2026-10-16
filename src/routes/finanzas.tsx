import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DollarSign, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { runReport } from "@/lib/sotygeo/api";
import { num } from "@/lib/sotygeo/format";

export const Route = createFileRoute("/finanzas")({ component: Page });

function Page() {
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const report = useQuery({
    queryKey: ["finance", from, to],
    queryFn: () => runReport({ data: { kind: "profitability", from: `${from}T00:00:00.000Z`, to: `${to}T23:59:59.999Z` } }),
  });
  const rows = (report.data?.rows ?? []) as Array<{ day: string; services: number; revenue: number; costs: number; margin: number; margin_pct: number }>;
  const totals = useMemo(() => rows.reduce((a, r) => ({ services: a.services + Number(r.services || 0), revenue: a.revenue + Number(r.revenue || 0), costs: a.costs + Number(r.costs || 0) }), { services: 0, revenue: 0, costs: 0 }), [rows]);
  const margin = totals.revenue - totals.costs;
  const marginPct = totals.revenue > 0 ? (margin / totals.revenue) * 100 : 0;

  return (
    <div className="space-y-5">
      <PageHeader kicker="Administración" title="Finanzas" description="Ingresos, costos y margen por periodo a partir de servicios y líneas de costo." />
      <div className="flex flex-wrap gap-2">
        <input type="date" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="pt-5"><div className="flex items-center justify-between text-xs text-muted-foreground">Servicios <DollarSign className="size-4" /></div><p className="mt-2 font-display text-3xl">{totals.services}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="flex items-center justify-between text-xs text-muted-foreground">Ingresos <TrendingUp className="size-4" /></div><p className="mt-2 font-display text-3xl">${num.format(totals.revenue)}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="flex items-center justify-between text-xs text-muted-foreground">Costos <TrendingDown className="size-4" /></div><p className="mt-2 font-display text-3xl">${num.format(totals.costs)}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="flex items-center justify-between text-xs text-muted-foreground">Margen <DollarSign className="size-4" /></div><p className="mt-2 font-display text-3xl">${num.format(margin)}</p><p className="text-xs text-muted-foreground">{num.format(marginPct)}%</p></CardContent></Card>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-secondary text-left text-xs text-muted-foreground uppercase"><tr><th className="px-3 py-2">Día</th><th className="px-3 py-2">Servicios</th><th className="px-3 py-2">Ingresos</th><th className="px-3 py-2">Costos</th><th className="px-3 py-2">Margen</th><th className="px-3 py-2">%</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.day} className="border-t border-border"><td className="px-3 py-2">{r.day}</td><td className="px-3 py-2">{r.services}</td><td className="px-3 py-2">${num.format(Number(r.revenue))}</td><td className="px-3 py-2">${num.format(Number(r.costs))}</td><td className="px-3 py-2">${num.format(Number(r.margin))}</td><td className="px-3 py-2">{num.format(Number(r.margin_pct))}%</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
