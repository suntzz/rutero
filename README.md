# Rutero

Página sencilla para que los LAS programen la ruta del mes, y un área interna que
descarga el **03 Rutero** en Excel.

## Arrancar

```bash
npm install
npm run cargar -- "ruta/al/Formato_Rutero.xlsx"   # carga eventos, novedades, horas y canales
npm run app                                       # compila y abre http://localhost:3000
```

- `/` → el LAS busca su nombre (los LAS activos de Nutresa) y entra **escribiendo su cédula**.
  Dentro solo ve y programa a **su equipo**: los promotores que Nutresa le asigna y las personas
  que él mismo pidió crear. El servidor rechaza cualquier consulta o guardado de otro equipo.
  La lista pública de LAS no muestra cédulas (usa un código opaco) y 5 cédulas equivocadas
  bloquean ese LAS 15 minutos. Al entrar ve **cuatro funciones**:
  - **Crear rutero**: persona → tienda (por SAP) → evento (primero pregunta si sigue con el de la
    base) → días (paleta de "pinceles": horarios y novedades) → revisar (calendario a la derecha).
  - **Actualizar rutero**: promotores programados (tócalos para ver su calendario y sus tiendas) y los
    que faltan; modificar o cancelar **de mañana en adelante**; validar lo cargado; descargar el formato.
  - **Petición de creación de usuario** y **Petición de creación de punto de venta**: formularios
    con los campos de Nutresa. Rutero no crea nada en Nutresa; una persona pedida se puede programar
    enseguida, una tienda pedida no (hasta que llegue de Nutresa).
- **Nada de lo que hace el LAS es oficial**: queda como solicitud *Pendiente de cargue*. El LAS
  descarga el archivo y lo envía por correo (Rutero no envía correos):
  - Formato Rutero (PANEL, CREAR USUARIOS, CREAR PDV…) → `brayan_zabala@eficacia.com.co`
  - Peticiones de usuarios y de puntos de venta → `miguel_restrepo@eficacia.com.co`

  Se pueden cambiar con `CORREO_RUTERO` y `CORREO_PETICIONES`.
- `/interno` → super usuarios: descarga del 03 Rutero, **Solicitudes de rutero** por LAS y peticiones,
  donde se marcan **Cargada** o **Devuelta** (con comentario que el LAS ve), y “Cambiar mes”.
  Las devueltas no salen en el 03 Rutero. No hay enlaces a esta página desde el sitio público.
- **Cargar directo a Nutresa** (solo `/interno`): formulario con todos los campos de `usuarios_nutresa`
  (12) o de `pdv_nutresa` (11), con la ficha del registro tal como llegará y una confirmación antes de
  enviar. Se puede llenar desde una petición pendiente de un LAS, que queda *Cargada* al enviar.
  Reglas: **solo agrega** (POST, una vez, sin reintentos); una cédula o un SAP que ya existe se rechaza;
  la ruta se sugiere sola y avisa si ya la tiene otra persona activa; un PDV sin coordenadas va con
  `SIN GEO` y `GEO_OK NA`. Está apagada salvo con `RUTERO_CARGA_NUTRESA=si`. En `npm test` no toca la
  API: deja lo cargado en `data/cargas-nutresa.jsonl`.
- Modo claro y oscuro: sigue al celular hasta que la persona toca el botón sol/luna de la cabecera.

Para trabajar en el diseño con recarga en vivo: `npm start` en una terminal y `npm run dev`
en otra (Vite en http://localhost:5173).

## Demo en GitHub Pages

https://suntzz.github.io/rutero/ (área interna: https://suntzz.github.io/rutero/interno/)

Es solo para probar la interfaz: el front con un servidor de mentiras en el navegador
(`web/src/demo/`) y datos inventados (cédula de los LAS `52123456` o `71123456`; área interna
`demo` / `demo`). No usa el token de Nutresa ni ninguna base, guarda todo en el navegador y no
genera Excel. La publica `.github/workflows/pages.yml` en cada push a `main`
(`VITE_DEMO=1 npx vite build` → `dist-demo/`). La app real va en Railway.

## Frontend

React + Vite en `web/`. Pantallas: `Inicio.jsx`, `Programar.jsx` (con los pasos en `pasos/`),
`MiRutero.jsx` y `Peticiones.jsx`. Usa componentes de [React Bits](https://reactbits.dev) en
`web/src/reactbits/`: Stepper, AnimatedList, CountUp, Grainient, SpotlightCard, BorderGlow y
GradientText. Los colores son tokens CSS (`web/src/estilos.css`) con su versión oscura; ver
`AUDITORIA-FRONT.md`.

## Reglas del calendario

- Solo se programa y se modifica **de mañana en adelante** (hora de Colombia). Hoy y los días
  anteriores no cambian.
- Una persona no puede estar en dos sitios a la misma hora (los turnos que solo se tocan, como
  10–6 y 6–10, sí se permiten).
- **Un evento por persona y día**: si ya tiene otro, se pregunta si seguir con ese o cambiar todo al
  nuevo (sus otras tiendas cambian de mañana en adelante).
- Modificar o cancelar guarda una versión nueva en `programaciones.jsonl`; lo anterior queda como historial.

```bash
npm test     # pruebas de reglas con una copia de data/ (no toca los datos reales)
```

- **Evento y marca van juntos** según la base de usuarios de Nutresa (cada evento tiene una marca).
  Si la persona cambia de evento, se crea una **petición de cambio** (evento y marca) para el área.

## Usuarios y PDV en vivo desde Nutresa

LAS, promotores y PDV **no salen del Excel**: cada vez que Rutero pregunta por un LAS, una persona o un
PDV consulta la API de Nutresa. **Rutero nunca edita ni borra en `usuarios_nutresa` y `pdv_nutresa`**
(no les envía PUT ni DELETE). La única escritura es la carga directa del área interna, que solo agrega
registros nuevos (`lib/cargaNutresa.js`); todo lo demás que Rutero guarda va en sus propias bases. Las preguntas que llegan dentro de los mismos 60
segundos comparten la respuesta, para no descargar los 2 MB de PDV por cada letra que se escribe.
Configuración en `.env` (o variables de Railway):

```
NUTRESA_API_TOKEN=<token>            # obligatorio; nunca en el código
NUTRESA_API_URL=https://botai.smartdataautomation.com/api_backend_ai/dinamic-db/report/119
NUTRESA_RUTA_USUARIOS=usuarios_nutresa
NUTRESA_RUTA_PDV=pdv_nutresa
NUTRESA_VIGENCIA_SEG=60
```

La última respuesta buena queda en `data/nutresa-respaldo.json`: si la API falla, Rutero sigue con ella,
reintenta cada 30 s y el área interna lo avisa (botón "Consultar ya"). Del Formato Rutero solo se toman
eventos, novedades, horas, canales y el mes (`npm run cargar -- archivo.xlsx`).

## Datos

Rutero guarda en **sus 3 bases propias** de la API dinamic-db (`RUTERO_ALMACEN=api`):

| Base | Qué guarda |
|---|---|
| `Rutero_programaciones` | Cada programación y cada versión (modificar, cancelar, cargada, devuelta), con su mes (`periodo`) |
| `Rutero_peticiones` | Peticiones de usuario, de PDV y de cambio de evento, con su estado |
| `Rutero_config` | Mes abierto (`tipo: periodo`) y listas del Formato (`tipo: listas`) |
| `Rutero_borradores` | El "Crear rutero" a medio llenar de cada LAS (lo sigue en cualquier navegador; vence a las 72 h) |

Nada se edita ni se borra: cada cambio es un registro nuevo con la versión siguiente y al leer vale la
más alta. Al arrancar, Rutero lee las 3 bases y trabaja en memoria; cada guardado espera a que la base
confirme antes de decirle al LAS que quedó. Si la base no responde, el LAS ve un error y no se pierde
nada a escondidas. Solo se muestran las programaciones del mes abierto.

Con `RUTERO_ALMACEN=archivos` (y en `npm test`) todo va en `data/`: `programaciones.jsonl`,
`db.json` y `maestros.json`. `data/nutresa-respaldo.json` es la última respuesta buena de Nutresa.

## Publicar en Railway

Variables (nunca en el código):

```
RUTERO_ALMACEN=api
NUTRESA_API_TOKEN=<token>            # el mismo sirve para las bases Rutero_*
RUTERO_SECRETO=<el de tu .env>       # obligatorio: firma las sesiones y las claves del área interna
RUTERO_SUPERUSUARIOS=<contenido de data/superusuarios.json>
RUTERO_CARGA_NUTRESA=si              # opcional: activa la carga directa a Nutresa en /interno
```

- Comandos: build `npm run build`, start `npm start`. Node 20 o más.
- **Volumen** de Railway montado en `/data` y la variable `RUTERO_DATA=/data`: ahí queda el respaldo
  de Nutresa, para que un reinicio con Nutresa caída no deje a Rutero sin LAS ni PDV.
- Si Nutresa tarda o se cae: Rutero sigue con los últimos datos buenos (nadie espera), reintenta
  3 veces por consulta y vuelve a intentar cada 30 s. Solo sin ningún dato el LAS ve "Estamos
  trayendo los datos de Nutresa" y Rutero insiste cada 15 s hasta lograrlo.
- Un solo servidor (una réplica): todo se lee en memoria al arrancar.
- Las sesiones van cifradas en la cookie (8 h máximo, 1 h sin uso): sobreviven a los despliegues.
- Detrás del proxy de Railway, Rutero toma la IP real de cada persona (para el bloqueo por intentos) y
  marca las cookies como `Secure`.

### Prueba de carga

```bash
RUTERO_DATA=/tmp/copia-data PORT=3100 node server.js     # servidor con una copia de data/
node scripts/prueba-carga.js http://localhost:3100 50   # todos los LAS guardando a la vez
```

Resultado (29 LAS, 1.479 envíos al mismo tiempo): 0 fallas de conexión, 0 programaciones
perdidas o duplicadas tras apagar y prender el servidor; Excel de 53.940 filas en ~2,6 s.

## Cómo se arma el 03 Rutero (mismas reglas del Excel)

Cada programación (persona + PDV + evento) se convierte en **31 filas**, una por día desde
la fecha del mes (igual que las 31 columnas del PANEL), ordenadas por fecha.

| Columna | De dónde sale |
|---|---|
| EVENTO | Lo que eligen en el formulario |
| MARCA | La marca de ese evento según la base de Nutresa |
| RUTA, PERSONAL, LAS | MASTER USUARIOS (o CREAR USUARIOS) por cédula |
| PDV, REGIONAL, CIUDAD, DIRECCION, CANAL | MASTER PDV (o CREAR PDV) por SAP |
| FECHA_VISITA | Mes + 0…30 días |
| ESTADO | `PDT VISITA` si el día tiene horario; `CANCELADA` si no tiene hora |
| HORA DE INGRESO / SALIDA | Horario del día, solo si tiene horario |
| ESTADO DE LA VISITA | `PROGRAMACION`, o el motivo si está cancelada: la novedad (VACACIONES, INCAPACIDAD…), `CANCELADA POR LAS` o `SIN PROGRAMACION` |
| LAS CEDULA | Siempre `0` |

## Seguridad del área interna

- Crear o cambiar un super usuario (la clave se pide por consola):

  ```bash
  node scripts/crear-superusuario.js <usuario>
  ```

- La clave se guarda como `scrypt(HMAC(secreto, clave))` en `data/superusuarios.json`.
  El **secreto** está en `.env` (se crea solo al primer arranque). Sin ese archivo el hash no
  sirve para adivinar la clave, aunque alguien descargue el repositorio.
- `.env` y `data/` están en `.gitignore`: **nunca los subas al repositorio**. En el servidor,
  el secreto puede ir en la variable de entorno `RUTERO_SECRETO`.
- 5 intentos fallidos bloquean al usuario 15 minutos (20 por IP). Sesiones de 8 horas, se
  cierran tras 1 hora sin uso. Cookies `HttpOnly` + `SameSite=Strict` (+ `Secure` con HTTPS).
- Todas las rutas de datos piden sesión: las de campo, sesión de LAS; las internas, sesión de
  super usuario.
