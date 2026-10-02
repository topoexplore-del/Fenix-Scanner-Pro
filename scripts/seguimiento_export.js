#!/usr/bin/env node
/*
 * FENIX SCANNER PRO — exporta el Seguimiento completo a CSV (workflows).
 *   data/seguimiento.csv     → CSV estándar (coma, punto decimal, UTF-8)
 *   data/seguimiento_es.csv  → CSV para Excel en español (punto y coma, coma decimal)
 * Usa fenix_params.js: exactamente las mismas fórmulas que el botón de
 * descarga del Historial y que las pestañas del dashboard.
 *
 * Los parámetros de las pestañas son los del DÍA DEL FILL (sin fill → vacíos).
 *
 * Uso: node scripts/seguimiento_export.js [--dia AAAA-MM-DD] [--modo fills|senales|movimientos|todo]
 *                                         [--param fill|senal]
 */
const fs = require("fs");
const path = require("path");
const BASE = path.dirname(__dirname);
const F = require(path.join(BASE, "fenix_params.js"));

function load(name, def) {
  try { return JSON.parse(fs.readFileSync(path.join(BASE, "data", name), "utf8")); }
  catch (e) { return def; }
}
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const hist = load("alerts_history.json", { alerts: [] });
const seg = load("seguimiento.json", { rows: {} });
const mode = arg("--modo", "todo");
const day = arg("--dia", null);
const table = F.buildTable(hist, seg, mode, day, { paramDia: arg("--param", "fill") });
fs.writeFileSync(path.join(BASE, "data", "seguimiento.csv"), F.toCSV(table, "std"));
fs.writeFileSync(path.join(BASE, "data", "seguimiento_es.csv"), F.toCSV(table, "es"));
const withParams = table.filter(r => r[F.COLUMNS.findIndex(c => c[0] === "mk_score")] != null).length;
console.log(`Seguimiento: ${table.length} filas (${withParams} con parámetros de pestañas) → data/seguimiento.csv, data/seguimiento_es.csv`);
