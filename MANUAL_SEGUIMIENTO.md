# ⬇ Manual — Descarga del Seguimiento (Excel / CSV)

Descarga en un clic las filas de tu hoja **SEGUIMIENTO** (columnas **A → AY**)
para no tener que escribirlas a mano.

## Dónde está

Dashboard de escritorio → pestaña **📋 Historial** → barra naranja
**⬇ Seguimiento Excel/CSV**:

| Control | Opciones |
|---|---|
| **Qué** | **Señales del día** (las alertas cuya vela de señal es ese día) · **Movimientos del día** (señal, fill, TP1 o cierre ese día — útil para actualizar filas que ya tenías) · **Todo el historial** |
| **Día** | Por defecto, la última fecha con señales |
| **Formato** | **Excel (.xlsx)** (recomendado) · **CSV para Excel en español** (`;` y coma decimal) · **CSV estándar** (`,` y punto decimal) |

En el celular (app → Alertas) hay enlaces directos al CSV completo que el servidor
genera cada noche: `data/seguimiento_es.csv` y `data/seguimiento.csv`.

## Qué trae cada columna

El Excel tiene la misma fila de grupos (Temp 5 minutos, Temp 1 Hora, Hessian,
Markov…) y los mismos encabezados que tu hoja; en el CSV los encabezados
repetidos llevan prefijo (`5m Dis Ema 20`, `Markov Score`…).

| Columnas | Valor | De dónde sale |
|---|---|---|
| Ticket · Sector · Industry | Sector = "ETF" si la industria es *Exchange Traded Fund* | El mismo LISTADO de tu Excel (`data/universe.json`), con la misma regla de tus fórmulas |
| Fecha Señal · Fill · Cierre · $ Entrada · TP1 · TP2 · $ Stop Loss · $ Cierre · % Gan/Per · Estado | WIN, LOSS, PARCIAL TP1, ACTIVA, ESPERANDO FILL, SIN FILL, EXPIRADA | Historial del servidor. % como fracción (0,0697 = 6,97 %). $ Cierre = Entrada × (1 + %) |
| Temp 5 min / 1 Hora / 1 Día: Dis Ema 20 · Dis Ema 200 · Dif | **Dis Ema N = EMA_N − precio, en dólares** (negativo si el precio está por encima). **Dif = ABS(Dis Ema 20) − ABS(Dis Ema 200)** (tu fórmula) | Velas de 5 min, 1 h y diarias de Yahoo, al **cierre de la sesión de la señal** |
| Hessian: Clase · F_XX · F_YY · Det(h) · Curvatura · Señal | Local Min / Local Max / Saddle / Flat · Comprar / Evitar / Esperar / Neutral | Pestaña Hessian |
| Markov: Score · Estado / Signal · Absorcion · Estacionaria | ej. `Strong/Strong Buy`, 1 = 100 % | Pestaña Markov con **5 periodos** |
| Game Theory: Nash · Composite · R/R · Fase · Nash Esquilibrium | Nash = P(↑) (0,94 = 94 %) | Pestaña Game Theory, **Equilibrio Nash · Semanal** |
| Entry Zones: Prob · Upside · 20D · Calidad | fracciones (0,9478 = 94,78 %) | Pestaña Entry Zones, **Semanal** |
| Analysis: Roe · Roa · Eps · Calidad · Riesgo/deuda | **Roe = ROE relativo al promedio del sector** (tarjeta "ROE +x" de Contexto Sectorial). En ETF: "ETF" y el resto vacío | Pestaña Analysis |
| Laplace: Tendencia · Estabilidad · Eariness · Lp Score · Señal | ej. `Bullish`, `Oscillating`, `Tardio (35)`, `buy` | Pestaña Laplace con **s = 0,3** |

Las alertas del **🌐 Listado completo** también entran (con su fila del listado
de ese día). Para ellas, la columna **Roe** usa el promedio del sector de tus
grupos, que es lo que muestra la pestaña Analysis por defecto.

### Los valores son los del DÍA DE LA SEÑAL

Cada noche, cuando nace una alerta, Fenix guarda la fila del snapshot de ese día
(`data/seguimiento.json`). Así el Excel muestra lo que las pestañas mostraban el
día de la señal, aunque lo descargues semanas después. Las fórmulas son copia
literal de las pestañas (`fenix_params.js`): una prueba automática comparó el
Excel descargado con lo que muestra cada pestaña y coincidieron los 324 valores.

Las alertas antiguas (julio–septiembre) se rellenaron con el historial de
snapshots de AndFig: 323 de 325 tienen parámetros. Las 2 restantes (EWZ del 21/09
y NVDA del 28/09) nacieron en noches en que el snapshot quedó sin precio para ese
ticker.

## Cómo pegarlo en tu base de datos

1. Descarga **Excel (.xlsx)** del día.
2. Copia desde la fila 3 (los datos) columnas **A → AY**.
3. En tu hoja SEGUIMIENTO, pega en la primera fila libre, columna A
   (*Pegado especial → Valores* si quieres conservar tus formatos).
4. Tus columnas **AZ en adelante** (Señal con/sin EMAs, Patrón 1/2, Score, Semáforo,
   Anti-repetición) siguen calculándose solas: todos los textos que usan
   ("Acumulación", "Señal máxima", "Bullish", "Temprano", "Oscillating",
   "Strong/"…) salen escritos igual.

> Tus columnas B, C, K, P, S y V tienen fórmulas. El archivo trae esos valores ya
> calculados con la misma regla; si prefieres conservar tus fórmulas, pega solo
> las demás columnas.

## Cambios en los resultados de alertas antiguas

AndFig contaba el fill en la vela de la propia señal cuando el seguimiento corría
esa misma noche (imposible: la alerta llega después del cierre). En la primera
corrida, Fenix re-evalúa esas 197 alertas con la regla correcta (fill desde la
sesión siguiente). Por eso algunas filas antiguas pueden cambiar de estado (por
ejemplo, un WIN que en realidad no alcanzó a llenarse queda como SIN FILL). En el
Historial cada una muestra el resultado original de AndFig al lado (🔁 AndFig: …).

## Limitaciones

- **5 minutos:** Yahoo solo guarda ~60 días. Las alertas anteriores a principios de
  agosto de 2026 no tienen esa columna; las nuevas se calculan la misma noche.
- Las distancias EMA se miden al cierre de la sesión de la señal. Si tú las mides
  en otro momento (por ejemplo al día siguiente) habrá diferencias.
- Si una alerta nace en la corrida intradía y la vela de la señal ya no está en el
  snapshot, el botón usa la fila del snapshot abierto solo cuando su vela coincide
  con la de la señal; si no, esas columnas quedan vacías.
