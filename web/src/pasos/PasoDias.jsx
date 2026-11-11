import { useMemo, useRef, useState } from 'react';
import { Briefcase01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';

import Calendario, { nombreNovedad, tonoNovedad } from '../Calendario';
import CountUp from '../reactbits/CountUp';
import { capital, fecha, hora12, minutos, rango12 } from '../api';
import { Aviso, Icono } from '../ui';
import { HORARIOS, contar } from './reglas';

function AlertaChoques({ cat, persona, choques }) {
  if (!choques.lista.length) return null;
  // Agrupa los días por motivo: "ya está en EXITO X de 10 a. m. a 6 p. m." o "tiene vacaciones".
  const motivos = new Map();
  for (const o of choques.lista) {
    const texto = o.novedad ? `tiene ${nombreNovedad(o.novedad).toLowerCase()}` : `ya está en ${o.pdv} de ${rango12(o.inicio, o.fin)}`;
    if (!motivos.has(texto)) motivos.set(texto, new Set());
    motivos.get(texto).add(fecha(cat.fechas[o.dia]).getUTCDate());
  }
  return (
    <div className="choque" role="alert">
      <b>No se puede: {capital(persona.nombre.split(' ')[0])} ya tiene turno a esa hora.</b>
      <ul>
        {[...motivos.entries()].map(([texto, ds]) => (
          <li key={texto}>{ds.size === 1 ? 'Día' : 'Días'} <b>{[...ds].join(', ')}</b>: {texto}</li>
        ))}
      </ul>
      <span>Toca esos días (en rojo) con el borrador o elige otro horario. Una persona no puede estar en dos sitios a la vez.</span>
    </div>
  );
}

// Valor que deja el pincel en un día.
function valorDe(pincel) {
  if (pincel.tipo === 'trabaja') return { inicio: pincel.inicio, fin: pincel.fin };
  if (pincel.tipo === 'novedad') return { novedad: pincel.novedad };
  return null;
}

function igual(a, b) {
  if (!a || !b) return a === b;
  return a.novedad ? a.novedad === b.novedad : a.inicio === b.inicio && a.fin === b.fin && !b.novedad;
}

// Paso 4: se elige un "pincel" (un horario, una novedad o el borrador) y se pinta en el calendario,
// tocando o arrastrando. Hoy y los días anteriores quedan bloqueados.
export default function PasoDias({ cat, dias, setDias, persona, agenda, choques, cerrados }) {
  const disponibles = HORARIOS.filter(([i, f]) => cat.horas.includes(i) && cat.horas.includes(f));
  const inicial = disponibles[0] || [cat.horas[0], cat.horas.at(-1)];
  const [pincel, setPincel] = useState({ tipo: 'trabaja', inicio: inicial[0], fin: inicial[1], otro: false });
  const [error, setError] = useState('');
  const objetivo = useRef(null);
  const horarioMalo = pincel.tipo === 'trabaja' && minutos(pincel.fin) <= minutos(pincel.inicio);

  // Lo que la persona ya tiene en otras tiendas, por día (punto gris en el calendario).
  const ocupado = useMemo(() => {
    const m = {};
    for (const o of agenda) (m[o.dia] = m[o.dia] || []).push(o);
    return m;
  }, [agenda]);

  function tocar(i, inicio) {
    if (horarioMalo) {
      setError('La hora de salida tiene que ser después de la hora de entrada.');
      return;
    }
    setError('');
    // Al empezar a tocar se decide si se pinta o se borra (tocar lo mismo otra vez lo quita).
    if (inicio) {
      const v = valorDe(pincel);
      objetivo.current = v && igual(dias[i], v) ? null : v;
    }
    const valor = objetivo.current;
    setDias((d) => d.map((x, j) => (j === i ? valor : x)));
  }

  function atajo(tipo) {
    if (tipo !== 'limpiar' && horarioMalo) {
      setError('La hora de salida tiene que ser después de la hora de entrada.');
      return;
    }
    setError('');
    const v = valorDe(pincel);
    setDias((d) => cat.fechas.map((iso, i) => {
      if (cerrados.has(i)) return d[i];
      if (tipo === 'limpiar') return null;
      if (tipo === 'lunsab' && fecha(iso).getUTCDay() === 0) return d[i];
      // Pintar horarios respeta las novedades ya marcadas.
      if (pincel.tipo === 'trabaja' && d[i] && d[i].novedad) return d[i];
      return v;
    }));
  }

  const elegido = (p) => pincel.tipo === p.tipo && (p.tipo === 'novedad' ? pincel.novedad === p.novedad : p.tipo === 'trabaja' ? !pincel.otro && pincel.inicio === p.inicio && pincel.fin === p.fin : true);
  const { diasT, horas, nov } = contar(dias);
  const porNovedad = cat.novedades.map((n) => [n, dias.filter((d) => d && d.novedad === n).length]).filter(([, k]) => k);
  const nombre = capital(persona.nombre.split(' ')[0]);
  const ayuda = pincel.tipo === 'trabaja'
    ? <>Toca o arrastra sobre los días: quedan de <b>{rango12(pincel.inicio, pincel.fin)}</b>.</>
    : pincel.tipo === 'novedad'
      ? <>Toca los días de <b>{nombreNovedad(pincel.novedad).toLowerCase()}</b>.</>
      : <>Toca los días que quieres dejar libres.</>;

  return (
    <div className="paso">
      <p className="paso__num">Paso 4 de 5</p>
      <h2>¿Qué días trabaja {nombre}?</h2>
      {cerrados.size > 0 && <p className="paso__ayuda">Solo se programa de mañana en adelante: los días que ya pasaron están bloqueados.</p>}

      <div className="dias">
        <aside className="paleta" aria-label="Qué vas a marcar">
          <p className="paleta__titulo">1 · ¿Qué vas a marcar?</p>

          <p className="paleta__grupo"><Icono icon={Briefcase01Icon} size={16} /> Trabaja</p>
          <div className="pinceles" role="radiogroup" aria-label="Horario de trabajo">
            {disponibles.map(([i, f]) => {
              const p = { tipo: 'trabaja', inicio: i, fin: f };
              return (
                <button key={i + f} type="button" role="radio" aria-checked={elegido(p)} className="pincel pincel--trabaja" onClick={() => setPincel({ ...p, otro: false })}>
                  <i aria-hidden="true" />{rango12(i, f)}
                </button>
              );
            })}
            <button type="button" role="radio" aria-checked={pincel.tipo === 'trabaja' && pincel.otro} className="pincel pincel--trabaja" onClick={() => setPincel((p) => ({ tipo: 'trabaja', inicio: p.inicio || inicial[0], fin: p.fin || inicial[1], otro: true }))}>
              <i aria-hidden="true" />Otro horario
            </button>
          </div>
          {pincel.tipo === 'trabaja' && pincel.otro && (
            <div className="otro-horario">
              <label>Entra
                <select value={pincel.inicio} onChange={(e) => setPincel((p) => ({ ...p, inicio: e.target.value }))}>{cat.horas.map((h) => <option key={h} value={h}>{hora12(h)}</option>)}</select>
              </label>
              <label>Sale
                <select value={pincel.fin} onChange={(e) => setPincel((p) => ({ ...p, fin: e.target.value }))}>{cat.horas.map((h) => <option key={h} value={h}>{hora12(h)}</option>)}</select>
              </label>
            </div>
          )}

          <p className="paleta__grupo">No viene</p>
          <div className="pinceles" role="radiogroup" aria-label="Novedad">
            {cat.novedades.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={elegido({ tipo: 'novedad', novedad: n })} className={`pincel tono--${tonoNovedad(n)}`} onClick={() => setPincel({ tipo: 'novedad', novedad: n })}>
                <i aria-hidden="true" />{nombreNovedad(n)}
              </button>
            ))}
          </div>

          <div className="pinceles">
            <button type="button" role="radio" aria-checked={pincel.tipo === 'libre'} className="pincel pincel--libre" onClick={() => setPincel({ tipo: 'libre' })}>
              <Icono icon={Cancel01Icon} size={16} /> Borrador (dejar libre)
            </button>
          </div>

          <p className="paleta__titulo">2 · Atajos</p>
          <div className="atajos">
            <button type="button" className="btn btn--sec btn--peq" onClick={() => atajo('lunsab')}>Lunes a sábado</button>
            <button type="button" className="btn btn--sec btn--peq" onClick={() => atajo('todos')}>Todo el mes</button>
            <button type="button" className="btn btn--sec btn--peq" onClick={() => atajo('limpiar')}>Borrar todo</button>
          </div>
        </aside>

        <div className="dias__calendario">
          <p className="bloque__ayuda dias__ayuda">{ayuda}</p>
          <Aviso tipo="error">{error}</Aviso>
          <Calendario fechas={cat.fechas} dias={dias} ocupado={ocupado} choques={choques.dias} cerrados={cerrados} onTocar={tocar} />

          <div className="leyenda" aria-hidden="true">
            <span><i className="leyenda__c leyenda__c--trabaja" />Trabaja</span>
            {cat.novedades.map((n) => <span key={n}><i className={`leyenda__c tono--${tonoNovedad(n)}`} />{nombreNovedad(n)}</span>)}
            <span><i className="leyenda__c leyenda__c--choque" />Choca</span>
            {cerrados.size > 0 && <span><i className="leyenda__c leyenda__c--cerrado" />Ya pasó</span>}
            {agenda.length > 0 && <span><i className="leyenda__p" />Turno en otra tienda</span>}
          </div>

          <AlertaChoques cat={cat} persona={persona} choques={choques} />

          <div className="resumen" aria-live="polite">
            <div><b><CountUp to={diasT} duration={0.45} trigger="load" mode="roll" /></b><span>días de trabajo</span></div>
            <div><b><CountUp to={horas} duration={0.45} trigger="load" mode="roll" /></b><span>horas</span></div>
            <div><b><CountUp to={nov} duration={0.45} trigger="load" mode="roll" /></b><span>días que no viene</span></div>
          </div>
          {porNovedad.length > 0 && (
            <p className="resumen__nov">{porNovedad.map(([n, k]) => <span key={n} className={`tono--${tonoNovedad(n)}`}><i aria-hidden="true" />{nombreNovedad(n)}: {k}</span>)}</p>
          )}
        </div>
      </div>
    </div>
  );
}
