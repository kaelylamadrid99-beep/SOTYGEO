import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { listNotifications, markAllRead, markRead } from "@/lib/sotygeo/api";
import { NOTIF_LABEL, fmtDate } from "@/lib/sotygeo/format";

export const Route = createFileRoute("/notificaciones")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const rows = useQuery({ queryKey: ["notifications"], queryFn: () => listNotifications() });
  const all = useMutation({
    mutationFn: () => markAllRead(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const one = useMutation({
    mutationFn: (id: string) => markRead({ data: { id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <div>
      <PageHeader
        kicker="Administración"
        title="Notificaciones"
        description="GPS sin conexión, alertas, geocercas, inspecciones y licencias. Estados UNREAD / READ. Correo encolado."
        actions={<Button variant="outline" onClick={() => all.mutate()}>Marcar todas leídas</Button>}
      />
      <ul className="space-y-2">
        {(rows.data ?? []).map((n) => (
          <li key={n.id} className="panel flex flex-wrap items-start justify-between gap-3 rounded-xl p-4">
            <div>
              <p className="text-sm font-medium">{n.title}</p>
              <p className="text-sm text-muted-foreground">{n.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {NOTIF_LABEL[n.kind] ?? n.kind} · {fmtDate(n.created_at)}
                {n.email_queued ? " · correo en cola" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge value={n.status} />
              {n.status === "UNREAD" ? (
                <Button size="sm" variant="outline" onClick={() => one.mutate(n.id)}>Leída</Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
