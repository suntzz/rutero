"""Genera las piezas del logo de Rutero (concepto "Mes recorrido").

Construcción (lienzo 256 × 256, cuadrícula de 3 × 3 días con centros en 56, 128 y 200):
- La ruta es una escalera de tres tramos de 60 de grosor con extremos redondos (radio 30):
  sube por la columna izquierda, cruza al centro y termina en el día de arriba a la derecha.
- El día de llegada lleva un hueco circular (una tinta) o un punto oro (color).
- Los cuatro días libres son puntos sueltos.
"""

from pathlib import Path

VERDE = '#0F6E5A'
ORO = '#F5B942'
MENTA = '#9FD3BF'

RUTA = ('M128 26h72a30 30 0 0 1 0 60h-42v42a30 30 0 0 1-30 30H86v42a30 30 0 0 1-60 0'
        'v-72a30 30 0 0 1 30-30h42V56a30 30 0 0 1 30-30Z')
LLEGADA = (200, 56)
LIBRES = [(56, 56), (200, 128), (128, 200), (200, 200)]


def hueco(r):
    x, y = LLEGADA
    # Círculo como dos medias vueltas: sin ambigüedad de centro.
    return f'M{x - r} {y}a{r} {r} 0 1 0 {2 * r} 0a{r} {r} 0 1 0 {-2 * r} 0Z'


def simbolo(ruta, libres, oro=None, r_libre=12, r_llegada=15):
    partes = [f'<path fill-rule="evenodd" fill="{ruta}" d="{RUTA}{hueco(r_llegada)}"/>']
    if oro:
        partes.append(f'<circle cx="{LLEGADA[0]}" cy="{LLEGADA[1]}" r="{r_llegada}" fill="{oro}"/>')
    partes += [f'<circle cx="{x}" cy="{y}" r="{r_libre}" fill="{libres}"/>' for x, y in LIBRES]
    return '\n  '.join(partes)


def svg(cuerpo, ancho=256, alto=256):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {ancho} {alto}">\n'
            f'  <title>Rutero</title>\n  {cuerpo}\n</svg>\n')


# Nombre "rutero" dibujado a mano: trazo uniforme de 28 con puntas redondas (como la ruta).
# Línea base y=200, altura de x 96–200, ascendente de la t en 60. Ancho de tinta 0–674.
TRAZOS_NOMBRE = [
    'M12 200V96M12 140a44 44 0 0 1 44-44',                  # r
    'M104 96v52a40 40 0 0 0 80 0V96M184 96v104',             # u
    'M248 60v108a32 32 0 0 0 32 32M230 96h46',               # t
    'M322 148h104a52 52 0 1 0-12.2 33.4',                    # e
    'M472 200V96M472 140a44 44 0 0 1 44-44',                 # r
    'M610 96a52 52 0 1 1 0 104a52 52 0 1 1 0-104Z',          # o
]
TINTA = '#16241F'


def nombre(color, x=0, y=0, escala=1.0):
    d = ''.join(TRAZOS_NOMBRE)
    return (f'<path transform="translate({x} {y}) scale({escala})" d="{d}" fill="none" stroke="{color}" '
            f'stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>')


def grupo(cuerpo, x, y, escala):
    return f'<g transform="translate({x} {y}) scale({escala})">\n    {cuerpo.replace(chr(10) + "  ", chr(10) + "    ")}\n  </g>'


def lockups(out):
    # Horizontal: símbolo de 256 + nombre a 0,82 (tinta 48–212 → altura de x ≈ 85), separados medio símbolo.
    e = 0.82
    alto_tinta = (212 - 48) * e
    y_nombre = (256 - alto_tinta) / 2 - 48 * e
    ancho = 256 + 72 + 674 * e
    for sufijo, sim, letra in [('', simbolo(VERDE, VERDE, ORO), TINTA),
                               ('-negativo', simbolo('#FFFFFF', MENTA, ORO), '#FFFFFF'),
                               ('-negro', simbolo('#000000', '#000000'), '#000000')]:
        (out / f'rutero-horizontal{sufijo}.svg').write_text(svg(
            f'{sim}\n  {nombre(letra, 256 + 72, round(y_nombre, 1), e)}', round(ancho), 256))
    # Apilado: símbolo arriba, nombre centrado debajo.
    e2 = 0.62
    ancho2 = 674 * e2
    alto2 = 256 + 56 + (212 - 48) * e2
    lienzo = max(ancho2, 256) + 40
    for sufijo, sim, letra in [('', simbolo(VERDE, VERDE, ORO), TINTA),
                               ('-negativo', simbolo('#FFFFFF', MENTA, ORO), '#FFFFFF')]:
        (out / f'rutero-apilado{sufijo}.svg').write_text(svg(
            f'{grupo(sim, round((lienzo - 256) / 2, 1), 0, 1)}\n'
            f'  {nombre(letra, round((lienzo - ancho2) / 2, 1), round(256 + 56 - 48 * e2, 1), e2)}',
            round(lienzo), round(alto2)))


def main():
    out = Path(__file__).parent / 'final'
    out.mkdir(exist_ok=True)
    piezas = {
        'rutero-simbolo.svg': simbolo(VERDE, VERDE, ORO),
        'rutero-simbolo-negro.svg': simbolo('#000000', '#000000'),
        'rutero-simbolo-blanco.svg': simbolo('#FFFFFF', '#FFFFFF'),
        'rutero-simbolo-verde.svg': simbolo(VERDE, VERDE),
        'rutero-simbolo-negativo.svg': simbolo('#FFFFFF', MENTA, ORO),
        # Corte para 16–32 px: puntos y llegada más grandes para que no se cierren.
        'rutero-simbolo-pequeno.svg': simbolo(VERDE, VERDE, ORO, r_libre=17, r_llegada=19),
    }
    for nombre, cuerpo in piezas.items():
        (out / nombre).write_text(svg(cuerpo))

    # Ícono de app: azulejo verde con la versión en negativo, tamaño pequeño.
    interior = simbolo('#FFFFFF', MENTA, ORO, r_libre=17, r_llegada=19).replace('\n  ', '\n    ')
    (out / 'rutero-app-icon.svg').write_text(svg(
        f'<rect width="256" height="256" rx="58" fill="{VERDE}"/>\n'
        f'  <g transform="translate(40 40) scale(0.6875)">\n    {interior}\n  </g>'))
    lockups(out)
    print('\n'.join(sorted(p.name for p in out.glob('*.svg'))))


if __name__ == '__main__':
    main()
