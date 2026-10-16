import assert from "node:assert/strict";
import test from "node:test";
import { clientIpFromHeaders } from "./client-ip.ts";

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

test("prefiere la cabecera de la plataforma sobre x-forwarded-for", () => {
  assert.equal(clientIpFromHeaders(h({ "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "9.9.9.9" })), "1.1.1.1");
  assert.equal(clientIpFromHeaders(h({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "9.9.9.9" })), "2.2.2.2");
});

test("toma el primer valor de x-forwarded-for", () => {
  assert.equal(clientIpFromHeaders(h({ "x-forwarded-for": "3.3.3.3, 4.4.4.4" })), "3.3.3.3");
});

test("sin cabeceras, el bucket se separa por user-agent (no un único 'unknown')", () => {
  assert.notEqual(clientIpFromHeaders(h({ "user-agent": "a" })), clientIpFromHeaders(h({ "user-agent": "b" })));
});
