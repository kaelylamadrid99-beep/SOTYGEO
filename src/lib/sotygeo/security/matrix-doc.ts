import { CATALOG, ROLE_GRANTS, type Resource } from "./permissions.ts";
import type { Role } from "../types.ts";

const ROLES: Role[] = ["ADMIN", "OPERADOR", "SUPERVISOR", "CONDUCTOR", "CLIENTE"];

export function matrixMarkdown(): string {
  const L: string[] = [
    "# Matriz de roles, permisos y scopes",
    "",
    "> **Generado** desde `src/lib/sotygeo/security/permissions.ts` con `node --experimental-strip-types scripts/gen-matrix.ts`.",
    "> No editar a mano: el test `tests/authz.test.ts` falla si este archivo difiere del código.",
    "",
    "Formato de celda: `acciones @ SCOPE`. Celda vacía = sin permiso (deny-by-default).",
    "Scopes: COMPANY · OWN · ASSIGNED · CLIENT · LIMITED_CLIENT.",
    "",
    `| Recurso | ${ROLES.join(" | ")} |`,
    `|---|${ROLES.map(() => "---").join("|")}|`,
  ];
  for (const res of Object.keys(CATALOG) as Resource[]) {
    const cells = ROLES.map((r) => {
      const gr = ROLE_GRANTS[r][res];
      return gr ? `${gr.actions.join(", ")} @ ${gr.scope}` : "";
    });
    L.push(`| ${res} | ${cells.join(" | ")} |`);
  }
  L.push("", "## Permisos del catálogo que NO se conceden a ningún rol", "");
  const granted = new Set(ROLES.flatMap((r) => Object.entries(ROLE_GRANTS[r]).flatMap(([res, g]) => g!.actions.map((a) => `${res}.${a}`))));
  const none = Object.entries(CATALOG).flatMap(([res, acts]) => acts.map((a) => `${res}.${a}`)).filter((p) => !granted.has(p));
  for (const p of none) L.push(`- \`${p}\``);
  L.push("", "`pod.delete` (evidencia inmutable), `permissions.manage` (los permisos no se editan en runtime) y `security.manage` (no existe en el catálogo) quedan denegados para todos.", "");
  return L.join("\n");
}
