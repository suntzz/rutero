import { useEffect, useState } from 'react';
import { StoreAdd01Icon } from '@hugeicons/core-free-icons';

import { api, capital, claveLista } from '../api';
import { Buscador, EsqueletoLista, Ficha, Icono, Lista } from '../ui';

// Paso 2: en qué tienda. Se busca por SAP (o nombre); el LAS ya no crea tiendas, las pide.
export default function PasoTienda({ pdv, fija, onElegir, onPedirPdv, onError }) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    const t = q.trim();
    if (!t) { setResultados([]); return undefined; }
    setCargando(true);
    // Si el LAS sigue escribiendo, las respuestas de búsquedas anteriores se descartan.
    let vigente = true;
    const id = setTimeout(() => {
      api(`/api/pdv?q=${encodeURIComponent(t)}`)
        .then((r) => vigente && setResultados(r))
        .catch(onError)
        .finally(() => vigente && setCargando(false));
    }, 200);
    return () => { vigente = false; clearTimeout(id); };
  }, [q]);

  const cabeza = (
    <>
      <p className="paso__num">Paso 2 de 5</p>
      <h2>¿En qué tienda?</h2>
    </>
  );

  if (pdv) {
    return (
      <div className="paso">
        {cabeza}
        <Ficha
          etiqueta={`SAP ${pdv.sap}`}
          titulo={pdv.nombre}
          datos={[['Ciudad', capital(pdv.ciudad)], ['Canal', capital(pdv.canal)], ['Dirección', pdv.direccion]]}
          onCambiar={fija ? null : () => onElegir(null)}
        />
      </div>
    );
  }

  const t = q.trim();
  return (
    <div className="paso">
      {cabeza}
      <p className="paso__ayuda">Escribe el <b>código SAP</b> (o el nombre). Los resultados salen mientras escribes.</p>
      <Buscador valor={q} onCambio={setQ} placeholder="Código SAP, ej: 10482208" inputMode="search" etiqueta="Buscar tienda por SAP o nombre" />
      {cargando && <EsqueletoLista filas={4} avatar={false} />}
      {!cargando && resultados.length > 0 && (
        <Lista
          key={claveLista(resultados.map((p) => p.sap))}
          maxHeight={320}
          items={resultados.map((p) => ({ id: p.sap, title: p.nombre, description: `SAP ${p.sap} · ${capital(p.ciudad)} · ${capital(p.canal)}` }))}
          onItemSelect={(_, i) => onElegir(resultados[i])}
        />
      )}
      {t && !cargando && resultados.length === 0 && <p className="vacio-txt">No encontramos tiendas con “{t}”.</p>}
      {t && !cargando && (
        <button type="button" className="btn-link btn-link--mas" onClick={onPedirPdv}>
          <Icono icon={StoreAdd01Icon} size={18} /> ¿No aparece? Pedir creación del punto de venta
        </button>
      )}
    </div>
  );
}
