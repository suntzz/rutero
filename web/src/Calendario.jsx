import { useEffect, useRef } from 'react';
import { MESES, capital, fecha, hora12 } from './api';

const DSEM = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const CORTOS = { VACACIONES: 'Vacaciones', INCAPACIDAD: 'Incapacidad', COMPENSATORIO: 'Compensatorio', 'REUNIONES PROGRAMADAS': 'Reunión' };

export function nombreNovedad(n) {
  return CORTOS[n] || capital(n);
}

// Cada novedad con su color (vacaciones azul, incapacidad rojo, compensatorio violeta, reunión ámbar).
const TONOS = { VACACIONES: 'vacaciones', INCAPACIDAD: 'incapacidad', COMPENSATORIO: 'compensatorio', 'REUNIONES PROGRAMADAS': 'reunion' };
export function tonoNovedad(n) {
  return TONOS[n] || 'reunion';
}

// Calendario del mes. Cada día muestra en palabras lo que tiene: el horario, la novedad,
// "Libre", o en rojo "Ya trabaja" si choca con otra tienda. Se toca o se arrastra el dedo.
// `cerrados`: días que ya pasaron (hoy incluido), que no se pueden tocar. `soloLectura`: solo mostrar.
const SIN_DIAS = new Set();
export default function Calendario({ fechas, dias, ocupado = {}, choques = SIN_DIAS, cerrados = SIN_DIAS, soloLectura = false, onTocar }) {
  const arrastrando = useRef(false);
  const ultimo = useRef(-1);

  useEffect(() => {
    const soltar = () => { arrastrando.current = false; ultimo.current = -1; };
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
    return () => {
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
    };
  }, []);

  const primero = fecha(fechas[0]);
  const mesBase = primero.getUTCMonth();
  const offset = (primero.getUTCDay() + 6) % 7;

  function tocar(i, inicio) {
    if (soloLectura || cerrados.has(i) || i === ultimo.current) return;
    ultimo.current = i;
    onTocar(i, inicio);
  }

  return (
    <div className={`cal${soloLectura ? ' cal--lectura' : ''}`}>
      <div className="cal__mes">{capital(MESES[mesBase])} {primero.getUTCFullYear()}</div>
      <div
        className="cal__grilla"
        onPointerMove={(e) => {
          if (!arrastrando.current) return;
          const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-dia]');
          if (el) tocar(Number(el.dataset.dia), false);
        }}
      >
        {DSEM.map((d, i) => <div key={d} className={`cal__dsem${i === 6 ? ' cal__dsem--dom' : ''}`}>{d}</div>)}
        {Array.from({ length: offset }, (_, i) => <div key={`v${i}`} aria-hidden="true" />)}
        {fechas.map((iso, i) => {
          const f = fecha(iso);
          const d = dias[i];
          const otroMes = f.getUTCMonth() !== mesBase;
          const choca = choques.has(i);
          const cerrado = cerrados.has(i);
          const enOtra = ocupado[i] || [];
          let clase = 'cal__dia';
          let texto;
          if (choca) { clase += ' cal__dia--choque'; texto = 'Ya trabaja'; }
          else if (d && d.cancelada) { clase += ' cal__dia--novedad'; texto = 'Cancelado'; }
          else if (d && d.novedad) { clase += ` cal__dia--novedad tono--${tonoNovedad(d.novedad)}`; texto = nombreNovedad(d.novedad); }
          else if (d) { clase += ' cal__dia--trabaja'; texto = null; }
          else if (cerrado) { texto = 'Ya pasó'; }
          else { texto = enOtra.length ? 'Libre aquí' : 'Libre'; }
          if (otroMes) clase += ' cal__dia--otro';
          if (cerrado) clase += ' cal__dia--cerrado';
          const etiqueta = `${f.getUTCDate()} de ${MESES[f.getUTCMonth()]}: ${
            choca ? 'choca con otra tienda' : d && d.inicio ? `trabaja de ${hora12(d.inicio)} a ${hora12(d.fin)}` : texto}`;
          return (
            <button
              key={iso}
              type="button"
              data-dia={i}
              className={clase}
              aria-label={etiqueta}
              aria-pressed={!!d}
              aria-disabled={cerrado || soloLectura || undefined}
              tabIndex={soloLectura ? -1 : undefined}
              onPointerDown={(e) => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                e.currentTarget.releasePointerCapture?.(e.pointerId);
                arrastrando.current = true;
                tocar(i, true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ultimo.current = -1; tocar(i, true); }
              }}
            >
              <span className="cal__num">
                {f.getUTCDate()}
                {otroMes && <small>{MESES[f.getUTCMonth()].slice(0, 3)}</small>}
              </span>
              {d && d.inicio && !choca ? (
                <span className="cal__hora"><span>{hora12(d.inicio)}</span><span>{hora12(d.fin)}</span></span>
              ) : (
                <span className="cal__txt">{texto}</span>
              )}
              {d && d.inicio && !choca && <span className="cal__check" aria-hidden="true">✓</span>}
              {enOtra.length > 0 && !choca && <span className="cal__punto" title="Tiene turno en otra tienda" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
