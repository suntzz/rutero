# Auditoría del front de Rutero — 4 de noviembre de 2026

Esta auditoría cubre **solo la interfaz**: las dos páginas React (campo e interno), los estilos, los componentes de React Bits y la experiencia en celular. El servidor no se evalúa aquí; está en `AUDITORIA.md`, que queda como histórico.

**Skills usadas como criterio:**
- `emil-design-eng` (Emil Kowalski): movimiento y pulido.
- `unslop`: carácter, espaciado y textos.
- `mobile-native`: sensación de app en el celular.
- `design:accessibility-review`: WCAG 2.2 AA.
- `react-bits`: uso y ajuste de los componentes.

**Percentiles:** comparan Rutero con apps web internas de operación en campo. P50 es una app típica, P90 está entre las mejores 10 de cada 100 y P99,99 es referencia mundial. Son estimaciones de criterio, no mediciones.

---

## 1. Calificación por rol (antes → después de esta ronda)

| Rol | Antes | Después | Lo que más pesó |
|---|---|---|---|
| UX para usuarios no técnicos | P82 | **P88** | Las 4 funciones quedan separadas en el inicio; el calendario aparece en Revisar; "Aún no has programado" lleva a un toque de programar |
| Ingeniería de diseño (Kowalski) | P66 → P78 | **P84** | Tokens de movimiento; diálogo con salida más rápida que la entrada; hoja inferior en celular; nada se anima mientras se escribe |
| Sistema visual | P75 | **P86** | Todos los colores son tokens; hay modo claro y oscuro, logo negativo en oscuro y paleta del fondo por tema |
| Accesibilidad (WCAG 2.2 AA) | P60 | **P74** | Contraste del texto gris corregido (#676e6a); foco dentro de los diálogos que vuelve al cerrar; `Esc`; días bloqueados con `aria-disabled` |
| Experiencia en celular | P55 → P70 | **P80** | Sin desborde horizontal a 375 px (la cabecera se compacta); `dvh`; zonas seguras; botones del tema y de inicio de 40 px |
| Textos (copy) | P78 | **P84** | Nombres de las funciones iguales a los del negocio; mensajes que dicen qué pasa y qué hacer ("El correo sale apenas el área active el envío") |
| Rendimiento percibido | P72 | **P78** | Esqueletos en todas las cargas; animaciones de 150–320 ms; el fondo WebGL se pausa con movimiento reducido |

| Producto | Antes | Después |
|---|---|---|
| App de campo | P72 | **P84** |
| Panel interno | P68 | **P78** |

---

## 2. Qué falta para P99,99 (solo front)

**UX:**
- Probar con 5 LAS reales y medir el tiempo que tardan en programar una persona.
- Dividir el paso 4 (horario y calendario en una vista; novedades en otra).
- Un "deshacer" de 5 segundos después de cancelar.

**Ingeniería de diseño:**
- Arrastrar para cerrar la hoja inferior (con velocidad, sin umbral fijo).
- Transición compartida entre la tarjeta de la persona y su calendario.
- Revisar las animaciones en un celular real, en cámara lenta.

**Sistema visual:**
- Una tipografía propia en lugar de la del sistema.
- Iconos de estado ilustrados para los vacíos ("Todo tu equipo tiene programación").

**Accesibilidad:**
- Navegar el calendario con las flechas.
- Atrapar el foco con `Tab` dentro del diálogo (hoy solo entra y vuelve).
- Probar con VoiceOver y TalkBack.
- Objetivos táctiles de 44 px en los días del calendario en pantallas de 320 px.

**Celular:**
- PWA instalable con pantalla sin conexión.
- Botón principal fijo abajo con `env(safe-area-inset-bottom)`.
- Fondo estático cuando el celular está en ahorro de batería.

**Textos:** revisar cada mensaje con un LAS; usar "tú" o "usted" según cómo hable el equipo.

**Rendimiento:**
- Separar el código por pantalla (`import()` dinámico); hoy el JS principal pesa 270 kB.
- Precargar Inicio mientras se escribe la cédula.

## 3. Plan (Pareto y dependencias)

| # | Trabajo | Por qué en este orden |
|---|---|---|
| 1 | Prueba con 5 LAS reales | Barato y define qué arreglar primero |
| 2 | Separar el JS por pantalla | Base de rendimiento; el celular de gama baja es el usuario real |
| 3 | Botón principal fijo abajo + dividir el paso 4 | El mayor ahorro de esfuerzo en la tarea más repetida |
| 4 | Accesibilidad: flechas en el calendario, foco atrapado, lectores de pantalla | Después de 3, para no rehacerlo |
| 5 | Hoja inferior que se cierra arrastrando | Pulido sobre una estructura ya estable |
| 6 | PWA y modo sin conexión | Depende de que el servidor guarde lo pendiente al reconectar |

---

## 4. Lo aplicado en esta ronda

| Antes | Después | Por qué |
|---|---|---|
| Colores fijos (`#fff`, `rgba(...)`) en todo el CSS | Tokens en `:root`, redefinidos en `prefers-color-scheme: dark` y en `[data-theme]` | Un solo lugar para cada color; el modo oscuro no duplica reglas |
| Solo modo claro | Botón sol/luna en la cabecera; sigue al celular hasta que el usuario elige; `public/tema.js` lo aplica antes de pintar | Sin destello blanco al abrir en oscuro; la preferencia se recuerda |
| React Bits con `theme="light"` fijo | `Lista`, `Brillo` y `Tarjeta` toman el tema del contexto (AnimatedList, BorderGlow, SpotlightCard, Stepper, Grainient, GradientText) | Los componentes cambian con el tema sin repetir props |
| Logo con letras oscuras | Versión negativa del logo en oscuro; solo el símbolo en celulares de menos de 440 px | La palabra "rutero" no se veía sobre fondo oscuro, y la cabecera se desbordaba con el botón de inicio |
| Cabecera de 401 px en un celular de 375 px | Logo compacto y "Salir" solo con icono | El navegador achicaba toda la página |
| La hoja inferior usaba la misma animación que el detalle | `hoja-entra` / `hoja-sale` propias | El detalle del área interna entraba desde fuera de la pantalla |
| Texto gris `#8b928e` (2,9:1 sobre el fondo) | `#676e6a` (4,7:1 sobre el fondo) | Contraste AA para textos pequeños |
| Pantalla única de 5 pasos | Inicio con 4 funciones: Crear rutero, Actualizar rutero, Petición de usuario, Petición de punto de venta | Cada tarea tiene su entrada y su nombre |
| Resumen sin calendario | Calendario de solo lectura en "Revisar" | Pedido del equipo: "mostrar calendario en resumen" |
| Se podían marcar días pasados | Hoy y los días anteriores aparecen bloqueados ("Ya pasó") | Solo se programa y modifica de mañana en adelante |
| Otro evento el mismo día pasaba sin aviso | Diálogo: "¿Seguir con X o cambiar todo a Y?" | Regla nueva: un evento por persona y día |
| Horario largo cortado en la celda ("10…") | Formato corto "10a–6p", con el horario completo al pasar el cursor | Se lee en 375 px |
| `Programar.jsx` de 790 líneas | `pasos/` (5 archivos) + `pasos/reglas.js` | Cada paso se entiende y se cambia por separado |
