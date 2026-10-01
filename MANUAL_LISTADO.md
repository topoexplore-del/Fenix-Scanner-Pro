# 🌐 Manual — Listado completo del mercado

Fenix evalúa cada noche **todo el LISTADO** (el mismo de tu Excel, 11.525
símbolos), no solo tus grupos.

| | Cuántos |
|---|---|
| LISTADO completo | 11.525 |
| Tus grupos (Watchlist, US Market, ETFs Globales…) | 1.173 (se calculan igual que siempre) |
| ETF apalancados o inversos excluidos (2X, 3X, UltraShort, Bear, Inverse, Daily Target…) | ~800 |
| **Activos adicionales evaluados** | **~9.600** |

## Misma lógica, otra forma de bajar los datos

Cada activo del listado pasa por **la misma función de AndFig** que tus grupos
(`get_stock_data`): Score, AI, estado ENTRY+/ENTRY/ACCUM/WAIT, grados, proyección,
Hessiana, señales, patrones y las **4 capas de alertas**. Lo único distinto es
cómo se descargan los datos:

- **Velas:** por lotes de 100 en vez de una por una, con la misma limpieza de
  velas vacías y la misma reconstrucción de la vela faltante.
- **Fundamentales** (P/E, ROE, ROA, EPS, márgenes, fechas de earnings): Yahoo
  los entrega con una consulta por activo y solo cambian cada trimestre. Fenix
  los guarda en una caché y cada noche renueva los 2.000 más antiguos.
  **Los activos que ese día quedan en ENTRY/ENTRY+ reciben fundamentales del
  mismo día**, así que las alertas siempre se evalúan con datos frescos.
- **RS (percentil) y las etiquetas Top gainers/losers** se calculan sobre el listado.

La primera semana la caché se va llenando (2.000 activos por noche, unas 5
noches para los ~9.600). Mientras tanto, el resto aparece con su nombre pero sin
P/E, ROE, etc. Esto no frena las alertas, porque los candidatos del día siempre
reciben sus fundamentales.

## Dónde verlo

- **Alertas (correo, Telegram, Historial, Excel del Seguimiento):** incluyen el
  listado automáticamente. Las del listado dicen grupo *🌐 Listado completo*.
- **Dashboard:** botón **🌐 Listado completo** junto al logo. Al pulsarlo:
  - el Radar agrega el grupo con los **300 de mayor Score** (dibujar 9.600 filas
    haría lento el navegador);
  - el **Screener** y el **buscador de ticker** buscan en todo el listado (ahí
    puedes ordenar y filtrar los 9.600 por cualquier métrica);
  - la casilla **"+ pestañas"** (aparece al cargarlo) suma el listado a Analysis, Entry Zones,
    Game Theory, Hessian, Markov, Laplace y Terminal (tarda unos segundos más).
- **App móvil:** recibe las alertas del listado; el grupo completo solo se ve en
  el escritorio (en el celular serían ~10 MB cada minuto).

## Qué cambia en la operación

- **Más alertas.** Tus grupos dan unas 6–7 por día; con un universo 9 veces
  mayor pueden ser varias decenas. Como pediste, **no hay filtro de liquidez**:
  pueden salir microcaps con poco volumen. Revisa *Avg Vol* en el Screener antes
  de operar.
- **Telegram:** si el mensaje supera el límite de Telegram (4.096 caracteres) se
  envía en varias partes (antes Telegram lo rechazaba entero con más de ~6 señales).
- **Tiempo:** el listado corre **en paralelo** con tus grupos, en otra máquina de
  GitHub. Todo termina en 1–2 horas y antes de la medianoche UTC.
- **Backtest:** sigue siendo solo de tus grupos. Para 11 mil activos pesaría
  ~400 MB, cuatro veces el límite de GitHub.
- **Guarda de salud propia:** si más del 10 % del listado queda sin la vela del
  día, ese listado no se publica y **sus** alertas no se usan esa noche. Tus
  grupos siguen normales.
- **Tamaño del repositorio:** `data/listado.json` pesa ~10 MB y se guarda cada
  noche. GitHub lo soporta; si con los meses el repositorio supera 1 GB, se
  puede limpiar el historial (no afecta al sistema).

## Ajustes (variables del workflow)

| Variable | Por defecto | Qué hace |
|---|---|---|
| `LISTADO_BUDGET_MIN` | 170 | Minutos máximos del listado |
| `LISTADO_FUND_POR_NOCHE` | 2000 | Fundamentales renovados por noche |
| `LISTADO_FUND_HILOS` | 4 | Consultas simultáneas a Yahoo (más = más rápido, pero más riesgo de bloqueo) |
| `LISTADO_MAX_STALE_PCT` | 10 | % máximo de activos sin la vela del día para publicar |
