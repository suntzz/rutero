import { useMemo, useState } from 'react';
import { ArrowRight01Icon, Tag01Icon } from '@hugeicons/core-free-icons';

import { capital, claveLista, sinTildes } from '../api';
import { Aviso, Buscador, Icono, Lista } from '../ui';

// Paso 3: el evento. Si la base ya dice en qué evento está la persona, primero se pregunta si sigue
// en ese; cambiarlo también cambia su marca, y eso lo hace el área con una petición de cambio.
export default function PasoEvento({ eventos, evento, sugerido, eventoMarca, persona, onElegir }) {
  const enBase = sugerido && eventos.includes(sugerido) ? sugerido : '';
  const [cambiar, setCambiar] = useState(!enBase || (evento && evento !== enBase));
  const [q, setQ] = useState('');
  const t = sinTildes(q.trim());
  const otros = useMemo(() => eventos.filter((e) => e !== enBase), [eventos, enBase]);
  const visibles = otros.filter((e) => !t || sinTildes(e).includes(t) || sinTildes(eventoMarca[e] || '').includes(t));
  const nombre = persona ? capital(persona.nombre.split(' ')[0]) : 'Esta persona';

  const cabeza = (
    <>
      <p className="paso__num">Paso 3 de 5</p>
      <h2>¿Qué evento?</h2>
    </>
  );

  if (enBase && !cambiar) {
    return (
      <div className="paso">
        {cabeza}
        <div className="evento-base">
          <span className="evento-base__icono"><Icono icon={Tag01Icon} size={24} /></span>
          <div>
            <p>{nombre} está en</p>
            <b>{enBase}</b>
            <span>Marca {eventoMarca[enBase] || '—'}</span>
          </div>
        </div>
        <p className="paso__ayuda">¿Sigue con ese evento este mes?</p>
        <div className="evento-base__botones">
          <button type="button" className="btn btn--grande" onClick={() => onElegir(enBase)}>Sí, seguir con {enBase} <Icono icon={ArrowRight01Icon} size={18} /></button>
          <button type="button" className="btn btn--sec btn--grande" onClick={() => setCambiar(true)}>No, cambiar de evento</button>
        </div>
      </div>
    );
  }

  return (
    <div className="paso">
      {cabeza}
      {enBase ? (
        <Aviso tipo="alerta" accion={<button type="button" className="btn-link" onClick={() => { setCambiar(false); setQ(''); }}>Mejor seguir con {enBase}</button>}>
          Cambiar de evento también cambia la marca de {nombre} (hoy {eventoMarca[enBase] || 'sin marca'}). Eso lo hace el área: se crea una <b>petición de cambio</b> que va en tu formato.
        </Aviso>
      ) : <p className="paso__ayuda">Toca la campaña. Al lado ves la marca a la que pertenece.</p>}
      <Buscador valor={q} onCambio={setQ} placeholder="Buscar evento o marca" />
      {visibles.length ? (
        <Lista
          key={claveLista(visibles)}
          escribiendo={!!t}
          maxHeight={340}
          initialSelectedIndex={visibles.indexOf(evento)}
          items={visibles.map((e) => ({ id: e, title: e, description: eventoMarca[e] ? `Marca ${eventoMarca[e]}` : undefined }))}
          onItemSelect={(_, i) => onElegir(visibles[i])}
        />
      ) : <p className="vacio-txt">No hay eventos con “{q.trim()}”.</p>}
    </div>
  );
}
