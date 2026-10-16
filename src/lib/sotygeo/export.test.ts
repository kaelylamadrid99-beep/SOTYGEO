import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml, toCsv, toExcelXml } from "./export.ts";

// Regresión (Plan Maestro Fase 7): ningún valor que salga de la base de datos
// puede llegar sin escapar al HTML de impresión/PDF de reportes.
test("escapeHtml neutraliza inyección de etiquetas y atributos", () => {
  assert.equal(escapeHtml("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(escapeHtml('"><img src=x onerror=alert(1)>'), "&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
  assert.equal(escapeHtml("O'Brien"), "O&#39;Brien");
  assert.equal(escapeHtml("&amp;"), "&amp;amp;");
  assert.equal(escapeHtml(""), "");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(42), "42");
});

test("toCsv escapa comillas dobles", () => {
  assert.equal(toCsv(["a"], [['x"y']]).trim().split("\n")[1], '"x""y"');
});

test("toExcelXml escapa celdas con XML/HTML", () => {
  const xml = toExcelXml("Hoja", ["col"], [["<b>&"]]);
  assert.ok(xml.includes("&lt;b&gt;&amp;amp;") || xml.includes("&lt;b&gt;"));
  assert.ok(!xml.includes("<b>"));
});
