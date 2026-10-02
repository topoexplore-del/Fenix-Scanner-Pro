# 🔥 Fenix Scanner Pro v1.0

**AndFig Scanner Pro v18 con los datos arreglados + descarga diaria del Seguimiento.**
Fenix conserva exactamente la lógica de AndFig (Score, AI, estados, 4 capas de
alertas, zonas, pestañas, backtest) y corrige por qué el sistema dejó de generar
todos los datos. No tiene relación con Alba.

> El nombre: el fénix renace de sus cenizas. AndFig estaba publicando snapshots
> con hasta 97 % de filas vacías; Fenix es el mismo sistema, completo otra vez.

| Documento | Para qué |
|---|---|
| **[AUDITORIA_FENIX.md](AUDITORIA_FENIX.md)** | Por qué AndFig no generaba todos los datos, qué se corrigió y cómo se validó |
| **[AUDITORIA_PATRONES.md](AUDITORIA_PATRONES.md)** | 📐 Patrones del Screener: qué se detectaba y dibujaba mal, qué se corrigió y qué tan útiles son |
| **[MANUAL_SEGUIMIENTO.md](MANUAL_SEGUIMIENTO.md)** | Botón ⬇ Seguimiento Excel/CSV (tu hoja SEGUIMIENTO, columnas A → AY) |
| **[MANUAL_LISTADO.md](MANUAL_LISTADO.md)** | 🌐 Listado completo: ~9.600 activos adicionales evaluados cada noche con la misma lógica |
| **[MANUAL_COMBOS.md](MANUAL_COMBOS.md)** | 🧩 COMBOS y ✅ WIN%DIA: los combos 3, 11, 12, 14, 15 y 16 medidos cada día sobre todo el universo |
| **[MANUAL_INSTALACION.md](MANUAL_INSTALACION.md)** | Instalación paso a paso (GitHub Pages + Actions) |
| [MANUAL_USO.md](MANUAL_USO.md) · [MANUAL_NIVEL_PRO.md](MANUAL_NIVEL_PRO.md) · [MANUAL_SCREENER.md](MANUAL_SCREENER.md) · [MANUAL_APP_IPHONE.md](MANUAL_APP_IPHONE.md) | Uso del sistema (sin cambios respecto a AndFig) |

## Qué cambió frente a AndFig

| Problema en AndFig | Qué hace Fenix |
|---|---|
| Desde el 14/09 Yahoo entrega la última vela **vacía** si se descarga después de las 00:00 UTC; la corrida de 21:30 UTC se retrasaba y 9 de los 12 cierres publicados desde el 14/09 salieron con 11–98 % de filas sin precio ($—, AI —, RS 0) | Limpia toda descarga, **reconstruye** la vela faltante con velas de 30 min (o Finnhub) y **no publica** si más del 5 % queda sin la sesión. Corre a las 16:20 ET, con **respaldo** a la mañana siguiente si la noche falló |
| Vela vacía del SPY → RS = 0 en todo el universo | Corregido con la misma limpieza |
| Grupo Hong Kong siempre vacío (`0700.HK` → `0700-HK`) | Símbolo correcto |
| Historial con fills en la vela de la propia señal (197 de 325 alertas) | Fill solo desde la sesión siguiente; se re-evalúan una vez y se conserva el resultado original |
| Hessian y Backtest Hessian rellenados con números aleatorios | Eliminado: solo datos reales |
| Pestañas calculadas con valores por defecto en filas sin precio | Esas filas no se usan |
| Solo ~1.170 activos (tus grupos) | **🌐 Listado completo:** los 11.525 del LISTADO menos ~800 ETF apalancados/inversos, con la misma lógica y las mismas 4 capas de alertas |
| Telegram rechazaba el mensaje con más de ~6 señales (límite de 4.096 caracteres) | Se envía en varias partes |
| — | **⬇ Seguimiento Excel/CSV** en el Historial (distancias EMA medidas en el fill, como tu script de TradingView) y 🩺 indicador de salud del dato |

## Inicio rápido

```bash
pip install -r requirements.txt
python scripts/build_data.py --out-dir data     # tus grupos + backtest
python scripts/listado_scan.py                   # listado completo (~9.600 activos)
python scripts/check_alerts.py                   # alertas (en consola si no hay secrets)
python scripts/track_alerts.py                   # historial
python scripts/seguimiento.py                    # datos del Seguimiento
python -m http.server 8000                       # abre http://localhost:8000
```

En GitHub: **Actions → Fenix — Actualización diaria → Run workflow** (ver `MANUAL_INSTALACION.md`).

## Features

| Feature | Description |
|---------|-------------|
| **Technical Score (0-100)** | EMA 50/200, RSI, ADX, Bollinger compression, OBV, volume, breakout setup |
| **AI Probability (5-95%)** | Sigmoid model: momentum Z-score, trend strength, volume regime |
| **Fundamental Grade** | P/E, ROE, ROA, EPS growth with traffic-light grading |
| **State Machine** | WAIT → ACCUM → ENTRY → ENTRY+ (fundamental-enhanced) |
| **Price Projections** | Quantitative targets based on ATR, momentum, and valuation |
| **TradingView Charts** | Real-time professional charts with MA% Ribbon + SPY overlay |
| **Multi-Chart Grid** | View entire sector at once |
| **Keyboard Navigation** | ↑↓ browse, M multichart, Esc single |
| **Anti-Repaint** | Only uses closed candles (verified with look-ahead test) |

## Fundamental Reference

| Metric | 🟢 Excellent | 🟡 Good | 🟠 Fair | 🔴 Weak |
|--------|-------------|---------|---------|---------|
| **P/E** | < 15 (Cheap) | 15-25 (Fair) | 25-40 (Pricey) | > 40 (Overvalued) |
| **ROE** | > 20% | 15-20% | 10-15% | < 10% |
| **ROA** | > 10% | 5-10% | 3-5% | < 3% |
| **EPS Growth** | > 25% | 10-25% | 0-10% | < 0% |

## Architecture

```
fenix-scanner-pro/
├── index.html                  # Dashboard (Historial con ⬇ Seguimiento Excel/CSV)
├── movil.html                  # App móvil (PWA)
├── fenix_params.js             # Fórmulas de las pestañas para el Excel (copia literal de index.html)
├── scripts/
│   ├── build_data.py           # Pipeline de datos (velas limpias + reparación + guarda de salud)
│   ├── check_alerts.py         # Alertas 4 capas (sin cambios de lógica; no corre con datos incompletos)
│   ├── track_alerts.py         # Historial (fill desde la sesión siguiente)
│   ├── listado_scan.py         # Listado completo (~9.600 activos) con la misma get_stock_data()
│   ├── seguimiento.py          # Guarda los datos del día de la señal + distancias EMA 5m/1h/1D
│   ├── seguimiento_export.js   # CSV del Seguimiento para el servidor
│   ├── market_calendar.py      # Sesiones y festivos NYSE 2026–2027
│   └── run_gate.py             # Compuerta de las corridas programadas
├── data/                       # snapshot, health, listado, alerts, alerts_history, seguimiento(.json/.csv), universe
├── .github/workflows/          # Actualización diaria 16:20 ET (grupos + listado en paralelo) + respaldo · alertas intradía
├── app.py                      # Streamlit (opcional)
└── requirements.txt
```

## 🎓 Nivel Profesional

Esta edición añade sobre la base v18: **backtest de rigor institucional** (P&L neto tras costos configurables, validación walk-forward in-sample/out-of-sample, Sharpe por operación, máximo drawdown, benchmark SPY buy&hold como listón, histórico ampliado a 5 años incluyendo el bajista de 2022) y **conciencia de eventos** (calendario de earnings y ex-dividendo por ticker, blackout automático de alertas a ≤5 días del reporte, advertencias a ≤14 días). Detalles completos en `MANUAL_NIVEL_PRO.md`.

## 🔎 Screener estilo Finviz (nuevo)

Pestaña Screener en dashboard y app: **Order by** con ~55 métricas (performance semana→año, valoración P/E–PEG–P/S–P/B, dividendos, márgenes, deuda, insider/institutional ownership, short float, recomendación de analistas, volatilidad, distancias a SMAs y a máximos/mínimos…), **Signal** con Top Gainers/Losers, nuevos máximos/mínimos 52s, más volátiles/activas, volumen inusual, sobrecompra/sobreventa, cruces dorados, rupturas, earnings próximos, y **detección propia de 20+ patrones chartistas** (dobles/triples techos y suelos, HCH y su inverso, triángulos, cuñas, canales, rectángulos, banderas, banderines, taza con asa, soportes/resistencias). Ver `MANUAL_SCREENER.md`.

## 📱 App para iPhone (nueva)

El proyecto incluye una app móvil instalable (`movil.html` + PWA): ícono propio, pantalla completa, modo offline, sondeo automático cada 60 s de los datos publicados, gráficos en vivo de TradingView por ticker, y renderizado dinámico — **los cambios que hagas en los `.py` se reflejan en la app automáticamente** vía los JSON que generan los workflows. Instrucciones completas en `MANUAL_APP_IPHONE.md`. Al entrar desde un celular, el dashboard redirige solo a la versión móvil.

## ⚡ Primer arranque

El `data/snapshot.json` incluido es la **última actualización sana de AndFig
(18/09/2026)**, para que veas el dashboard funcionando de inmediato (indicador
**⏳ Datos iniciales**). Lanza **Fenix — Actualización diaria** en Actions para
traer el cierre actual.

## Novedades v18 — Régimen de mercado, Calidad Buffett y Fuerza Relativa

- **🟢🟡🔴 Filtro de Régimen de Mercado (Faber 2007)**: el sistema clasifica el mercado con el SPY vs su SMA200. En BEAR las alertas de compra se **suspenden automáticamente**; en NEUTRAL solo pasan señales con fuerza relativa alta. El backtest incluye el bucket `regime_filtered` que demuestra el edge del filtro contra la señal sin filtrar y contra el baseline.
- **🏰 Buffett Quality Score (0-100) + Margen de Seguridad**: diez chequeos al estilo Buffett/Munger (ROE>15%, margen bruto>40% como proxy de moat, deuda baja, FCF yield, etc.) con veredicto MOAT/QUALITY/PROMEDIO/DÉBIL, y MOS estimado con el Número de Graham (fallback por FCF).
- **📈 Fuerza Relativa vs SPY**: retorno 3M/6M en exceso del índice y ranking percentil 0-100 contra todo el universo (momentum transversal, Jegadeesh & Titman 1993).
- **⚖️ Tamaño de posición en cada alerta**: acciones sugeridas por cada $10k de capital arriesgando 1% hasta el stop.
- **📖 Manuales en español**: `MANUAL_INSTALACION.md` y `MANUAL_USO.md`.

## Mejoras v17.1

- **Caché global de datos**: cada ticker se descarga UNA vez (2 años) y se reutiliza para snapshot y backtest (~3x menos llamadas a Yahoo, menos rate-limiting).
- **Deduplicación de alertas**: `data/alerts_state.json` evita reenviar la misma señal varias veces el mismo día.
- **Zonas SL/TP basadas en ATR**: el stop ya no está a 0.5% de la entrada (ruido puro); ahora SL = entrada − 1.5·ATR, TP1/TP2 = +1/+2 ATR.
- **Baseline buy & hold en el backtest**: cada ticker incluye `baseline` por periodo. Si el win-rate de la estrategia no supera claramente el baseline, la señal no aporta edge real.
- **Modo `--quick`**: refresca solo Watchlist Core + Índices y fusiona con el snapshot existente (para los chequeos intradía).
- **Workflows corregidos**: el cron de cada 5 min era inviable (la build tarda >5 min y los datos son EOD por anti-repaint, así que no cambiaban intradía). Ahora: 3 chequeos/día con `--quick` + chequeo automático tras el refresh diario. Los chequeos rápidos ya no commitean el snapshot (evita inflar el repo).
- **Bugs corregidos**: valores 0.0 (RSI, daily%, P/E...) se convertían en `null` por chequeos de truthiness; cálculo Hessiano roto y costoso eliminado; tickers delistados/renombrados (PXD, FISV→FI, IACI, BF.B→BF-B); inyección de datos en Streamlit (`app.py`) que no funcionaba; email personal hardcodeado eliminado.

## Limitaciones conocidas (honestidad metodológica)

- El backtest usa **fundamentales actuales como proxy histórico** (sesgo de look-ahead en la capa 2; la API gratuita no da fundamentales históricos).
- Las señales se muestrean cada 5 barras y los retornos a distintos horizontes **se solapan**: los win-rates están autocorrelacionados y no equivalen a trades independientes. Compáralos siempre contra el `baseline`.
- El universo de tickers actual tiene **sesgo de supervivencia** (solo empresas que existen hoy).
- La "AI Probability" y la capa "Game Theory" son heurísticas calibradas a mano, no modelos entrenados ni probabilidad bayesiana formal.

## Disclaimer

This tool is for informational and educational purposes only. Not financial advice. All trading involves risk of capital loss.
