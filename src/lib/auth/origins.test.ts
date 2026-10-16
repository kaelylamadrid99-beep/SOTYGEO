import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAuthOrigins, isAllowedAuthOrigin, toOrigin } from "./origins.ts";

test("toOrigin normaliza URL, host desnudo, slash final y mayúsculas", () => {
  assert.equal(toOrigin("https://App.Example.com/"), "https://app.example.com");
  assert.equal(toOrigin("app.example.com"), "https://app.example.com");
  assert.equal(toOrigin("https://app.example.com/login?x=1"), "https://app.example.com");
  assert.equal(toOrigin("http://localhost:8080"), "http://localhost:8080");
  assert.equal(toOrigin(""), null);
  assert.equal(toOrigin("javascript:alert(1)"), null);
});

test("producción: confía en la URL pública y en el dominio de producción de Vercel", () => {
  const { trustedOrigins } = buildAuthOrigins(
    {
      BETTER_AUTH_URL: "https://sotygeo.mx/",
      VERCEL_PROJECT_PRODUCTION_URL: "sotygeo.vercel.app",
      VERCEL_URL: "sotygeo-abc123.vercel.app",
      VERCEL_BRANCH_URL: "sotygeo-git-main.vercel.app",
    },
    { production: true },
  );
  assert.ok(trustedOrigins.includes("https://sotygeo.mx"));
  assert.ok(trustedOrigins.includes("https://sotygeo.vercel.app"));
});

test("producción: APP_ORIGINS añade dominios extra (www, segundo dominio)", () => {
  const { trustedOrigins } = buildAuthOrigins(
    { BETTER_AUTH_URL: "https://sotygeo.mx", APP_ORIGINS: "https://www.sotygeo.mx, flota.example.com" },
    { production: true },
  );
  assert.ok(trustedOrigins.includes("https://www.sotygeo.mx"));
  assert.ok(trustedOrigins.includes("https://flota.example.com"));
});

test("producción: NO confía en previews/deployments ni comodines", () => {
  const { trustedOrigins, allowedHosts } = buildAuthOrigins(
    {
      BETTER_AUTH_URL: "https://sotygeo.mx",
      VERCEL_PROJECT_PRODUCTION_URL: "sotygeo.vercel.app",
      VERCEL_URL: "sotygeo-abc123.vercel.app",
      VERCEL_BRANCH_URL: "sotygeo-git-main.vercel.app",
    },
    { production: true },
  );
  assert.ok(!trustedOrigins.some((o) => o.includes("*")), "sin comodines en producción");
  assert.ok(!trustedOrigins.includes("https://sotygeo-abc123.vercel.app"));
  assert.ok(!trustedOrigins.includes("https://sotygeo-git-main.vercel.app"));
  assert.ok(!trustedOrigins.includes("http://localhost:8080"));
  assert.ok(!allowedHosts.some((h) => h.includes("*")));
});

test("desarrollo: añade loopback y hosts del sandbox", () => {
  const { trustedOrigins, allowedHosts } = buildAuthOrigins({}, { production: false });
  assert.ok(trustedOrigins.includes("http://localhost:8080"));
  assert.ok(trustedOrigins.includes("http://127.0.0.1:8080"));
  assert.ok(trustedOrigins.includes("https://*.vusercontent.net"));
  assert.ok(allowedHosts.includes("localhost"));
});

test("sin duplicados", () => {
  const { trustedOrigins } = buildAuthOrigins(
    { BETTER_AUTH_URL: "https://a.com", APP_URL: "https://a.com/", VERCEL_URL: "a.com" },
    { production: true },
  );
  assert.deepEqual(trustedOrigins, ["https://a.com"]);
});


test("isAllowedAuthOrigin usa los mismos límites: wildcard solo en no producción", () => {
  const preview = buildAuthOrigins({}, { production: false });
  assert.equal(isAllowedAuthOrigin("https://abc.grok-sandbox.com", preview), true);
  assert.equal(isAllowedAuthOrigin("https://evil.example", preview), false);
  const production = buildAuthOrigins({ BETTER_AUTH_URL: "https://sotygeo.mx" }, { production: true });
  assert.equal(isAllowedAuthOrigin("https://sotygeo.mx", production), true);
  assert.equal(isAllowedAuthOrigin("https://abc.vercel.app", production), false);
  assert.equal(isAllowedAuthOrigin("http://sotygeo.mx", production), false);
});

test("producción: cualquier origin HTTP configurado se rechaza por hardening", () => {
  const { trustedOrigins } = buildAuthOrigins(
    { BETTER_AUTH_URL: "https://sotygeo.mx", APP_ORIGINS: "http://sotygeo.mx" },
    { production: true },
  );
  assert.ok(trustedOrigins.includes("http://sotygeo.mx"));
  // The builder preserves the configured value for diagnostics; server.ts
  // refuses to boot production auth when any trusted origin is HTTP.
});
