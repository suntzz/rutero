# Auditoría de Rutero — 4 de noviembre de 2026

Revisé el código completo (servidor, `lib/`, las dos páginas React, los estilos y los componentes de React Bits).
Usé las skills **emil-design-eng** (Emil Kowalski: movimiento y pulido), **react-bits**, **mobile-native**
y **unslop** como criterio, y lo evalué desde los roles que más pesan en este producto.

**Cómo leer los percentiles:** comparan Rutero con aplicaciones web internas del mismo tipo (formularios de
operación en campo para equipos de ventas o trade marketing). **P50** es una app típica, **P90** está entre
las mejores 10 de cada 100 y **P99,99** es referencia mundial. Son estimaciones de criterio experto, no
mediciones: sirven para ordenar el trabajo, no para presumir.

---

## 1. Calificación por rol

| Rol | Percentil | Lo mejor | Lo que más lo frena |
|---|---|---|---|
| Diseñador UX para usuarios no técnicos | **P82** | 5 pasos guiados, lenguaje simple, calendario con palabras ("Libre", "Ya trabaja") | No se puede ver, corregir ni borrar lo que ya se guardó |
| Ingeniero de diseño (criterio Kowalski) | **P66** | Skeletons, `:active` en botones, `prefers-reduced-motion` | Transiciones de 420–620 ms en pantallas que se usan decenas de veces al día; rebote en listas que se filtran con cada letra; hover sin filtro táctil |
| Ingeniero frontend (React) | **P74** | Componentes claros, búsqueda que descarta respuestas viejas, choques calculados igual que en el servidor | Archivos grandes (`Programar.jsx`, 790 líneas), sin pruebas, sin manejo de error por pantalla |
| Ingeniero backend y arquitectura | **P70** | Guardado de solo-agregar (1.740 envíos simultáneos, 0 perdidos), caché y respaldo de Nutresa | Sesiones en memoria (un reinicio saca a todos), archivos JSON en vez de base de datos, sin forma de editar o anular programaciones |
| Seguridad | **P76** | scrypt + HMAC con secreto fuera del repo, bloqueo por intentos, cookies `HttpOnly` y `Strict`, CSP, equipo validado en el servidor | Cédula como única llave del LAS; token de Nutresa de prueba sin rotar; sin registro de auditoría de quién cambió qué |
| Accesibilidad (WCAG 2.2 AA) | **P60** | `aria-pressed` y `aria-label` en el calendario, foco visible, alertas con `role` | Botones del Stepper de 38 px (mínimo recomendado: 44 px); el modal no atrapa el foco; el arrastre no tiene alternativa por teclado más allá de Enter |
| Experiencia nativa en celular | **P55** | Teclado numérico en cédula, inputs ≥ 16 px (no hacen zoom) | Destello gris al tocar, `100vh` en el modal, sin márgenes para la muesca, hover que se queda pegado al tocar |
| Ciencia cognitiva (carga mental) | **P78** | Una decisión por pantalla, valores sugeridos (evento habitual), resumen antes de guardar | El paso 4 junta horario, calendario, atajos, novedades y resumen: demasiado en una sola vista |
| Matemático / reglas de datos | **P74** | Regla de cruce exacta (intervalos que se tocan no chocan), 31 filas iguales al Excel | Sin pruebas automáticas que demuestren las reglas; meses de 30 días generan un día del mes siguiente |
| Administrador de trade marketing (dueño del negocio) | **P64** | Excel 03 Rutero idéntico, personas y PDV nuevos descargables | No hay tablero de cobertura (qué LAS faltan, cuántas tiendas sin programar), ni cierre de mes, ni historial |
| QA y pruebas | **P25** | Pruebas manuales de carga y de seguridad bien hechas | Cero pruebas automáticas; `npm test` no existe |

## 2. Calificación por tipo de producto

| Producto | Percentil | Comentario |
|---|---|---|
| App web de campo | **P72** | Funciona, se entiende y aguanta la carga. Le faltan corregir lo ya guardado y la sensación de app nativa |
| Panel interno de descarga | **P68** | Simple y correcto. Le falta ver el avance del mes, no solo descargarlo |
| Identidad (logo y favicon) | **P80** | Idea propia y clara ("Mes recorrido"), sistema completo de íconos. Falta búsqueda de marca registrada |
| Pieza visual (fondo y tarjetas) | **P75** | Paleta coherente con la marca. El fondo WebGL gasta batería en celulares de gama baja |

---

## 3. Qué hace falta para llegar a P99,99 en cada rol

**Diseñador UX**
- Pantalla **"Mis programaciones"**: ver por persona y tienda lo que ya se guardó, con **Editar** y **Anular**.
- Dividir el paso 4 en dos vistas: primero el horario y el calendario, y después las novedades.
- Probar con 5 LAS reales: medir el tiempo para programar una persona y anotar dónde dudan.

**Ingeniero de diseño (Kowalski)**
- Todas las transiciones de interfaz por debajo de 300 ms, con curvas propias (`--ease-out: cubic-bezier(.23,1,.32,1)`).
- Las listas que se filtran al escribir no deben rebotar ni escalar desde 0,8.
- `:active` con `scale(.97)` en todo lo que se toca. Hover solo en `(hover: hover) and (pointer: fine)`.
- El modal debe tener animación de salida, más rápida que la de entrada.
- Con movimiento reducido: quitar el desplazamiento pero conservar los fundidos.
- La celebración solo al guardar (un evento poco frecuente), escalonada en 30–80 ms.

**Ingeniero frontend**
- Separar `Programar.jsx` por paso y crear un hook `useProgramacion`.
- Pruebas de componentes (Vitest + Testing Library) para el calendario y los choques.
- Límite de errores por pantalla, y reintento automático cuando se cae la red.

**Backend y arquitectura**
- Pasar a Postgres (Railway) con tablas `programaciones`, `sesiones` y `auditoria`. Las sesiones deben sobrevivir a los reinicios.
- Edición y anulación como **nuevas versiones** (nunca borrar), para mantener el historial.
- Healthcheck, logs estructurados y copia de seguridad diaria.

**Seguridad**
- PIN personal de 4 a 6 dígitos que el LAS crea en su primer ingreso (con la cédula). Opcional: código por WhatsApp.
- Rotar el token de Nutresa y guardarlo solo en las variables de Railway.
- Registro de auditoría (quién, qué y cuándo) y un límite de peticiones general por IP.

**Accesibilidad**
- Objetivos táctiles de al menos 44 px, foco atrapado en el modal y `Esc` para cerrarlo.
- Navegación del calendario con flechas.
- Revisar el contraste de los textos grises sobre el fondo de colores.

**Experiencia nativa en celular**
- Sin destello al tocar y con `touch-action: manipulation`.
- `100dvh` en el modal y `env(safe-area-inset-*)` en la barra.
- Fondo estático en celulares de gama baja o con ahorro de batería.
- PWA instalable con pantalla sin conexión.

**Ciencia cognitiva**
- Un solo objetivo visible por pantalla.
- El botón principal siempre en el mismo lugar y fijo abajo en el celular.
- Confirmación visual inmediata en el día que se toca.

**Matemático / reglas de datos**
- Pruebas automáticas de `cruces()`, `generarRutero()` y los meses de 28, 29, 30 y 31 días.
- Comparar el Excel generado contra el 03 Rutero real, celda por celda.

**Administrador de trade marketing**
- Tablero en el área interna con:
  - el porcentaje de LAS que ya programaron;
  - las tiendas activas sin persona;
  - las personas sin turno.
- Botón **Cerrar mes**: nadie puede programar el mes cerrado, y se abre el siguiente.
- Historial descargable de meses anteriores.

**QA**
- `npm test` en cada cambio (unitarias y de API) y una prueba de punta a punta con Playwright para el flujo de 5 pasos.
- La prueba de carga corriendo antes de cada despliegue.

---

## 4. Plan priorizado (Pareto y dependencias)

El orden pone primero lo que **sostiene a lo demás** (cimientos). Después va el **20 % que da el 80 %** del
valor para los LAS y para el área.

| # | Trabajo | Por qué va aquí | Esfuerzo | Impacto |
|---|---|---|---|---|
| 1 | **Pulido de movimiento y celular** (tokens de animación, duraciones, `:active`, hover táctil, sin destello, `dvh`, márgenes de muesca, botones de 44 px) | Barato; se siente en cada toque; es la base visual de lo demás | Bajo | Alto |
| 2 | **Pruebas automáticas** de reglas (choques, rutero, meses) y de la API | Cimiento: sin ellas, cada cambio siguiente puede romper el Excel | Bajo-medio | Alto |
| 3 | **Postgres + sesiones persistentes** | Cimiento de 4, 5 y 6; necesario para Railway | Medio | Alto |
| 4 | **"Mis programaciones": ver, editar y anular** | El mayor dolor real: hoy un error obliga a llamar al área | Medio | Muy alto |
| 5 | **Tablero de avance y Cerrar mes** en el área interna | Da control al negocio; depende de 3 | Medio | Alto |
| 6 | **PIN del LAS y registro de auditoría** | Cierra el riesgo de la cédula; depende de 3 | Medio | Medio-alto |
| 7 | Dividir el paso 4 y fijar el botón abajo en el celular | Menos carga mental; mejor después de 4 | Bajo | Medio |
| 8 | PWA, sin conexión y fondo estático en gama baja | Pulido final para el campo | Medio | Medio |

**Aplicado hoy:** el punto 1 completo (ver la sección 5).
**Siguiente recomendado:** el punto 2. Es pequeño y protege todo lo que viene.

---

## 5. Correcciones aplicadas hoy (Kowalski + React Bits)

| Antes | Después | Por qué |
|---|---|---|
| Stepper: cambio de paso de 560 ms con rebote, 36 px de desplazamiento, fundido de 420 ms | 260 ms con `ease-out` fuerte, 14 px, fundido de 200 ms; la altura sin rebote | Se usa decenas de veces al día; por debajo de 300 ms se siente inmediato |
| Indicador del Stepper con resorte de 560 ms | 300 ms `ease-out` | Mismo motivo; el resorte se veía "gelatinoso" en algo funcional |
| AnimatedList: entra desde `scale(0.8)` con rebote de 620 ms y 50 ms entre filas | Animación `fade` (4 px), 30 ms entre filas, y sin animación al filtrar | Se filtra con cada letra: frecuencia alta, el movimiento debe ser mínimo |
| Botones del Stepper de 38 px | 46 px | Objetivo táctil cómodo para el campo (WCAG ≥ 44 px) |
| `:active` solo en `.btn` (`scale(.98)`) y en el calendario (`.95`) | `scale(.97)` en todo lo que se toca (horarios, tarjetas, pestañas, salir, agregar, Stepper) | El dedo siente que la app respondió |
| `:hover` sin condición | Dentro de `@media (hover: hover) and (pointer: fine)` | En celular el hover se quedaba "pegado" después de tocar |
| Destello gris al tocar (iOS/Android) | `-webkit-tap-highlight-color: transparent` + `touch-action: manipulation` | Se siente app, no página web; sin espera de doble toque |
| Modal: `max-height: calc(100vh - 32px)`, sin salida animada | `100dvh`, salida de 150 ms (más rápida que la entrada de 220 ms), `Esc` cierra | `100vh` se corta bajo la barra del navegador; lo que aparece animado también debe irse animado |
| Modal entra en 350 ms | 220 ms `ease-out` fuerte | Modales: 200–300 ms |
| Cartel de guardado: un solo bloque de 500 ms | Entrada escalonada (cartel → lista → botones, 60 ms) de 320 ms | Momento poco frecuente: se permite celebrar, pero ordenado |
| Movimiento reducido: `transition: none` en todo | Se quita el desplazamiento y se conservan los fundidos de color y opacidad | Reducir no es eliminar: los fundidos ayudan a entender |
| Barra fija sin margen de muesca | `env(safe-area-inset-*)` y `viewport-fit=cover` | En iPhone el contenido quedaba bajo la muesca o la barra de inicio |
| `.atajos` sin estilos | Fila con espacio y salto de línea | Los botones "Lunes a sábado / Todo el mes / Borrar todo" quedaban pegados |
| `transition` con duraciones sueltas (.1s, .12s, .15s) | Tokens `--ease-out`, `--dur-press` y `--dur-ui` en `:root` | Un solo criterio de movimiento en toda la app |
