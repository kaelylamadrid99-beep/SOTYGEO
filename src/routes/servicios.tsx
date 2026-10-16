import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/field";
import {
  addServiceCost,
  addServiceStop,
  assignService,
  createPod,
  getService,
  listServices,
  transitionService,
  upsertLoad,
  upsertRoutePlan,
  upsertService,
} from "@/lib/sotygeo/operations";
import { fmtDate, fmtKm, num } from "@/lib/sotygeo/format";
import { getBootstrap, listCatalog } from "@/lib/sotygeo/api";
import { SERVICE_STATUSES } from "@/lib/sotygeo/services/machine";
import { profileCan } from "@/lib/sotygeo/security/permissions";
import type { ServiceRow } from "@/lib/sotygeo/types";

export const Route = createFileRoute("/servicios")({ component: Page });

const emptyForm = { client_id: "", origin: "", destination: "", origin_lat: "", origin_lng: "", destination_lat: "", destination_lng: "", scheduled_departure_at: "", scheduled_arrival_at: "", cargo_description: "", cargo_weight: "", cargo_volume: "", pieces: "", priority: "NORMAL", reference: "", notes: "", require_pod: true, gross_revenue: "" };
const activeStatuses = new Set<string>(SERVICE_STATUSES);

type LoadInput = {
  serviceId: string;
  loadNumber: string;
  description?: string;
  weightKg?: number;
  volumeM3?: number;
  pieces?: number;
  reference?: string;
};
type StopInput = { serviceId: string; name: string; address?: string; kind?: string; lat?: number | null; lng?: number | null };
type CostInput = { serviceId: string; kind: string; amount: number; notes?: string };
type RouteInput = { serviceId: string; points: { latitude: number; longitude: number }[] };
type Catalog = Awaited<ReturnType<typeof listCatalog>>;

function Page() {
  const qc = useQueryClient();
  const workspace = useQuery({ queryKey: ["workspace"], queryFn: () => getBootstrap() });
  const profile = workspace.data?.profile;
  const canManage = !!profile && profileCan(profile, "services.update");
  const canMove = !!profile && profileCan(profile, "trips.update");
  const rows = useQuery({ queryKey: ["services"], queryFn: () => listServices({ data: {} }) });
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => listCatalog() });
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState<ServiceRow | null>(null);
  const [podOpen, setPodOpen] = useState<ServiceRow | null>(null);
  const [loadOpen, setLoadOpen] = useState<ServiceRow | null>(null);
  const [stopOpen, setStopOpen] = useState<ServiceRow | null>(null);
  const [costOpen, setCostOpen] = useState<ServiceRow | null>(null);
  const [routeOpen, setRouteOpen] = useState<ServiceRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState<ServiceRow | null>(null);

  const detail = useQuery({ queryKey: ["service", detailId], queryFn: () => getService({ data: { id: detailId! } }), enabled: !!detailId });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["services"] }); void qc.invalidateQueries({ queryKey: ["catalog"] }); if (detailId) void qc.invalidateQueries({ queryKey: ["service", detailId] }); };
  const save = useMutation({
    mutationFn: () => upsertService({ data: {
      id: selected?.id,
      client_id: form.client_id || null,
      origin: form.origin,
      destination: form.destination,
      origin_lat: form.origin_lat ? Number(form.origin_lat) : null,
      origin_lng: form.origin_lng ? Number(form.origin_lng) : null,
      destination_lat: form.destination_lat ? Number(form.destination_lat) : null,
      destination_lng: form.destination_lng ? Number(form.destination_lng) : null,
      scheduled_departure_at: form.scheduled_departure_at ? new Date(form.scheduled_departure_at).toISOString() : null,
      scheduled_arrival_at: form.scheduled_arrival_at ? new Date(form.scheduled_arrival_at).toISOString() : null,
      cargo_description: form.cargo_description,
      cargo_weight: Number(form.cargo_weight || 0),
      cargo_volume: Number(form.cargo_volume || 0),
      pieces: Number(form.pieces || 0),
      priority: form.priority,
      reference: form.reference,
      notes: form.notes,
      require_pod: form.require_pod,
      gross_revenue: Number(form.gross_revenue || 0),
    } }),
    onSuccess: () => { setFormOpen(false); setSelected(null); refresh(); },
  });
  const assign = useMutation({ mutationFn: (x: { serviceId: string; vehicleId: string; driverId: string }) => assignService({ data: x }), onSuccess: () => { setAssignOpen(null); refresh(); } });
  const transition = useMutation({ mutationFn: (x: { serviceId: string; to: string }) => transitionService({ data: x }), onSuccess: refresh });
  const pod = useMutation({ mutationFn: (x: { serviceId: string; receiver_name: string; receiver_document: string; comments: string; signature?: string; photo_url?: string; latitude?: number | null; longitude?: number | null }) => createPod({ data: x }), onSuccess: () => { setPodOpen(null); refresh(); } });
  const load = useMutation({ mutationFn: (x: LoadInput) => upsertLoad({ data: x }), onSuccess: () => { setLoadOpen(null); refresh(); } });
  const stop = useMutation({ mutationFn: (x: StopInput) => addServiceStop({ data: x }), onSuccess: () => { setStopOpen(null); refresh(); } });
  const cost = useMutation({ mutationFn: (x: CostInput) => addServiceCost({ data: x }), onSuccess: () => { setCostOpen(null); refresh(); } });
  const route = useMutation({ mutationFn: (x: RouteInput) => upsertRoutePlan({ data: x }), onSuccess: () => { setRouteOpen(null); refresh(); } });

  const statusNext = useMemo(() => new Map<string, string>([
    ["PLANNED", "ASSIGNED"], ["ASSIGNED", "AT_ORIGIN"], ["AT_ORIGIN", "LOADING"], ["LOADING", "LOADED"], ["LOADED", "IN_TRANSIT"], ["IN_TRANSIT", "AT_DESTINATION"], ["AT_DESTINATION", "UNLOADING"], ["UNLOADING", "DELIVERED"],
  ]), []);

  function openNew() { setSelected(null); setForm(emptyForm); setFormOpen(true); }
  function openEdit(row: ServiceRow) { setSelected(row); setForm({ ...emptyForm, client_id: row.client_id ?? "", origin: row.origin, destination: row.destination, origin_lat: String(row.origin_lat ?? ""), origin_lng: String(row.origin_lng ?? ""), destination_lat: String(row.destination_lat ?? ""), destination_lng: String(row.destination_lng ?? ""), priority: row.priority, reference: row.reference, notes: row.notes, require_pod: row.require_pod, cargo_description: row.cargo_description, cargo_weight: String(row.cargo_weight), cargo_volume: String(row.cargo_volume), pieces: String(row.pieces), gross_revenue: String(row.gross_revenue) }); setFormOpen(true); }
  const serviceRows = rows.data ?? [];

  return <div>
    <PageHeader kicker="Operación" title="Servicios" description="Orden operativa central: cliente, carga, paradas, unidad, conductor, ruta, entrega y rentabilidad." actions={canManage ? <Button onClick={openNew}>Nuevo servicio</Button> : null} />
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[1100px] text-sm">
        <thead className="bg-secondary text-left text-xs tracking-wide text-muted-foreground uppercase"><tr><th className="px-3 py-2">Servicio</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Ruta</th><th className="px-3 py-2">Unidad</th><th className="px-3 py-2">Conductor</th><th className="px-3 py-2">ETA</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Ingreso</th><th className="px-3 py-2"></th></tr></thead>
        <tbody>{serviceRows.map((r) => { const next = statusNext.get(r.status); return <tr key={r.id} className="border-t border-border hover:bg-accent/30">
          <td className="px-3 py-2 font-medium">{r.service_number}</td><td className="px-3 py-2">{r.client_name ?? "—"}</td><td className="px-3 py-2"><div>{r.origin}</div><div className="text-xs text-muted-foreground">→ {r.destination}</div></td><td className="px-3 py-2">{r.vehicle_number ?? "Sin asignar"}</td><td className="px-3 py-2">{r.driver_name ?? "Sin asignar"}</td><td className="px-3 py-2">{r.eta_at ? fmtDate(r.eta_at) : "—"}</td><td className="px-3 py-2"><StatusBadge value={r.status} /></td><td className="px-3 py-2">{canManage ? `$${num.format(Number(r.gross_revenue))}` : "—"}</td>
          <td className="px-3 py-2 text-right"><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => { setDetailId(r.id); }}>Detalle</Button>{canManage ? <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Editar</Button> : null}{canMove && activeStatuses.has(r.status) && !["DELIVERED","CANCELLED"].includes(r.status) ? <Button size="sm" variant="outline" onClick={() => next && transition.mutate({ serviceId: r.id, to: next })} disabled={!next || transition.isPending}>{next?.replaceAll("_", " ")}</Button> : null}</div></td>
        </tr>; })}</tbody>
      </table>
    </div>

    <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{selected ? "Editar servicio" : "Nuevo servicio"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Cliente"><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}><option value="">Sin cliente</option>{(catalog.data?.clients ?? []).map(c => <option key={c.id} value={c.id}>{c.trade_name}</option>)}</select></Field><Field label="Referencia"><Input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></Field><Field label="Origen"><Input value={form.origin} onChange={e => setForm({ ...form, origin: e.target.value })} /></Field><Field label="Destino"><Input value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} /></Field><Field label="Latitud origen"><Input inputMode="decimal" value={form.origin_lat} onChange={e => setForm({ ...form, origin_lat: e.target.value })} /></Field><Field label="Longitud origen"><Input inputMode="decimal" value={form.origin_lng} onChange={e => setForm({ ...form, origin_lng: e.target.value })} /></Field><Field label="Latitud destino"><Input inputMode="decimal" value={form.destination_lat} onChange={e => setForm({ ...form, destination_lat: e.target.value })} /></Field><Field label="Longitud destino"><Input inputMode="decimal" value={form.destination_lng} onChange={e => setForm({ ...form, destination_lng: e.target.value })} /></Field><Field label="Salida programada"><Input type="datetime-local" value={form.scheduled_departure_at} onChange={e => setForm({ ...form, scheduled_departure_at: e.target.value })} /></Field><Field label="Llegada programada"><Input type="datetime-local" value={form.scheduled_arrival_at} onChange={e => setForm({ ...form, scheduled_arrival_at: e.target.value })} /></Field><Field label="Peso kg"><Input type="number" min="0" value={form.cargo_weight} onChange={e => setForm({ ...form, cargo_weight: e.target.value })} /></Field><Field label="Volumen m³"><Input type="number" min="0" value={form.cargo_volume} onChange={e => setForm({ ...form, cargo_volume: e.target.value })} /></Field><Field label="Piezas"><Input type="number" min="0" value={form.pieces} onChange={e => setForm({ ...form, pieces: e.target.value })} /></Field><Field label="Ingreso bruto"><Input type="number" min="0" value={form.gross_revenue} onChange={e => setForm({ ...form, gross_revenue: e.target.value })} /></Field><Field label="Prioridad"><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option>NORMAL</option><option>URGENT</option><option>HIGH</option></select></Field><Field label="Descripción de carga" className="sm:col-span-2"><Input value={form.cargo_description} onChange={e => setForm({ ...form, cargo_description: e.target.value })} /></Field><Field label="Notas" className="sm:col-span-2"><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button><Button disabled={save.isPending || !form.origin || !form.destination} onClick={() => save.mutate()}>Guardar servicio</Button></div>
    </DialogContent></Dialog>

    <Dialog open={!!detailId} onOpenChange={(v) => { if (!v) setDetailId(null); }}><DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>Detalle del servicio {detail.data?.service.service_number}</DialogTitle></DialogHeader>{detail.data ? <div className="space-y-4"><div className="grid gap-3 md:grid-cols-4"><Card><CardHeader><CardTitle className="text-sm">Estado</CardTitle></CardHeader><CardContent><StatusBadge value={detail.data.service.status} /></CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Distancia</CardTitle></CardHeader><CardContent>{fmtKm(detail.data.planned_distance_km)}</CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Costo</CardTitle></CardHeader><CardContent>{canManage ? `$${num.format(Number(detail.data.total_cost ?? 0))}` : "—"}</CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Margen</CardTitle></CardHeader><CardContent>{canManage ? `$${num.format(Number(detail.data.margin ?? 0))}` : "—"}</CardContent></Card></div><div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle className="text-sm">Paradas</CardTitle></CardHeader><CardContent className="space-y-2">{detail.data.stops.map(s => <div key={s.id} className="flex justify-between rounded-lg border p-2 text-sm"><span>{s.sequence}. {s.name}</span><StatusBadge value={s.status} /></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Cargas</CardTitle></CardHeader><CardContent className="space-y-2">{detail.data.loads.map(l => <div key={l.id} className="rounded-lg border p-2 text-sm"><div className="font-medium">{l.load_number}</div><div className="text-muted-foreground">{l.description || "Sin descripción"} · {l.pieces} pzas · {l.weight_kg} kg</div></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Incidencias</CardTitle></CardHeader><CardContent className="space-y-2">{detail.data.incidents.length ? detail.data.incidents.map(i => <div key={i.id} className="rounded-lg border p-2 text-sm"><div className="font-medium">{i.title}</div><div className="text-muted-foreground">{i.severity} · {i.status}</div></div>) : <p className="text-sm text-muted-foreground">Sin incidencias.</p>}</CardContent></Card><Card><CardHeader><CardTitle className="text-sm">POD</CardTitle></CardHeader><CardContent className="space-y-2">{detail.data.pod.length ? detail.data.pod.map(p => <div key={p.id} className="rounded-lg border p-2 text-sm">{p.receiver_name} · {fmtDate(p.captured_at)}</div>) : <p className="text-sm text-muted-foreground">Sin evidencia.</p>}</CardContent></Card></div><div className="flex flex-wrap gap-2">{canManage ? <><Button variant="outline" onClick={() => setAssignOpen(detail.data!.service)}>Asignar unidad/conductor</Button><Button variant="outline" onClick={() => setStopOpen(detail.data!.service)}>Agregar parada</Button><Button variant="outline" onClick={() => setLoadOpen(detail.data!.service)}>Agregar carga</Button><Button variant="outline" onClick={() => setCostOpen(detail.data!.service)}>Agregar costo</Button><Button variant="outline" onClick={() => setRouteOpen(detail.data!.service)}>Definir ruta</Button></> : null}{profile?.role !== "CLIENTE" ? <Button onClick={() => setPodOpen(detail.data!.service)}>Registrar POD</Button> : null}</div></div> : <p className="text-sm text-muted-foreground">Cargando…</p>}</DialogContent></Dialog>

    <AssignDialog row={assignOpen} catalog={catalog.data} onClose={() => setAssignOpen(null)} onSubmit={(x) => assign.mutate(x)} pending={assign.isPending} />
    <PodDialog row={podOpen} onClose={() => setPodOpen(null)} onSubmit={(x) => pod.mutate(x)} pending={pod.isPending} />
    <LoadDialog row={loadOpen} onClose={() => setLoadOpen(null)} onSubmit={(x) => load.mutate(x)} pending={load.isPending} />
    <StopDialog row={stopOpen} onClose={() => setStopOpen(null)} onSubmit={(x) => stop.mutate(x)} pending={stop.isPending} />
    <CostDialog row={costOpen} onClose={() => setCostOpen(null)} onSubmit={(x) => cost.mutate(x)} pending={cost.isPending} />
    <RouteDialog row={routeOpen} onClose={() => setRouteOpen(null)} onSubmit={(x) => route.mutate(x)} pending={route.isPending} />
  </div>;
}

function AssignDialog({ row, catalog, onClose, onSubmit, pending }: { row: ServiceRow | null; catalog?: Catalog; onClose: () => void; onSubmit: (x: { serviceId: string; vehicleId: string; driverId: string }) => void; pending: boolean }) { const [vehicleId,setVehicleId]=useState(""); const [driverId,setDriverId]=useState(""); return <Dialog open={!!row} onOpenChange={v=>{if(!v)onClose();}}><DialogContent><DialogHeader><DialogTitle>Asignar {row?.service_number}</DialogTitle></DialogHeader><div className="grid gap-3"><Field label="Unidad"><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={vehicleId} onChange={e=>setVehicleId(e.target.value)}><option value="">Selecciona</option>{(catalog?.vehicles??[]).map((v)=><option key={v.id} value={v.id}>{v.economic_number}</option>)}</select></Field><Field label="Conductor"><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={driverId} onChange={e=>setDriverId(e.target.value)}><option value="">Selecciona</option>{(catalog?.drivers??[]).map((d)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></Field></div><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={pending||!row||!vehicleId||!driverId} onClick={()=>row&&onSubmit({serviceId:row.id,vehicleId,driverId})}>Asignar</Button></div></DialogContent></Dialog> }
function PodDialog({ row,onClose,onSubmit,pending }:{row:ServiceRow|null;onClose:()=>void;onSubmit:(x:{serviceId:string;receiver_name:string;receiver_document:string;comments:string;signature?:string;photo_url?:string;latitude?:number|null;longitude?:number|null})=>void;pending:boolean}){const [receiver,setReceiver]=useState("");const [doc,setDoc]=useState("");const [comments,setComments]=useState("");const [signature,setSignature]=useState("");const [photoUrl,setPhotoUrl]=useState("");const [lat,setLat]=useState("");const [lng,setLng]=useState("");return <Dialog open={!!row} onOpenChange={v=>{if(!v)onClose();}}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>POD · {row?.service_number}</DialogTitle></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><Field label="Receptor"><Input value={receiver} onChange={e=>setReceiver(e.target.value)} /></Field><Field label="Documento"><Input value={doc} onChange={e=>setDoc(e.target.value)} /></Field><Field label="Firma / evidencia (texto o data URL)"><Textarea value={signature} onChange={e=>setSignature(e.target.value)} placeholder="Opcional" /></Field><Field label="Foto / URL de evidencia"><Input value={photoUrl} onChange={e=>setPhotoUrl(e.target.value)} placeholder="https://..." /></Field><Field label="Latitud"><Input type="number" min="-90" max="90" step="any" value={lat} onChange={e=>setLat(e.target.value)} /></Field><Field label="Longitud"><Input type="number" min="-180" max="180" step="any" value={lng} onChange={e=>setLng(e.target.value)} /></Field><div className="sm:col-span-2"><Field label="Comentarios"><Textarea value={comments} onChange={e=>setComments(e.target.value)} /></Field></div></div><p className="mt-2 text-xs text-muted-foreground">La evidencia puede llevar firma, foto y coordenadas GPS para dejar trazabilidad de la entrega.</p><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={pending||!receiver} onClick={()=>row&&onSubmit({serviceId:row.id,receiver_name:receiver,receiver_document:doc,comments,signature:signature||undefined,photo_url:photoUrl||undefined,latitude:lat?Number(lat):null,longitude:lng?Number(lng):null})}>Registrar entrega</Button></div></DialogContent></Dialog>}
function LoadDialog({ row,onClose,onSubmit,pending }:{row:ServiceRow|null;onClose:()=>void;onSubmit:(x:{serviceId:string;loadNumber:string;description?:string;weightKg?:number;volumeM3?:number;pieces?:number;reference?:string})=>void;pending:boolean}){const [number,setNumber]=useState("");const [description,setDescription]=useState("");const [weight,setWeight]=useState("");const [pieces,setPieces]=useState("");return <Dialog open={!!row} onOpenChange={v=>{if(!v)onClose();}}><DialogContent><DialogHeader><DialogTitle>Carga · {row?.service_number}</DialogTitle></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><Field label="Número de carga"><Input value={number} onChange={e=>setNumber(e.target.value)} /></Field><Field label="Piezas"><Input type="number" min="0" value={pieces} onChange={e=>setPieces(e.target.value)} /></Field><Field label="Peso kg"><Input type="number" min="0" value={weight} onChange={e=>setWeight(e.target.value)} /></Field><Field label="Descripción"><Input value={description} onChange={e=>setDescription(e.target.value)} /></Field></div><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={pending||!number} onClick={()=>row&&onSubmit({serviceId:row.id,loadNumber:number,description,weightKg:Number(weight||0),pieces:Number(pieces||0)})}>Guardar</Button></div></DialogContent></Dialog>}
function StopDialog({ row,onClose,onSubmit,pending }:{row:ServiceRow|null;onClose:()=>void;onSubmit:(x:{serviceId:string;name:string;address?:string;kind?:string;lat?:number|null;lng?:number|null})=>void;pending:boolean}){const [name,setName]=useState("");const [address,setAddress]=useState("");return <Dialog open={!!row} onOpenChange={v=>{if(!v)onClose();}}><DialogContent><DialogHeader><DialogTitle>Nueva parada · {row?.service_number}</DialogTitle></DialogHeader><div className="grid gap-3"><Field label="Nombre"><Input value={name} onChange={e=>setName(e.target.value)} /></Field><Field label="Dirección"><Input value={address} onChange={e=>setAddress(e.target.value)} /></Field></div><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={pending||!name} onClick={()=>row&&onSubmit({serviceId:row.id,name,address})}>Agregar</Button></div></DialogContent></Dialog>}
function CostDialog({ row,onClose,onSubmit,pending }:{row:ServiceRow|null;onClose:()=>void;onSubmit:(x:{serviceId:string;kind:string;amount:number;notes?:string})=>void;pending:boolean}){const [kind,setKind]=useState("FUEL");const [amount,setAmount]=useState("");const [notes,setNotes]=useState("");return <Dialog open={!!row} onOpenChange={v=>{if(!v)onClose();}}><DialogContent><DialogHeader><DialogTitle>Costo · {row?.service_number}</DialogTitle></DialogHeader><div className="grid gap-3"><Field label="Tipo"><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={kind} onChange={e=>setKind(e.target.value)}><option>FUEL</option><option>TOLL</option><option>DRIVER</option><option>MAINTENANCE</option><option>OTHER</option></select></Field><Field label="Importe"><Input type="number" min="0" value={amount} onChange={e=>setAmount(e.target.value)} /></Field><Field label="Notas"><Textarea value={notes} onChange={e=>setNotes(e.target.value)} /></Field></div><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={pending||!amount} onClick={()=>row&&onSubmit({serviceId:row.id,kind,amount:Number(amount),notes})}>Agregar</Button></div></DialogContent></Dialog>}
function RouteDialog({ row,onClose,onSubmit,pending }:{row:ServiceRow|null;onClose:()=>void;onSubmit:(x:{serviceId:string;points:{latitude:number;longitude:number}[]})=>void;pending:boolean}){const [points,setPoints]=useState("");return <Dialog open={!!row} onOpenChange={v=>{if(!v)onClose();}}><DialogContent><DialogHeader><DialogTitle>Ruta · {row?.service_number}</DialogTitle></DialogHeader><Field label="Puntos de ruta (lat,lng por línea)"><Textarea value={points} onChange={e=>setPoints(e.target.value)} placeholder="20.60,-100.40\n20.55,-100.35" /></Field><p className="text-xs text-muted-foreground">Se calcula distancia por Haversine y el ETA usa la distancia restante de la ruta.</p><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={pending||!points.trim()} onClick={()=>{const pts=points.split("\n").map(x=>x.split(",").map(Number)).filter(x=>x.length===2&&x.every(Number.isFinite)).map(x=>({latitude:x[0]!,longitude:x[1]!})); if(row&&pts.length>=2)onSubmit({serviceId:row.id,points:pts});}}>Guardar ruta</Button></div></DialogContent></Dialog>}
