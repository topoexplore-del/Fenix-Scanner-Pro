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

### Corrección del 1 de octubre: distancias a las EMA en el fill

La primera versión del Excel medía las distancias EMA **al cierre del día de la
señal**. Lo correcto, según tu método, es medirlas **en el fill**: el primer
encuentro del precio con el nivel de entrada el día del fill, en cada
temporalidad, con la EMA de esa vela. Fenix ahora replica tu script "Nivel →
EMAs + POC (v3)" (toque, gap de apertura, gap intradía o aproximación), deja vacías
las alertas sin fill y agrega al Excel una hoja de verificación con la misma
tabla del script. Ejemplo ASC (señal 30/09, fill 01/10 a 18,48): el Excel anterior
daba 5 min −0,01 / −0,18 (cierre del 30/09); tu script marca +0,16 / −0,01 en el
toque de las 09:30, y ese es el punto que ahora mide Fenix.

## 5. Auditoría de los patrones del Screener (1 de octubre)

Los patrones chartistas del Screener se detectaban y dibujaban con errores (líneas que el precio atravesaba, figuras alcistas y bajistas a la vez en el mismo activo, figuras de giro sin tendencia que revertir, cuellos fuera de su sitio, objetivo fuera del gráfico). Se corrigieron el detector y el dibujo. Los patrones **no intervienen** en el Score, el AI, los estados ni las alertas, así que la lógica de señales de AndFig sigue intacta. Detalle, cifras y ejemplos en `AUDITORIA_PATRONES.md`.

## 6. Correcciones del 2 de octubre

**Parámetros de las pestañas: del día del fill.** El Excel traía Hessian, Markov,
Game Theory, Entry Zones, Analysis y Laplace del día en que apareció la señal.
Como en Fenix el fill solo cuenta desde la sesión siguiente, esos valores no
coincidían con lo que muestran las pestañas la noche del fill. Ahora salen de la
fila del snapshot del día del fill; sin fill quedan vacíos, igual que las
distancias EMA. Comprobado con los fills del 01/10 sobre los datos reales: 54
valores comparados contra las pestañas, 54 iguales. De las 284 alertas con fill,
270 quedan con el dato; 14 tuvieron el fill en noches en que AndFig publicó el
snapshot sin precios. Detalle en `MANUAL_SEGUIMIENTO.md`.

**Pocas señales del listado completo.** El listado sí se evalúa completo cada
noche (9.281 activos el 01/10, 163 de ellos en ENTRY/ENTRY+), pero solo dio una
señal. Causa: los fundamentales se pedían a Yahoo con 4 consultas simultáneas y
Yahoo bloqueó la máquina tras unas 600; los candidatos del día, que se
consultaban al final, quedaron sin datos (solo 18 de 163 los tenían) y sin
fundamentales no se pueden pasar las capas Analysis ni Game Theory. Ahora los
candidatos se consultan primero, de a uno, con pausas y reintentos, y un bloqueo
ya no se confunde con "activo sin datos". Además se sube el tope de velas
reconstruidas: el 01/10 GitHub arrancó la corrida programada hacia las 23:52 UTC
(más de 2,5 horas tarde), pasó la medianoche UTC, y 694 activos del listado
quedaron sin la vela del día y no se evaluaron. Detalle en `MANUAL_LISTADO.md`.

## 7. COMBOS y WIN%DIA (2 de octubre)

Dos pestañas nuevas que evalúan cada día, sobre todo el universo (tus grupos + el
listado completo), los combos 3, 11, 12, 14, 15 y 16 del informe de auditoría del
Excel. Detalle en [MANUAL_COMBOS.md](MANUAL_COMBOS.md).

**Qué se añadió.** `fenix_combos.js` (motor), `fenix_combos_ui.js` (pestañas),
`scripts/combos.js` y `scripts/combos_ema5.py` (proceso de cada actualización), un paso
en `refresh_data.yml` y cuatro cambios en `index.html` (dos botones, dos vistas, una
línea en el cambio de pestaña y tres etiquetas de script). Ningún archivo de datos
existente se modifica.

**Hallazgo de la auditoría previa.** El listado completo no incluye los 1.133 tickets
de tus grupos: el universo real son las dos fuentes juntas (10.414 tickets el 01/10).
De los 117 tickets con alertas, 116 están en tus grupos.

**Comprobaciones hechas:**

| Prueba | Resultado |
|---|---|
| El motor, sobre las 322 filas de tu Excel, reproduce las muestras del punto 8 | 6 de 6 combos iguales (37, 17, 14, 8, 9 y 9 cerradas) |
| Combo 12 frente a tu columna PATRON 1 = ENTRAR | 322 filas, 0 diferencias |
| Parámetros de COMBOS frente al Excel de Seguimiento (mismos tickets y días) | 279 valores, 0 diferencias |
| Combos de cada ticket, recalculados con un programa independiente | 10.484 + 10.414 tickets, 0 diferencias |
| Estadísticas y Calidad por combo, recalculadas aparte | iguales |
| Evaluados + excluidos = universo | 9.699 + 709 + 4 + 2 = 10.414 |
| Tickets duplicados | ninguno |
| Cierre anterior coherente con el % diario | 100 % de los tickets |
| Pantalla frente a servidor, y filtros (combo, resultado, sector, ticket, universo) | iguales |
| Archivos de datos existentes antes y después de correr | sin cambios |
| Errores de JavaScript al recorrer todas las pestañas | ninguno |

**Lo que no se pudo probar aquí.** La descarga real de velas de 5 minutos de Yahoo
(combo 15): el cálculo se probó con velas simuladas y coincide con la EMA hecha a mano.
La mecánica de varios días (rotación, sesión saltada, noche sin listado) se probó con
sesiones simuladas; con datos reales solo existe el par 30/09 → 01/10.

## 8. Lo que queda igual a propósito

- Todas las reglas de señal y de alertas de AndFig (4 capas, zonas ATR, régimen,
  blackout de earnings, deduplicación).
- Las fórmulas de las pestañas (Markov, Laplace, Game Theory, Entry Zones,
  Analysis, Hessian) y sus valores por defecto.
- El backtest clásico (se sigue calculando cada noche, como en AndFig).
- La estructura de archivos, la app móvil y los manuales de uso.

⚠️ Información educativa. No es asesoría financiera ni recomendación de inversión.
