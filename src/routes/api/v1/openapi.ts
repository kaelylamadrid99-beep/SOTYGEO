import { createFileRoute } from "@tanstack/react-router";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "SOTYGEO API",
    version: "1.0.0",
    description: "API versionada de rastreo GPS y gestión de flotas.",
  },
  servers: [{ url: "/api/v1" }],
  paths: {
    "/auth": { post: { summary: "Sesión (Better Auth en /api/auth)", responses: { "200": { description: "OK" } } } },
    "/users": { get: { summary: "Usuarios y personal", responses: { "200": { description: "OK" } } } },
    "/clients": { get: { summary: "Clientes", responses: { "200": { description: "OK" } } } },
    "/vehicles": { get: { summary: "Vehículos", responses: { "200": { description: "OK" } } } },
    "/gps": { get: { summary: "Equipos GPS", responses: { "200": { description: "OK" } } } },
    "/gps/ingest": {
      post: {
        summary: "Ingesta de posición de dispositivo externo",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  imei: { type: "string" },
                  token: { type: "string" },
                  latitude: { type: "number" },
                  longitude: { type: "number" },
                  speed: { type: "number" },
                  heading: { type: "number" },
                },
                required: ["imei", "token", "latitude", "longitude"],
              },
            },
          },
        },
        responses: { "200": { description: "OK" }, "400": { description: "Error" } },
      },
    },
    "/drivers": { get: { summary: "Conductores", responses: { "200": { description: "OK" } } } },
    "/fleets": { get: { summary: "Flotillas", responses: { "200": { description: "OK" } } } },
    "/geofences": { get: { summary: "Geocercas", responses: { "200": { description: "OK" } } } },
    "/tracking": { get: { summary: "Monitor en vivo", responses: { "200": { description: "OK" } } } },
    "/routes": { get: { summary: "Historial de rutas", responses: { "200": { description: "OK" } } } },
    "/inspections": { get: { summary: "Inspecciones", responses: { "200": { description: "OK" } } } },
    "/reports": { get: { summary: "Reportes", responses: { "200": { description: "OK" } } } },
    "/notifications": { get: { summary: "Notificaciones", responses: { "200": { description: "OK" } } } },
    "/backups": { get: { summary: "Respaldos", responses: { "200": { description: "OK" } } } },
  },
};

export const Route = createFileRoute("/api/v1/openapi")({
  server: {
    handlers: {
      GET: () => Response.json(spec),
    },
  },
});
