# Rutero · Guía de uso del logo

## La idea

**Mes recorrido.** Los días programados del mes se conectan en una ruta escalonada que termina en el
punto de llegada (oro); los días libres quedan como puntos. Programar en Rutero es eso: recorrer el mes
día por día.

## Piezas

| Archivo (`final/`) | Para qué |
|---|---|
| `rutero-simbolo.svg` | Símbolo a color, sobre fondos claros |
| `rutero-simbolo-negativo.svg` | Símbolo sobre fondos oscuros o verde |
| `rutero-simbolo-pequeno.svg` | Símbolo para 16–32 px (puntos y llegada más grandes) |
| `rutero-simbolo-negro.svg` / `-blanco.svg` / `-verde.svg` | Una tinta (la llegada queda como hueco) |
| `rutero-horizontal.svg` (+ `-negativo`, `-negro`) | Logo principal: símbolo + nombre |
| `rutero-apilado.svg` (+ `-negativo`) | Para formatos cuadrados o verticales |
| `rutero-app-icon.svg` / `-maskable.svg` | Ícono de app y de Android |

Set web listo en `web/`: `favicon.ico`, `favicon.svg`, PNG de 16/32/48, `apple-touch-icon.png`,
`icon-192.png`, `icon-512.png`, `maskable-512.png` y `site.webmanifest`.

## Colores

| Nombre | HEX | RGB | Uso |
|---|---|---|---|
| Verde Rutero | `#0F6E5A` | 15 · 110 · 90 | Ruta, días libres, botones principales |
| Oro llegada | `#F5B942` | 245 · 185 · 66 | Solo el punto de llegada y acentos pequeños |
| Menta | `#9FD3BF` | 159 · 211 · 191 | Días libres sobre fondo verde |
| Tinta | `#16241F` | 22 · 36 · 31 | Nombre "rutero" y textos |

CMYK aproximado (verificar con la imprenta): Verde 86·0·18·57 · Oro 0·24·73·4.
El verde sobre blanco tiene contraste 6,2:1 (sirve para texto). El oro sobre blanco tiene 1,8:1: úsalo solo como acento, nunca para texto.

## Espacio libre y tamaños mínimos

- **Espacio libre:** alrededor del logo, deja como mínimo el grosor de un tramo de la ruta
  (≈ ¼ del alto del símbolo). Nada de texto ni bordes dentro de ese espacio.
- **Símbolo:** mínimo 16 px. Por debajo de 32 px usa `rutero-simbolo-pequeno.svg`.
- **Logo horizontal:** mínimo 96 px de ancho (25 mm impreso).

## Fondos permitidos

- Blanco, crema y fondos claros → versión a color.
- Verde Rutero, tinta o fotos oscuras → versión negativo.
- Si solo hay una tinta (sellos, grabado, fax) → versión negro, blanco o verde.

## No hacer

- No cambiar los colores ni poner el punto de llegada en otro color que no sea oro (o hueco, en una tinta).
- No girar, voltear ni deformar el símbolo: la ruta siempre sube hacia la derecha.
- No quitar ni mover los días libres.
- No reescribir "rutero" con otra fuente: el nombre está dibujado a medida.
- No poner sombras, contornos ni degradados sobre el logo.
- No usar la versión a color sobre fondos que le quiten contraste (verde medio, fotos con mucho detalle).

## Construcción

Lienzo de 256 × 256 con una cuadrícula de 3 × 3 días (centros en 56, 128 y 200). La ruta tiene 60 de
grosor con extremos redondos de radio 30; los días libres miden 24 de diámetro (34 en el corte pequeño)
y la llegada 30 (38 en el corte pequeño). El nombre usa un trazo uniforme de 28 con puntas redondas, la
misma lógica de la ruta. Todo se regenera con `python3 generar.py`.

## Notas

- El nombre "rutero" está dibujado con trazos; para imprenta conviene convertir los trazos en contornos
  (en Illustrator: *Objeto › Trazado › Contornear trazo*).
- No se hizo una búsqueda de marcas registradas. Antes de un uso externo amplio, recomendamos una búsqueda
  profesional.
