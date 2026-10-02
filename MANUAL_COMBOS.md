# 🧩 Manual — COMBOS y ✅ WIN%DIA

Dos pestañas nuevas del dashboard que, en cada actualización diaria, responden:

> De todo el universo (tus grupos + el listado completo, más de 10.000 tickets), ¿qué
> combinación —entre los combos 3, 11, 12, 14, 15 y 16 del informe— identificó mejor los
> tickets que **después** tuvieron rendimiento diario positivo, y qué tenían esos tickets?

No cambian nada de lo que ya existía: leen los datos de la actualización y escriben
solo sus propios archivos (`data/combos_*.json`).

## 1. Cómo se mide

**Lectura principal: cierre anterior → % de hoy.** Cada noche Fenix guarda qué combos
cumple cada ticket con los parámetros de ese cierre. A la noche siguiente toma esos
tickets y mira su **% diario** (la columna *Cambio % (día)* del Screener). Así el
combo se evalúa con lo que se sabía *antes* del movimiento.

La pestaña trae también la lectura **"Mismo día"** (combos de hoy con el % de hoy).
Solo describe: los parámetros de hoy ya incluyen la subida o caída del día, así que
no dice nada sobre mañana.

**Universo de la sesión** = tus grupos (`data/snapshot.json`) + el listado completo
(`data/listado.json`). El listado no repite los tickets de tus grupos. Quedan fuera
del cálculo, y se cuentan en la sección *Cobertura*:

- tickets sin la vela de esa sesión (Yahoo no la entregó, mercado de otro país cerrado);
- tickets que no estaban la sesión anterior.

Positivo = % diario mayor que 0; negativo = menor que 0; neutro = exactamente 0.
Los negativos y los neutros **entran en todas las estadísticas**.

## 2. Los seis combos (punto 8 del informe, sin cambios)

| Combo | Condiciones | Columnas de tu hoja |
|---|---|---|
| **3** | Calidad = EXCELENTE · Markov Score ≥ 75 | AO · AC |
| **11** | Fase = Acumulación · Tendencia = Bullish · Earliness distinto de Temprano · Estabilidad distinta de Oscillating · no repetida | AJ · AU · AW · AV · BI |
| **12** | PATRON 1 = ENTRAR: Fase = Acumulación · Tendencia = Bullish · Earliness Maduro, Tardío o Extendido · Estabilidad distinta de Oscillating | fórmula de tu columna BB |
| **14** | Fase = Acumulación · Earliness = Fresco · no repetida | AJ · AW · BI |
| **15** | Laplace Señal = avoid · Markov Estado = Bullish · Dis Ema 20 < 0 y Dis Ema 200 < 0 en 5 minutos | AY · AD · N y O |
| **16** | Calidad = EXCELENTE · no repetida · Markov Score ≥ 75 · Sector = Energy | AO · BI · AC · B |

Los valores de cada ticket salen de `fenix_params.js`, el mismo código que usan las
pestañas y el Excel de Seguimiento (Markov 5 periodos, Laplace s = 0,3, Game Theory
Nash semanal, Entry Zones semanal).

**Comprobación contra el informe.** El mismo motor, aplicado a las 322 filas de tu
Excel, reproduce las muestras del punto 8:

| Combo | Cerradas | WIN | LOSS |
|---|---|---|---|
| 3 | 37 | 25 | 12 |
| 11 | 17 | 15 | 2 |
| 12 | 14 | 10 | 4 |
| 14 | 8 | 8 | 0 |
| 15 | 9 | 9 | 0 |
| 16 | 9 | 9 | 0 |

El combo 12 coincide con tu columna PATRON 1 = ENTRAR en las 322 filas.

### Tres condiciones que hubo que llevar al universo

En tu hoja cada fila es una señal con entrada y fill. En el universo la mayoría de los
tickets no son señales, así que tres condiciones se calculan así:

- **No repetida.** Fórmula de tu columna BI con el historial de alertas de Fenix:
  repetida = el ticket ya tuvo una señal antes **y** su nivel de entrada de hoy supera
  en más de 1,5 % la entrada más baja de esas señales. El nivel de entrada es el que
  asigna el sistema (cierre − 0,3 × ATR). Un ticket sin señales previas no es repetido.
- **Dis Ema 20 y 200 de 5 minutos (combo 15).** En tu hoja se miden en el fill contra
  el precio de entrada. En el universo no hay fill: se miden en la **última vela de 5
  minutos de la sesión**, contra el cierre de esa vela (Dis Ema = EMA − precio, sesión
  regular). Solo se descargan velas de 5 minutos de los tickets que ya cumplen las
  otras dos condiciones (unos 1.300 por noche).
- **Calidad EXCELENTE (combos 3 y 16).** Depende de la ficha fundamental. Una acción
  sin ficha cargada aparece como **no evaluable**, no como "no cumple". La cobertura
  crece cada noche con la rotación de fundamentales del listado.

En la tabla un combo con «?» (por ejemplo `15?`) significa eso: ninguna condición
falla, pero falta un dato para confirmarlo.

> Sobre el nombre del combo 15: en tu hoja la etiqueta es "Bajo ambas EMAs" y la
> condición es Dis Ema 20 < 0 y Dis Ema 200 < 0. Como Dis Ema = EMA − nivel, significa
> que **las dos EMA quedan por debajo del precio**.

## 3. Pestaña 🧩 COMBOS

**Barra de controles:** Lectura · Fecha · Universo (todo, solo tus grupos, solo el
listado) · Combo · Resultado (positivos, negativos, neutros) · Sector · Ticket ·
Descargar (Excel con las hojas COMBOS, DETALLE e HISTORIAL, o CSV).

1. **ANÁLISIS DIARIO.** Fecha, tickets analizados, positivos, negativos, neutros,
   combo destacado y sus cifras, y dos lecturas separadas: la confianza del día y la
   consistencia histórica.
2. **Los seis combos frente al universo.** Tickets, positivos, negativos, neutros,
   % positivos con su intervalo al 95 %, diferencia con el universo, promedio, mediana,
   acumulado, mejor, peor, desviación, consistencia, muestra, Calidad y no evaluables.
   La última fila es todo el universo. Clic en un combo para ver sus tickets.
3. **Tickets del combo.** Las condiciones con su columna de la hoja y cuántos tickets
   cumplen cada una; la tabla de tickets con % diario, estado, todos los combos que
   cumplía y sus parámetros. Clic en un encabezado para ordenar. El botón *Ver los
   tickets que cumplen hoy* muestra los candidatos de la próxima sesión.
4. **Tickets que cumplen varios combos.** Matriz de coincidencias y, por par, tickets
   en común, contención, lift y relación (redundantes, suelen aparecer juntos,
   independientes, complementarios, excluyentes).
5. **Historial y consistencia.** Una fila por sesión y, por combo, sesiones con datos,
   veces destacado, ventaja media, días a favor y en contra, t, rendimiento medio,
   acumulado, tendencia y lectura.
6. **Cobertura de datos y límites.**

Para fechas anteriores se muestran el resumen de esa sesión y los tickets de cada
combo con su % diario (últimas 60 sesiones). Los parámetros completos se conservan
solo para la última sesión.

## 4. El indicador de Calidad

De 0 a 100. **50 = igual que el universo ese día.** Todo se mide contra el universo
del mismo día, así un día alcista no infla a todos los combos.

Cuatro notas de 0 a 100, con el mismo peso (25 % cada una):

| Nota | Qué mide | Cómo |
|---|---|---|
| Tasa positiva | Si acierta más que el universo | Parte del margen posible sobre la tasa del universo que captura el combo |
| Rendimiento | Cuánto rinde | Percentil del promedio del combo entre los % diarios del universo, frente al del promedio del universo |
| Consistencia | Si el resultado es general | % de tickets del combo que superan la mediana del universo |
| Robustez | Si depende de unos pocos | Igual que Rendimiento, con el promedio sin el 10 % mejor ni el 10 % peor |

Los promedios se acotan al rango 1 %–99 % del universo para que un dato defectuoso
(un split sin ajustar) no decida.

El **tamaño de muestra** no suma puntos: multiplica.

```
fiabilidad = 1 − ancho del intervalo de Wilson (95 %) de la tasa positiva
Calidad    = 50 + fiabilidad × (promedio de las cuatro notas − 50)
```

Con pocos tickets la nota se queda cerca de 50, porque no se sabe.

**Por qué pesos iguales.** No hay historial que justifique dar más peso a una nota que
a otra, y elegirlos mirando un solo día sería sobreajuste. Están en una constante
(`PESOS` en `fenix_combos.js`) para revisarlos cuando haya 60 sesiones o más.

**Lo que da el azar.** Junto a cada nota aparece la Calidad que obtienen grupos del
mismo tamaño sacados al azar del universo ese día (percentil 5 al 95 de 300 sorteos).
Si la nota del combo cae dentro de ese rango, no se distingue de elegir a ciegas.

**Confianza del día:**

| Nivel | Condición |
|---|---|
| Muy baja | Menos de 20 tickets |
| Baja | La nota cae dentro de lo que da el azar |
| Media | La nota supera lo que da el azar |
| Alta | Además, 50 tickets o más y z ≥ 2,33 |

**Combo destacado:** la mejor Calidad entre los combos con 20 tickets o más, siempre
que supere 50. Con menos de 20 tickets la nota es solo indicativa; con menos de 5 no
se calcula.

## 5. "Mejor del día" no es "robusto"

Los tickets de una misma sesión se mueven juntos. Por eso la prueba que cuenta es que
la ventaja se repita en sesiones distintas, y la sección de historial trabaja con días:

- **Ventaja** = tasa positiva del combo − tasa positiva del universo, cada día.
- **t** = ventaja media ÷ su error estándar entre días.
- Menos de 20 sesiones: *historial insuficiente*. De 20 a 59: *en observación*.
  Con 60 o más, t ≥ 2 y el 55 % de los días a favor: *históricamente robusto*.

La pestaña avisa, combo por combo, de muestra pequeña, valores extremos (±50 % o más),
promedio y mediana en sentidos opuestos, un solo ticket que aporta más de la mitad de
las ganancias, y 100 % de positivos con menos de 30 tickets.

## 6. Pestaña ✅ WIN%DIA

1. **Tickets con rendimiento positivo** (también negativos, neutros o todos), con lo
   que el sistema decía de cada uno al cierre anterior: Radar/Screener, Hessian,
   Markov, Game Theory, Entry Zones, Analysis, Laplace, señales, patrones, combos que
   cumplía y combos no evaluables. Filtros por combo, universo, sector y ticket. La
   pantalla muestra las columnas principales; la descarga trae las 64.
2. **Condiciones: frecuencia frente a efectividad.** Para cada valor de cada variable:
   tickets, % del universo, % positivos, diferencia con el universo, rendimiento medio,
   % de los ganadores que la tenían, presencia en el 10 % mejor y días a favor.
   - *% de los ganadores* es frecuencia: una condición muy común aparece en muchos
     ganadores aunque no ayude.
   - *% positivos* es efectividad: qué pasó con todos los que la tenían.
3. **Pares de condiciones.** Los 25 mejores y los 15 peores con 20 tickets o más:
   candidatos a nuevos combos.

Cada día se prueban unas 160 condiciones y 5.000 pares. Solo por azar salen decenas
"significativos". Un par sirve como hipótesis; antes de convertirlo en combo debe
sostenerse varias sesiones (columna *Días a favor*).

## 7. Automatización

El paso **COMBOS y WIN%DIA** corre en la actualización diaria, después del Seguimiento
(`node scripts/combos.js`). Si falla, la actualización sigue.

| Archivo | Contenido |
|---|---|
| `data/combos_estado.json` | Parámetros y combos de cada ticket al cierre de la sesión |
| `data/combos_estado_prev.json` | Lo mismo, de la sesión anterior |
| `data/combos_dia.json` | Evaluación de la sesión: estadísticas, Calidad, coincidencias, condiciones, % diario por ticket |
| `data/combos_historial.json` | Un registro por sesión (no se borra) |
| `data/combos_detalle.json` | Tickets de cada combo y su % diario, últimas 60 sesiones |
| `data/combos_ema5.json` | EMA 20 y 200 de 5 minutos usadas en el combo 15 |

Protecciones:

- **Sesión anterior correcta.** Antes de evaluar se comprueba que el cierre guardado
  coincide con el que implica el % diario de hoy. Si no cuadra en el 80 % de los
  tickets, la sesión guardada no es la anterior y **ese día no se evalúa**.
- **Recuperación.** Si falta la sesión anterior (primera corrida, una noche sin
  actualización), se reconstruye desde el historial del repositorio. Si al historial
  de combos le falta una sesión, se rellena igual.
- **Universo parcial.** Si una noche falla el listado completo, se evalúan solo tus
  grupos y la sesión queda marcada como *parcial*.
- **Misma sesión dos veces.** Repetir la corrida no duplica registros.

Los dos archivos de estado pesan unos 5 MB cada uno.

## 8. Límites

- **Un solo día de historial al instalar** (30/09 → 01/10/2026). Ninguna conclusión
  sobre robustez es posible todavía.
- **Combo 15:** las velas de 5 minutos de Yahoo llegan con cierto retraso y solo cubren
  60 días. Tickets con menos de 200 velas quedan sin dato. La descarga no se pudo
  probar contra Yahoo desde el entorno de desarrollo; el cálculo se probó con velas
  simuladas.
- **Combos 3 y 16:** pocos tickets por día mientras la cobertura de fichas sea parcial.
- **Valores extremos:** un % diario de +3.000 % suele ser un split sin ajustar. Se
  marca con ⚠️ y no se elimina.
- **Mercados de otros países** de tus grupos entran solo si su última vela es de la
  misma fecha que la sesión.
