# 📦 Manual de Instalación — Fenix Scanner Pro v1.0

Fenix es **AndFig v18 con los datos arreglados** más la descarga diaria del
Seguimiento. Es un repositorio nuevo: puedes dejar AndFig como está mientras
pruebas Fenix, o reemplazarlo cuando quieras. La forma recomendada es
**GitHub Pages + GitHub Actions** (se actualiza sola, sin servidor).

## Requisitos

- Cuenta de GitHub (el repositorio debe ser **público** para GitHub Pages gratis).
- Opcional: Gmail (alertas por correo), un bot de Telegram, API key gratis de Finnhub.
- Para probar en tu PC: Python 3.10+ (recomendado 3.12) y Node 18+ (solo para el CSV del servidor).

---

## Opción A — GitHub Pages + Actions (recomendada)

### Paso 1 — Crear el repositorio

En GitHub: **New repository** → nombre sugerido `Fenix-Scanner-Pro` → **Public** → *Create*.
Descomprime `Fenix-Scanner-Pro.zip` en tu PC.

### Paso 2 — Subir los archivos

**Con GitHub Desktop (lo más fácil):** *File → Clone repository* (el repo vacío),
copia dentro todo el contenido de la carpeta `fenix-scanner-pro`, escribe un
mensaje ("Fenix v1.0") → **Commit to main** → **Push origin**. GitHub Desktop sí
sube la carpeta oculta `.github`.

**Desde la web (arrastrar y soltar):** arrastra todo **excepto `.github`** (el
navegador ignora las carpetas que empiezan con punto). Luego crea los dos
workflows a mano:

1. En el repo: **Add file → Create new file**.
2. Nombre exacto: `.github/workflows/refresh_data.yml` (al escribir `/` GitHub crea las carpetas).
3. Abre `refresh_data.yml` del zip con el Bloc de notas, copia todo, pega y **Commit changes**.
4. Repite con `.github/workflows/check_alerts.yml`.

En la pestaña **Actions** deben aparecer *"Fenix — Actualización diaria (cierre +
respaldo)"* y *"Fenix — Alertas intradía (3 veces al día)"*.

### Paso 3 — Permisos de Actions

*Settings → Actions → General → Workflow permissions* → **Read and write
permissions** → *Save*. Sin esto los workflows no pueden guardar los datos.

### Paso 4 — GitHub Pages

*Settings → Pages* → *Source: Deploy from a branch* → rama `main`, carpeta
`/ (root)` → *Save*. En 1–2 minutos: `https://TU_USUARIO.github.io/Fenix-Scanner-Pro/`.

### Paso 5 — Secrets de alertas (opcional)

*Settings → Secrets and variables → Actions → New repository secret*. Los secrets
**no se copian** entre repositorios: si ya los tenías en AndFig, créalos de nuevo aquí.

| Secret | Qué es |
|---|---|
| `SMTP_USER` | Tu Gmail (ej. `tucorreo@gmail.com`) |
| `SMTP_PASS` | **Contraseña de aplicación** de Google (16 caracteres; requiere verificación en 2 pasos) |
| `ALERT_EMAIL` | Correo que recibe las alertas |
| `TELEGRAM_TOKEN` | Token del bot (@BotFather → `/newbot`) |
| `TELEGRAM_CHAT_ID` | Tu chat ID numérico (@userinfobot) |
| `FINNHUB_KEY` | Opcional y recomendado: segunda fuente para reconstruir velas faltantes |

> Si mantienes AndFig encendido al mismo tiempo recibirás las alertas dos veces.
> Cuando Fenix esté funcionando, desactiva los workflows de AndFig
> (*Actions → el workflow → ⋯ → Disable workflow*).

### Paso 6 — Primera ejecución

*Actions → Fenix — Actualización diaria → Run workflow* (deja "forzar" en `no`).

La corrida tiene tres partes, que en *Actions* se ven como cajas: **grupos**
(tus ~1.170 tickers + backtest) y **listado** (los ~9.600 adicionales) corren al
mismo tiempo en dos máquinas, y **publicar** junta todo, evalúa las alertas y guarda.
La primera vez tarda **1,5–2,5 horas**: además de lo anterior **re-evalúa las 197
alertas del historial** que AndFig había llenado en la vela de la propia señal y
calcula las distancias a las EMA de las alertas anteriores. Los fundamentales del
listado se completan en unas 5 noches (ver `MANUAL_LISTADO.md`). El zip trae como punto de partida el último snapshot
sano de AndFig (18/09/2026); el dashboard lo indica con **⏳ Datos iniciales**
hasta que termine esta corrida.

Desde ahí todo es automático:

| Qué | Cuándo (hora de Colombia) |
|---|---|
| Actualización del cierre (grupos + listado completo) + alertas + seguimiento | ~15:20 (verano de EEUU) o ~16:20 (invierno), lunes a viernes; tarda 1–2 h |
| Respaldo, solo si la noche falló | ~06:17 de martes a sábado |
| Alertas intradía (grupos core) | 10:00, 13:00 y 16:00 |

GitHub puede retrasar los horarios programados entre 10 y 60 minutos; es normal.
Las dos automatizaciones nunca corren a la vez (una espera a la otra).

### Paso 7 — App en el celular

Abre `https://TU_USUARIO.github.io/Fenix-Scanner-Pro/movil.html` en Safari →
Compartir → **Agregar a inicio**. Aparece con el ícono del fénix
(detalle en `MANUAL_APP_IPHONE.md`).

---

## Opción B — Probar en tu PC

```bash
cd fenix-scanner-pro
python -m venv venv
venv\Scripts\activate            # Windows  (Mac/Linux: source venv/bin/activate)
pip install -r requirements.txt

python scripts/build_data.py --out-dir data            # completo (30–60 min)
python scripts/build_data.py --out-dir data --quick    # prueba rápida (solo core, sin backtest)
python scripts/listado_scan.py                          # listado completo (~9.600 activos, 30–90 min)
python scripts/check_alerts.py                          # alertas en consola
python scripts/track_alerts.py                          # historial
python scripts/seguimiento.py                           # datos del Seguimiento
node scripts/seguimiento_export.js                      # CSV del Seguimiento (opcional)
python -m http.server 8000                              # abre http://localhost:8000
```

---

## Verificar que todo está sano

- Junto al logo: **🩺 OK x % · AAAA-MM-DD** (la fecha es la vela de referencia). Si ves **⛔ Datos
  incompletos**, Yahoo entregó velas vacías que no se pudieron reconstruir: se
  conserva el último snapshot sano, no se envían alertas y el respaldo de la
  mañana lo repite solo.
- En *Actions*, el paso **"¿Toca correr?"** explica por qué una corrida programada
  corrió o se saltó (por ejemplo "la sesión 2026-10-01 ya está publicada y sana").
- En el log de la actualización, la línea `🩺 Salud del dato` dice cuántas velas
  se reconstruyeron y cuántas quedaron desactualizadas.

## Problemas frecuentes

**El workflow no aparece en Actions** → falta la carpeta `.github/workflows` (Paso 2).

**"permission denied" al hacer push** → falta el Paso 3.

**"⛔ Más del 5 % del universo sin la vela…"** → Yahoo entregó datos incompletos.
El snapshot anterior se conserva y el respaldo lo repite. Si necesitas publicar de
todas formas: *Run workflow* con `forzar = si` (no recomendado).

**El botón de descarga dice "sin EMA 5 min"** → esas distancias se calculan en la
siguiente corrida (Yahoo solo guarda 60 días de velas de 5 minutos, así que las
alertas anteriores a principios de agosto de 2026 nunca tendrán esa columna).

**El correo no llega** → `SMTP_PASS` debe ser contraseña de aplicación; revisa el
log del paso "Alertas".

**Telegram no envía** → escríbele `/start` a tu bot primero y usa el chat ID numérico.
