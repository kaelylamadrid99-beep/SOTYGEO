import { createFileRoute } from "@tanstack/react-router";
import { getSessionUser } from "@/lib/auth/verify.server";
import { getSql } from "@/lib/db";
import { canSeeScopedVehicle, getAccessScope } from "@/lib/sotygeo/security/scope";
import { ForbiddenError, clientVehicleView, getResourceScope, hasPermission } from "@/lib/sotygeo/security/permissions";
import { getWorkspace } from "@/lib/sotygeo/workspace";

export const Route = createFileRoute("/api/v1/vehicles")({
  server: {
    handlers: {
      GET: async () => {
        const user = await getSessionUser();
        if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        const ws = await getWorkspace(user.id);
        const scope = await getAccessScope(ws.profile);
        if (!hasPermission(scope, "vehicles.read")) return new Response(JSON.stringify({ error: new ForbiddenError("vehicles.read").message }), { status: 403 });
        const sql = await getSql();
        const rows = await sql<{
          id: string;
          client_id: string | null;
          current_driver_id: string | null;
        }>`
          select * from vehicles where company_id = ${ws.company.id} order by economic_number
        `;
        const visible = rows.filter((v) => canSeeScopedVehicle(scope, v));
        // LIMITED_CLIENT: proyección segura (nunca vin, odómetro, conductor, GPS interno…).
        const data = getResourceScope(scope, "vehicles") === "LIMITED_CLIENT" ? visible.map((v) => clientVehicleView(v)) : visible;
        return Response.json({ data });
      },
    },
  },
});
