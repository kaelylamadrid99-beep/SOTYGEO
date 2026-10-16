import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createBackup, downloadBackup, listBackups, restoreBackup } from "@/lib/sotygeo/api";
import { downloadText } from "@/lib/sotygeo/export";
import { fmtDate, num0 } from "@/lib/sotygeo/format";

export const Route = createFileRoute("/respaldos")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const rows = useQuery({ queryKey: ["backups"], queryFn: () => listBackups() });
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const make = useMutation({
    mutationFn: () => createBackup(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["backups"] }),
  });
  const restore = useMutation({
    mutationFn: () => restoreBackup({ data: { id: restoreId!, confirm } }),
    onSuccess: () => {
      setRestoreId(null);
      setConfirm("");
      void qc.invalidateQueries();
    },
  });

  async function onDownload(id: string) {
    const file = await downloadBackup({ data: { id } });
    downloadText(file.filename, file.payload, "application/json");
  }

  return (
    <div>
      <PageHeader
        kicker="Administración"
        title="Respaldos"
        description="Solo un administrador puede restaurar. Escribe RESTAURAR para confirmar."
        actions={<Button onClick={() => make.mutate()} disabled={make.isPending}>Generar respaldo</Button>}
      />
      {rows.error ? <p className="text-sm text-destructive">Se requiere rol administrador.</p> : null}
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2">Archivo</th>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Tamaño</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(rows.data ?? []).map((b) => (
              <tr key={b.id} className="border-t border-border">
                <td className="px-3 py-2">{b.filename}</td>
                <td className="px-3 py-2">{fmtDate(b.created_at)}</td>
                <td className="px-3 py-2">{num0.format(b.size_bytes)} B</td>
                <td className="px-3 py-2"><StatusBadge value={b.status} /></td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => void onDownload(b.id)}>Descargar</Button>
                  <Button size="sm" variant="outline" onClick={() => setRestoreId(b.id)}>Restaurar</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={Boolean(restoreId)} onOpenChange={(o) => !o && setRestoreId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar restauración</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Esta acción reemplaza los datos operativos de la empresa. Escribe RESTAURAR.</p>
          <Input className="mt-3" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="RESTAURAR" />
          {restore.error ? <p className="mt-2 text-sm text-destructive">{String(restore.error.message)}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRestoreId(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={restore.isPending} onClick={() => restore.mutate()}>Restaurar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
