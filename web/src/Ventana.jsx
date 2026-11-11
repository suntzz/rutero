import { useEffect, useRef, useState } from 'react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';

import { Icono } from './ui';

// Armazón de ventana: sale más rápido de lo que entra (150 ms frente a 220 ms); Esc o tocar afuera cierra.
// En celular es una hoja que sube desde abajo.
export default function Ventana({ titulo, subtitulo, onCerrar, children, pie, className = '' }) {
  const [saliendo, setSaliendo] = useState(false);
  const caja = useRef(null);
  function cerrar() {
    if (saliendo) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onCerrar(); return; }
    setSaliendo(true);
    setTimeout(onCerrar, 150);
  }
  const cerrarRef = useRef(cerrar);
  cerrarRef.current = cerrar;
  useEffect(() => {
    const previo = document.activeElement;
    caja.current?.focus({ preventScroll: true });
    const tecla = (e) => e.key === 'Escape' && cerrarRef.current();
    document.addEventListener('keydown', tecla);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = '';
      previo?.focus?.({ preventScroll: true });
    };
  }, []);
  return (
    <div className={`visor${saliendo ? ' visor--sale' : ''}`} role="dialog" aria-modal="true" aria-labelledby="visor-titulo" onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <div className={`visor__caja ${className}`} ref={caja} tabIndex={-1}>
        <div className="visor__cab">
          <div>
            <h2 id="visor-titulo">{titulo}</h2>
            {subtitulo && <p className="visor__sub">{subtitulo}</p>}
          </div>
          <button type="button" className="visor__cerrar" onClick={cerrar} aria-label="Cerrar"><Icono icon={Cancel01Icon} size={22} /></button>
        </div>
        {children}
        {pie && <div className="visor__pie">{pie}</div>}
      </div>
    </div>
  );
}
