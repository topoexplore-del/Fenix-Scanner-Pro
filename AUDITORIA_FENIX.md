# 🔍 Auditoría de AndFig Scanner Pro v18 → Fenix Scanner Pro v1.0

**Fecha:** 30 de septiembre de 2026 · **Alcance:** descubrir por qué AndFig no está
generando todos los datos, corregir solo lo que está mal y agregar la descarga
diaria del seguimiento. **No se cambió ninguna combinación de señales**: Score,
AI, estados (ENTRY+/ENTRY/ACCUM/WAIT), grados, proyección, Hessiana, las 4 capas
de alertas, zonas de entrada/TP/SL, backtest y las fórmulas de todas las pestañas
son exactamente las de AndFig. Fenix no tiene nada que ver con Alba.

---

## 1. Por qué AndFig no genera todos los datos

### Causa principal: la última vela llega vacía y nadie la limpia

Desde el **14 de septiembre** Yahoo Finance entrega la vela del día con el precio
vacío (`NaN`) cuando se descarga **después de las 00:00 UTC** (7:00 p. m. de
Colombia). El workflow diario estaba programado a las **21:30 UTC**, pero GitHub lo
arranca con retraso y la corrida tarda 1–2 horas, así que casi todas las descargas
terminaron cayendo después de la medianoche UTC.

`build_data.py` de AndFig no limpiaba esas velas: tomaba el `NaN` como cierre y
toda la fila se caía. Eso es exactamente lo de tu captura: **$—, AI —, 1D/5D/20D —,
TARGET —, SC 0/15/30 y estado WAIT**.

Filas sin precio en cada snapshot publicado (del historial real del repositorio):

| Snapshot publicado (UTC) | Sesión | Filas sin precio |
|---|---|---|
| 10/09 23:44 | 10/09 | 0 % |
| 11/09 23:44 | 11/09 | 0 % |
| 15/09 00:18 | 14/09 | **83,6 %** |
| 15/09 23:59 | 15/09 | 0 % |
| 17/09 00:09 | 16/09 | **27,9 %** |
| 18/09 23:48 | 18/09 | 0 % ← última actualización sana |
| 22/09 00:39 | 21/09 | **97,7 %** |
| 23/09 00:06 | 22/09 | **11,0 %** |
| 24/09 00:18 | 23/09 | **60,9 %** |
| 25/09 00:19 | 24/09 | **84,3 %** |
| 26/09 00:22 | 25/09 | **92,2 %** |
| 29/09 01:29 | 28/09 | **89,3 %** |
| 30/09 00:59 | 29/09 | **97,3 %** ← tu captura |

### Efectos en cadena que se veían en el dashboard

| Lo que veías | Por qué pasaba |
|---|---|
| RS = 0 en todas las filas | La vela vacía del **SPY** dejaba la fuerza relativa en `NaN` para todo el universo y el ranking la convertía en 0 (las 1.123 filas del 29/09). El 29/09 el régimen era BULL y eso no afectó las alertas, pero en régimen NEUTRAL el filtro RS ≥ 60 habría bloqueado **todas**. |
| Una misma acción en *Top gainers* y *Top losers* | Con 97 % de filas sin precio quedaban menos de 20 filas válidas y las dos listas se solapaban. |
| Pestañas Markov, Laplace, Game Theory con valores en filas sin precio | Las fórmulas usan valores por defecto (`rsi‖50`, `20d‖0`…) cuando falta el dato: **parámetros que no son reales**. |
| Señales reales que desaparecían | Una fila sin precio nunca pasa la capa Radar: esas noches no hubo alertas aunque sí había setups. |

### Otras fallas encontradas

1. **El grupo 🇭🇰 Hong Kong siempre salía vacío.** `yf_symbol` convertía
   `0700.HK` en `0700-HK`, que Yahoo no reconoce. Los 10 tickers nunca se descargaron.
2. **El Historial contaba fills imposibles.** La alerta nace al **cierre** de la vela
   de la señal, pero cuando el seguimiento corría esa misma noche la única vela
   descargada era la de la señal y se usaba para el fill. **197 de 325 alertas**
   tienen el fill en la vela de la propia señal; **84 de los 115 WIN** son de ese
   grupo. Las estadísticas del Historial (38,6 % de acierto, +4,74 % / −3,56 %) no
   son confiables.
3. **Hessian inventada.** Cuando una fila no traía Hessiana, la pestaña la rellenaba
   con `Math.random()`: valores distintos en cada recarga.
4. **Backtest Hessian "de estimación".** Sin `backtest.json`, la pestaña generaba
   operaciones pseudoaleatorias con aspecto de resultados.
5. **Alertas sobre datos viejos.** Si la actualización fallaba, `check_alerts.py`
   evaluaba igual el snapshot que hubiera en disco.

---

## 2. Qué se corrigió en Fenix (solo integridad del dato)

| # | Corrección | Archivo |
|---|---|---|
| 1 | Toda descarga pasa por `_clean_ohlc`: se descartan velas vacías o corruptas | `build_data.py`, `track_alerts.py` |
| 2 | Si un ticker de EEUU no trae la vela de la sesión de referencia (la del SPY), se **reconstruye** con velas de 30 min (o Finnhub si configuras `FINNHUB_KEY`) | `build_data.py` |
| 3 | **Guarda de salud**: si más del 5 % del universo queda sin la vela de la sesión, el snapshot **no se publica** (se conserva el último sano) y `data/health.json` queda en FAILED | `build_data.py` |
| 4 | Sin datos sanos no se evalúan alertas | `check_alerts.py` |
| 5 | Horario nuevo 16:20 ET (dos crons por el cambio de hora) + **respaldo** a las 06:17/07:17 ET solo si la noche falló + las dos automatizaciones ya no corren a la vez | `.github/workflows/*` |
| 6 | `0700.HK` se conserva: el grupo Hong Kong vuelve a tener datos | `build_data.py`, `track_alerts.py`, `check_alerts.py` |
| 7 | El fill solo cuenta desde la sesión **siguiente** a la señal. Las 197 alertas afectadas se re-evalúan una sola vez y su resultado original queda guardado (`andfig_original`) y visible en el Historial | `track_alerts.py` |
| 8 | Se eliminó el relleno aleatorio de la Hessian y del Backtest Hessian | `index.html` |
| 9 | Markov, Laplace, Game Theory, Entry Zones y Hessian ignoran filas sin precio (antes las calculaban con valores por defecto) | `index.html` |
| 10 | Indicador de salud junto al logo: 🩺 OK · % · vela de referencia | `index.html`, `movil.html` |

### Prueba de que la lógica no cambió

Con los mismos datos de mercado (sin velas vacías), el `build_data.py` original de
AndFig y el de Fenix producen **exactamente los mismos valores** en las 286 filas
comparadas (todos los campos: score, AI, estado, grados, target, Hessiana, señales,
RS…). Con 30 % de velas vacías simuladas, AndFig deja 79 filas sin precio; Fenix
reconstruye 73 y marca como desactualizadas las 6 que no pudo reparar (2,1 %, bajo
el umbral del 5 %).

---

## 3. Lo nuevo: descarga diaria del Seguimiento (Excel / CSV)

En **📋 Historial** hay una barra **⬇ Seguimiento Excel/CSV** que descarga las
columnas **A → AY** de tu hoja `SEGUIMIENTO` con el mismo orden, encabezados y
formatos (fechas dd/mm/aaaa, $, %). Detalle en `MANUAL_SEGUIMIENTO.md`.

**Cómo se validó:**

- Contra las pestañas del dashboard: **324 de 324** valores iguales (prueba
  automática que abre cada pestaña y compara con el Excel descargado).
- Contra tu propia hoja: en las **161 filas que registraste el mismo día de la
  señal**, coinciden Markov (158–161/161), Game Theory (159–161/161), Entry Zones
  (157–161/161), Laplace (157–161/161) y Hessian (21–22/22). Las diferencias
  restantes son días en que registraste con datos de otra sesión o errores de
  digitación, por ejemplo:
  - MNST 30/07 · 20D: escrito 0,3 → valor real 0,003
  - SCHD 04/08 · Prob: escrito 0,0775 → valor real 0,7375
  - WTS 06/08 · Roe: escrito −0,34 → valor real −3,4
  - PBYI 01/09 · Roe: escrito −28,7 → valor real +28,7
  - Desde el 03/09 la columna *Prob* se escribió como 78,75 en vez de 0,7875.
- Descubrimiento: tu columna **Roe** es el ROE **relativo al promedio del sector**
  (la tarjeta de Contexto Sectorial: "ROE +x"), no el ROE absoluto. El Excel usa
  ese mismo valor (coincide en 140 de 146 filas).

**Distancias a las EMA (Temp 5 min / 1 hora / 1 día):** tus valores corresponden a
`EMA − precio` **en dólares** (negativos cuando el precio está por encima de la
EMA). Fenix los calcula al cierre de la sesión de la señal. Yahoo solo guarda 60
días de velas de 5 minutos: las alertas anteriores a principios de agosto no
pueden tener la columna de 5 min.

---

## 4. Ampliación (1 de octubre): listado completo del mercado

A pedido, Fenix evalúa también los **~9.600 activos restantes del LISTADO**
(11.525 menos tus 1.173 y menos ~800 ETF apalancados/inversos), con la misma
`get_stock_data()` y las mismas 4 capas de alertas, sin filtro de liquidez.
Velas por lotes, fundamentales en caché con renovación diaria (los que quedan en
ENTRY/ENTRY+ se actualizan el mismo día) y ejecución en paralelo con tus grupos.
Detalle en `MANUAL_LISTADO.md`.

De paso se corrigió un fallo de AndFig que con más señales sería frecuente:
**Telegram rechaza mensajes de más de 4.096 caracteres** y AndFig mandaba todas
las señales en uno solo (con más de ~6 señales no llegaba nada). Ahora se divide
en varias partes.

## 5. Lo que queda igual a propósito

- Todas las reglas de señal y de alertas de AndFig (4 capas, zonas ATR, régimen,
  blackout de earnings, deduplicación).
- Las fórmulas de las pestañas (Markov, Laplace, Game Theory, Entry Zones,
  Analysis, Hessian) y sus valores por defecto.
- El backtest clásico (se sigue calculando cada noche, como en AndFig).
- La estructura de archivos, la app móvil y los manuales de uso.

⚠️ Información educativa. No es asesoría financiera ni recomendación de inversión.
