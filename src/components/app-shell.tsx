import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { canOpenPath, redirectTarget } from "@/lib/sotygeo/security/navigation";
import {
  Bell,
  ClipboardCheck,
  Database,
  History,
  LayoutDashboard,
  Link2,
  Map as MapIcon,
  Menu,
  Radio,
  Shield,
  Truck,
  Users,
  UsersRound,
  Building2,
  Layers,
  FileBarChart,
  Smartphone,
  ClipboardList,
  Wrench,
  Fuel,
  FileText,
  AlertTriangle,
  DollarSign,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { authEnabled, signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { useCurrentUser, useCurrentUserState } from "@/lib/auth/use-current-user";
import { getBootstrap, listNotifications, markRead } from "@/lib/sotygeo/api";
import type { NotificationRow, Role } from "@/lib/sotygeo/types";
import { ROLE_LABEL } from "@/lib/sotygeo/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = { to: string; label: string; icon: typeof MapIcon };

const subscribeToNothing = () => () => {};
const noGateSessionOnServer = () => false;

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Operación",
    items: [
      { to: "/", label: "Tablero", icon: LayoutDashboard },
      { to: "/monitor", label: "Monitor", icon: MapIcon },
      { to: "/historial", label: "Historial", icon: History },
      { to: "/portal", label: "Portal", icon: ClipboardList },
      { to: "/servicios", label: "Servicios", icon: ClipboardList },
      { to: "/inspecciones", label: "Inspecciones", icon: ClipboardCheck },
      { to: "/incidencias", label: "Incidencias", icon: AlertTriangle },
    ],
  },
  {
    label: "Flota",
    items: [
      { to: "/vehiculos", label: "Vehículos", icon: Truck },
      { to: "/gps", label: "Equipos GPS", icon: Radio },
      { to: "/conductores", label: "Conductores", icon: Users },
      { to: "/flotillas", label: "Flotillas", icon: Layers },
      { to: "/geocercas", label: "Geocercas", icon: Shield },
      { to: "/mantenimiento", label: "Mantenimiento", icon: Wrench },
      { to: "/combustible", label: "Combustible", icon: Fuel },
    ],
  },
  {
    label: "Administración",
    items: [
      { to: "/clientes", label: "Clientes", icon: Building2 },
      { to: "/usuarios", label: "Usuarios", icon: UsersRound },
      { to: "/enlaces", label: "Enlaces", icon: Link2 },
      { to: "/documentos", label: "Documentos", icon: FileText },
      { to: "/alertas", label: "Alertas", icon: AlertTriangle },
      { to: "/reportes", label: "Reportes", icon: FileBarChart },
      { to: "/finanzas", label: "Finanzas", icon: DollarSign },
      { to: "/notificaciones", label: "Avisos", icon: Bell },
      { to: "/respaldos", label: "Respaldos", icon: Database },
    ],
  },
];

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-1">
      <span className="grid size-8 place-items-center rounded-[8px] bg-primary text-primary-foreground">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
        </svg>
      </span>
      <span className="font-display text-lg font-semibold tracking-[0.2em]">SOTYGEO</span>
    </Link>
  );
}

function NavLinks({ role, onClick }: { role?: Role; onClick?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex flex-col gap-5">
      {GROUPS.map((group) => {
        const items = group.items.filter((i) => {
          return !!role && canOpenPath(role, i.to);
        });
        if (!items.length) return null;
        return (
          <div key={group.label}>
            <p className="mb-1.5 px-3 font-display text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
              {group.label}
            </p>
            <nav className="flex flex-col gap-0.5">
              {items.map((item) => {
                const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={onClick}
                    className={cn(
                      "flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm transition-colors duration-150",
                      active
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        );
      })}
    </div>
  );
}

function Notifications() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery<NotificationRow[]>({
    queryKey: ["notifications"],
    queryFn: () => listNotifications(),
  });
  const unread = items.filter((n) => n.status === "UNREAD").length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones">
          <Bell className="size-4" />
          {unread > 0 ? <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-destructive" /> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <p className="px-3 py-2 font-display text-xs tracking-[0.16em] text-muted-foreground uppercase">Alertas</p>
        {items.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Sin notificaciones</p>
        ) : (
          items.slice(0, 8).map((n) => (
            <DropdownMenuItem
              key={n.id}
              className="flex-col items-start gap-0.5"
              onSelect={() => {
                void markRead({ data: { id: n.id } });
                qc.setQueryData<NotificationRow[]>(["notifications"], (prev = []) =>
                  prev.map((x) => (x.id === n.id ? { ...x, status: "READ", read_at: new Date().toISOString() } : x)),
                );
              }}
            >
              <span className="text-sm">{n.title}</span>
              <span className="text-xs text-muted-foreground">{n.body}</span>
            </DropdownMenuItem>
          ))
        )}
        <Link to="/notificaciones" className="block px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
          Ver todas
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isPending } = useCurrentUserState();
  const display = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [sessionWaited, setSessionWaited] = useState(false);
  const gateSession = useSyncExternalStore(
    subscribeToNothing,
    hasGateSessionMarker,
    noGateSessionOnServer,
  );

  const publicPath =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/recuperar" ||
    pathname === "/restablecer" ||
    pathname === "/activate" ||
    pathname === "/verificar-correo" ||
    pathname.startsWith("/tracking");
  const driverPath = pathname.startsWith("/conductor");

  const {
    data: workspace = null,
    isPending: bootPending,
    isError: bootError,
    refetch: refetchBoot,
  } = useQuery({
    queryKey: ["bootstrap", user?.id],
    queryFn: getBootstrap,
    enabled: Boolean(user) && !publicPath,
    retry: 2,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!isPending) return;
    const t = window.setTimeout(() => setSessionWaited(true), 2500);
    return () => window.clearTimeout(t);
  }, [isPending]);

  const navigate = useNavigate();
  const role = workspace?.profile.role;
  useEffect(() => {
    if (!role || publicPath) return;
    const target = redirectTarget(role, pathname);
    if (target) void navigate({ to: target, replace: true });
  }, [role, pathname, publicPath, navigate]);

  if (publicPath) return <>{children}</>;

  // Mientras la sesión se resuelve NUNCA se redirige: `user: null` también significa
  // "cargando". Antes, tras 2.5 s se caía a <RedirectToSignIn /> y un arranque lento
  // devolvía al inicio de sesión aunque el login hubiera sido correcto.
  if (isPending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <span className="grid size-12 place-items-center rounded-[10px] bg-primary text-primary-foreground">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
          </svg>
        </span>
        <p className="font-display text-2xl font-semibold tracking-[0.28em] text-foreground">SOTYGEO</p>
        <p className="text-sm text-muted-foreground">
          {sessionWaited ? "La sesión tarda más de lo normal…" : "Cargando sesión…"}
        </p>
        {sessionWaited ? (
          <div className="flex flex-col items-center gap-2">
            <a href="/" className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
              Reintentar
            </a>
            <a href="/login" className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
              Ir a iniciar sesión
            </a>
          </div>
        ) : null}
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;

  if (bootPending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <span className="grid size-12 place-items-center rounded-[10px] bg-primary text-primary-foreground">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
          </svg>
        </span>
        <p className="font-display text-2xl font-semibold tracking-[0.28em] text-foreground">SOTYGEO</p>
        <p className="text-sm text-muted-foreground">Preparando tu centro de control…</p>
      </div>
    );
  }

  if (bootError || !workspace) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="font-display text-2xl font-semibold tracking-[0.28em] text-foreground">SOTYGEO</p>
        <p className="text-sm text-muted-foreground">No se pudo abrir tu empresa. Intenta de nuevo.</p>
        <Button onClick={() => void refetchBoot()}>Reintentar</Button>
      </div>
    );
  }

  if (driverPath) {
    return (
      <div className="min-h-screen bg-background">
        <header className="flex h-14 items-center justify-between border-b border-border px-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
              Centro de control
            </Link>
            <UserButton />
          </div>
        </header>
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="no-print hidden w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center px-4">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <NavLinks role={workspace?.profile.role} />
        </div>
        <div className="border-t border-sidebar-border p-4">
          <p className="font-display text-[11px] tracking-[0.18em] text-muted-foreground uppercase">Operador</p>
          <p className="mt-1 truncate text-sm">{workspace?.company.name ?? "—"}</p>
          <p className="text-xs text-muted-foreground">
            {workspace ? ROLE_LABEL[workspace.profile.role] : ""}
          </p>
          {workspace && canOpenPath(workspace.profile.role, "/conductor") ? (
            <Link
              to="/conductor"
              className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <Smartphone className="size-3" />
              App conductor
            </Link>
          ) : null}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-16 items-center justify-between gap-3 border-b border-border px-4 lg:px-6">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Menú">
              <Menu className="size-4" />
            </Button>
            <p className="hidden text-sm text-muted-foreground sm:block">
              Rastreo GPS · {workspace?.company.legal_name ?? "SOTYGEO"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Notifications />
            <div className="ml-2 flex items-center gap-2">
              <div className="hidden text-right sm:block">
                <p className="text-sm leading-tight">{display?.displayName ?? "Operador"}</p>
                <p className="text-xs text-muted-foreground">{display?.primaryEmail}</p>
              </div>
              <UserButton />
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex h-full flex-col bg-sidebar p-4">
          <div className="mb-4 shrink-0">
            <Logo />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 pb-4">
            <NavLinks role={workspace?.profile.role} onClick={() => setOpen(false)} />
          </div>
          {authEnabled && !gateSession ? (
            <div className="shrink-0 border-t border-sidebar-border pt-4">
              <Button
                variant="ghost"
                className="w-full justify-start text-destructive hover:bg-destructive/10"
                onClick={() => {
                  setOpen(false);
                  void signOut().catch(() => undefined);
                }}
              >
                Cerrar sesión
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
