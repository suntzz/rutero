import { useState } from 'react';
import { UserAdd01Icon } from '@hugeicons/core-free-icons';

import { api, capital, claveLista, sinTildes } from '../api';
import { Aviso, Brillo, Buscador, EsqueletoLista, Ficha, Icono, Iniciales, Lista } from '../ui';

// Paso 1: quién va a trabajar. Solo aparece el equipo del LAS; si falta alguien, se pide crearlo.
export default function PasoPersona({ equipo, persona, buscando: trayendo, fija, onElegir, onPedirUsuario, onError }) {
  const [q, setQ] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState('');

  const t = sinTildes(q.trim());
  const soloNumeros = /^\d{5,}$/.test(q.trim());
  const visibles = equipo.filter((p) => !t || sinTildes(p.nombre).includes(t) || p.cedula.startsWith(t));

  async function buscarCedula() {
    setBuscando(true);
    setAviso('');
    try {
      onElegir(await api(`/api/persona/${q.trim()}`));
    } catch (e) {
      if (e.status === 404) setAviso('Esa cédula no está en la base. Si es una persona nueva, pide que la creen.');
      else if (e.status === 403) setAviso(e.message);
      else onError(e);
    } finally {
      setBuscando(false);
    }
  }

  const cabeza = (
    <>
      <p className="paso__num">Paso 1 de 5</p>
      <h2>¿Quién va a trabajar?</h2>
    </>
  );

  if (trayendo) {
    return <div className="paso" role="status" aria-label="Buscando la persona">{cabeza}<div className="ficha"><EsqueletoLista filas={1} /></div></div>;
  }

  if (persona) {
    return (
      <div className="paso">
        {cabeza}
        <Ficha
          etiqueta={persona.nuevo ? 'Persona (pedida, aún no está en Nutresa)' : 'Persona'}
          titulo={capital(persona.nombre)}
          datos={[['Cédula', persona.cedula], ['Ciudad', capital(persona.ciudad)], ['LAS', capital(persona.las)]]}
          onCambiar={fija ? null : () => onElegir(null)}
        />
      </div>
    );
  }

  return (
    <div className="paso">
      {cabeza}
      <p className="paso__ayuda">Toca a alguien de tu equipo, o escribe su nombre o cédula.</p>
      <Buscador valor={q} onCambio={(v) => { setQ(v); setAviso(''); }} placeholder="Nombre o cédula" inputMode="search" />
      {visibles.length > 0 && (
        <Lista
          key={claveLista(visibles.map((p) => p.cedula))}
          escribiendo={!!t}
          maxHeight={320}
          items={visibles.map((p) => ({ id: p.cedula, title: capital(p.nombre), description: `C.C. ${p.cedula}${p.nuevo ? ' · pedida' : ''}`, icon: <Iniciales nombre={p.nombre} /> }))}
          onItemSelect={(_, i) => onElegir({ ...visibles[i], buscar: true })}
        />
      )}
      {visibles.length === 0 && !soloNumeros && <p className="vacio-txt">Nadie de tu equipo coincide. Si sabes la cédula, escríbela completa.</p>}
      {soloNumeros && visibles.length === 0 && (
        <button type="button" className="btn btn--bloque" onClick={buscarCedula} disabled={buscando}>
          {buscando ? 'Buscando…' : `Buscar la cédula ${q.trim()}`}
        </button>
      )}
      <Aviso tipo="error">{aviso}</Aviso>
      <Brillo className="agregar-borde">
        <button type="button" className="agregar" onClick={onPedirUsuario}>
          <span className="agregar__icono"><Icono icon={UserAdd01Icon} size={22} /></span>
          <span><b>¿No está? Pedir creación de usuario</b><small>Llenas sus datos y se envían al área por correo</small></span>
        </button>
      </Brillo>
    </div>
  );
}
