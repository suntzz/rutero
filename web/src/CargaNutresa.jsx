import { useEffect, useMemo, useState } from 'react';
import { Alert02Icon, CheckmarkCircle02Icon, CloudUploadIcon, StoreAdd01Icon, UserAdd01Icon } from '@hugeicons/core-free-icons';

import { api, capital } from './api';
import { Aviso, Campo, Esqueleto, EsqueletoLista, Icono } from './ui';
import Ventana from './Ventana';

// Carga directa de un usuario o un PDV NUEVO a las bases de Nutresa. Solo área interna.
// A la izquierda el formulario con todos los campos de la base; a la derecha el registro tal cual
// llegará a Nutresa, que se vuelve la confirmación antes de enviar.

const VACIO = {
  usuario: { CEDULA: '', NOMBRE: '', TELEFONO: '', CIUDAD: '', REGIONAL: '', MARCA: '', EVENTO: '', RUTA: '', CARGO: 'PROMOTOR', LAS: '', ENVIO_CAMP: 'ENVIO', ESTADO: 'ACTIVO' },
  pdv: { SAP: '', PDV: '', DIRECCION: '', CIUDAD: '', REGIONAL: '', CANAL: '', MARCA: '', EVENTO: '', LATITUD: '', LONGITUD: '' },
};

// Orden de las columnas en la base (igual que en Nutresa).
const COLUMNAS = {
  usuario: ['TELEFONO', 'CEDULA', 'REGIONAL', 'CIUDAD', 'NOMBRE', 'MARCA', 'EVENTO', 'RUTA', 'CARGO', 'LAS', 'ENVIO_CAMP', 'ESTADO'],
  pdv: ['EVENTO', 'MARCA', 'SAP', 'PDV', 'REGIONAL', 'CIUDAD', 'DIRECCION', 'CANAL', 'LATITUD', 'LONGITUD', 'GEO_OK'],
};

const mayus = (v) => String(v || '').toUpperCase();

// Lo que se ve en la ficha: mismo tratamiento que hace el servidor (mayúsculas, sin geo → SIN GEO).
function registro(tipo, f) {
  if (tipo === 'usuario') {
    return Object.fromEntries(COLUMNAS.usuario.map((k) => [k, ['CEDULA', 'TELEFONO'].includes(k) ? f[k].replace(/\D/g, '') : mayus(f[k]).trim()]));
  }
  const geo = f.LATITUD.trim() && f.LONGITUD.trim();
  return {
    ...Object.fromEntries(COLUMNAS.pdv.slice(0, 8).map((k) => [k, mayus(f[k]).trim()])),
    LATITUD: geo ? f.LATITUD.trim().replace(',', '.') : 'SIN GEO',
    LONGITUD: geo ? f.LONGITUD.trim().replace(',', '.') : 'SIN GEO',
    GEO_OK: geo ? 'OK' : 'NA',
  };
}

function desdePeticion(tipo, p) {
  const d = p?.datos || {};
  return Object.fromEntries(Object.keys(VACIO[tipo]).map((k) => {
    const v = d[k];
    if (tipo === 'pdv' && ['LATITUD', 'LONGITUD'].includes(k) && /SIN GEO/i.test(v || '')) return [k, ''];
    return [k, v === undefined || v === null ? VACIO[tipo][k] : String(v)];
  }));
}

function Opciones({ lista, vacio }) {
  return (
    <>
      <option value="" disabled>{vacio}</option>
      {lista.map((o) => <option key={o} value={o}>{o}</option>)}
    </>
  );
}

function Grupo({ titulo, children }) {
  return (
    <section className="carga__grupo" aria-label={titulo}>
      <h3>{titulo}</h3>
      {children}
    </section>
  );
}

function Ficha({ tipo, reg, faltan, cat }) {
  return (
    <div className="carga__ficha">
      <div className="carga__ficha-cab">
        <span className={`iniciales${tipo === 'pdv' ? ' iniciales--tienda' : ''}`}><Icono icon={tipo === 'pdv' ? StoreAdd01Icon : UserAdd01Icon} size={18} /></span>
        <div>
          <b>{tipo === 'pdv' ? (reg.PDV || 'Punto de venta nuevo') : (capital(reg.NOMBRE) || 'Usuario nuevo')}</b>
          <span>Así llega a <code>{cat.colecciones[tipo]}</code></span>
        </div>
      </div>
      <dl className="carga__tabla">
        {COLUMNAS[tipo].map((k) => (
          <div key={k} className={reg[k] ? '' : 'carga__vacio'}>
            <dt>{k}</dt>
            <dd>{reg[k] || '—'}</dd>
          </div>
        ))}
      </dl>
      <p className="carga__faltan">{faltan ? `Faltan ${faltan} ${faltan === 1 ? 'campo' : 'campos'}` : 'Listo para revisar'}</p>
    </div>
  );
}

function FormUsuario({ f, poner, cat, ruta, onSugerir }) {
  const eventos = cat.marcaEventos[f.MARCA] || [];
  return (
    <>
      <Grupo titulo="Persona">
        <div className="formulario__fila">
          <Campo etiqueta="Cédula" ayuda="Sin puntos"><input name="CEDULA" value={f.CEDULA} onChange={poner} inputMode="numeric" pattern="\d{5,12}" required autoComplete="off" /></Campo>
          <Campo etiqueta="Teléfono" ayuda="Celular de 10 números"><input name="TELEFONO" value={f.TELEFONO} onChange={poner} inputMode="tel" pattern="\d{7,10}" required autoComplete="off" /></Campo>
        </div>
        <Campo etiqueta="Nombre completo"><input name="NOMBRE" value={f.NOMBRE} onChange={poner} required autoComplete="off" /></Campo>
      </Grupo>
      <Grupo titulo="Ubicación">
        <div className="formulario__fila">
          <Campo etiqueta="Ciudad"><input name="CIUDAD" value={f.CIUDAD} onChange={poner} list="cn-ciudades" required autoComplete="off" /></Campo>
          <Campo etiqueta="Regional"><input name="REGIONAL" value={f.REGIONAL} onChange={poner} list="cn-regionales" required autoComplete="off" /></Campo>
        </div>
      </Grupo>
      <Grupo titulo="Evento y ruta">
        <div className="formulario__fila">
          <Campo etiqueta="Marca">
            <select name="MARCA" value={f.MARCA} required onChange={(e) => { const l = cat.marcaEventos[e.target.value] || []; poner({ MARCA: e.target.value, EVENTO: l.length === 1 ? l[0] : '' }); }}>
              <Opciones lista={Object.keys(cat.marcaEventos)} vacio="Elige la marca…" />
            </select>
          </Campo>
          <Campo etiqueta="Evento" ayuda={f.MARCA ? `${eventos.length} ${eventos.length === 1 ? 'evento' : 'eventos'} de ${f.MARCA}` : 'Primero elige la marca'}>
            <select name="EVENTO" value={f.EVENTO} required disabled={!f.MARCA} onChange={poner}>
              <Opciones lista={eventos} vacio={f.MARCA ? 'Elige el evento…' : '—'} />
            </select>
          </Campo>
        </div>
        <Campo etiqueta="Ruta" ayuda={ruta && ruta !== f.RUTA ? <>Sugerida: <button type="button" className="btn-link" onClick={onSugerir}>{ruta}</button></> : ruta ? 'Sugerida: 3 letras del evento + regional + siguiente número' : 'Se sugiere al elegir evento y regional'}>
          <input name="RUTA" value={f.RUTA} onChange={poner} required autoComplete="off" className="carga__mono" />
        </Campo>
      </Grupo>
      <Grupo titulo="Equipo y estado">
        <div className="formulario__fila">
          <Campo etiqueta="LAS a cargo">
            <select name="LAS" value={f.LAS} required onChange={poner}>
              <Opciones lista={[...new Set([...cat.las, ...(f.LAS ? [f.LAS] : [])])]} vacio="Elige el LAS…" />
            </select>
          </Campo>
          <Campo etiqueta="Cargo"><select name="CARGO" value={f.CARGO} onChange={poner}><Opciones lista={cat.cargos} vacio="Cargo" /></select></Campo>
        </div>
        <div className="formulario__fila">
          <Campo etiqueta="Envío de campaña"><select name="ENVIO_CAMP" value={f.ENVIO_CAMP} onChange={poner}><Opciones lista={cat.envios} vacio="Envío" /></select></Campo>
          <Campo etiqueta="Estado"><select name="ESTADO" value={f.ESTADO} onChange={poner}><Opciones lista={cat.estados} vacio="Estado" /></select></Campo>
        </div>
      </Grupo>
    </>
  );
}

function FormPdv({ f, poner, cat }) {
  const eventos = cat.marcaEventosPdv[f.MARCA] || [];
  return (
    <>
      <Grupo titulo="Punto de venta">
        <div className="formulario__fila">
          <Campo etiqueta="Código SAP"><input name="SAP" value={f.SAP} onChange={poner} inputMode="numeric" required autoComplete="off" className="carga__mono" /></Campo>
          <Campo etiqueta="Canal">
            <select name="CANAL" value={f.CANAL} required onChange={poner}><Opciones lista={cat.canales} vacio="Elige el canal…" /></select>
          </Campo>
        </div>
        <Campo etiqueta="Nombre del punto de venta"><input name="PDV" value={f.PDV} onChange={poner} required autoComplete="off" /></Campo>
      </Grupo>
      <Grupo titulo="Ubicación">
        <Campo etiqueta="Dirección" ayuda="Ej: CL 11 17 63"><input name="DIRECCION" value={f.DIRECCION} onChange={poner} required autoComplete="off" /></Campo>
        <div className="formulario__fila">
          <Campo etiqueta="Ciudad"><input name="CIUDAD" value={f.CIUDAD} onChange={poner} list="cn-ciudades" required autoComplete="off" /></Campo>
          <Campo etiqueta="Regional"><input name="REGIONAL" value={f.REGIONAL} onChange={poner} list="cn-regionales" required autoComplete="off" /></Campo>
        </div>
        <div className="formulario__fila">
          <Campo etiqueta="Latitud" ayuda="Opcional. Ej: 4.6097"><input name="LATITUD" value={f.LATITUD} onChange={poner} inputMode="decimal" autoComplete="off" className="carga__mono" /></Campo>
          <Campo etiqueta="Longitud" ayuda="Vacías: SIN GEO y GEO_OK NA"><input name="LONGITUD" value={f.LONGITUD} onChange={poner} inputMode="decimal" autoComplete="off" className="carga__mono" /></Campo>
        </div>
      </Grupo>
      <Grupo titulo="Marca y evento">
        <div className="formulario__fila">
          <Campo etiqueta="Marca">
            <select name="MARCA" value={f.MARCA} required onChange={(e) => { const l = cat.marcaEventosPdv[e.target.value] || []; poner({ MARCA: e.target.value, EVENTO: l.length === 1 ? l[0] : '' }); }}>
              <Opciones lista={Object.keys(cat.marcaEventosPdv)} vacio="Elige la marca…" />
            </select>
          </Campo>
          <Campo etiqueta="Evento" ayuda={f.MARCA ? `${eventos.length} ${eventos.length === 1 ? 'evento' : 'eventos'} de ${f.MARCA}` : 'Primero elige la marca'}>
            <select name="EVENTO" value={f.EVENTO} required disabled={!f.MARCA} onChange={poner}>
              <Opciones lista={eventos} vacio={f.MARCA ? 'Elige el evento…' : '—'} />
            </select>
          </Campo>
        </div>
      </Grupo>
    </>
  );
}

export default function CargaNutresa({ inicial, onCerrar, onSalir, onCargado }) {
  const [tipo, setTipo] = useState(inicial.tipo);
  const [cat, setCat] = useState(null);
  const [error, setError] = useState('');
  const [peticion, setPeticion] = useState(inicial.peticion?.id || '');
  const [f, setF] = useState(() => (inicial.peticion ? desdePeticion(inicial.tipo, inicial.peticion) : VACIO[inicial.tipo]));
  const [ruta, setRuta] = useState('');
  const [fase, setFase] = useState('llenar'); // llenar → confirmar → listo
  const [avisoRuta, setAvisoRuta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(null);

  useEffect(() => {
    api('/api/admin/carga/catalogos').then(setCat).catch((e) => (e.status === 401 ? onSalir() : setError(e.message)));
  }, []);

  // Ruta sugerida cuando cambian evento o regional (solo usuarios).
  useEffect(() => {
    if (tipo !== 'usuario' || !f.EVENTO || !f.REGIONAL.trim()) { setRuta(''); return undefined; }
    const t = setTimeout(() => {
      api(`/api/admin/carga/ruta?${new URLSearchParams({ evento: f.EVENTO, regional: f.REGIONAL })}`)
        .then((r) => { setRuta(r.ruta); setF((x) => (x.RUTA ? x : { ...x, RUTA: r.ruta })); })
        .catch(() => setRuta(''));
    }, 250);
    return () => clearTimeout(t);
  }, [tipo, f.EVENTO, f.REGIONAL]);

  const reg = useMemo(() => registro(tipo, f), [tipo, f]);
  const obligatorios = tipo === 'usuario' ? COLUMNAS.usuario : COLUMNAS.pdv.slice(0, 8);
  const faltan = obligatorios.filter((k) => !reg[k]).length;
  const pendientes = (cat?.pendientes || []).filter((p) => (tipo === 'pdv') === (p.tipo === 'pdv'));

  function poner(e) {
    const cambios = e.target ? { [e.target.name]: e.target.value } : e;
    setF((x) => ({ ...x, ...cambios }));
    setError('');
    setAvisoRuta(false);
    if (fase === 'confirmar') setFase('llenar');
  }

  function cambiarTipo(t) {
    if (t === tipo) return;
    setTipo(t);
    setF(VACIO[t]);
    setPeticion('');
    setFase('llenar');
    setError('');
    setHecho(null);
  }

  function usarPeticion(id) {
    setPeticion(id);
    const p = pendientes.find((x) => x.id === id);
    setF(p ? desdePeticion(tipo, p) : VACIO[tipo]);
    setFase('llenar');
    setError('');
  }

  function revisar(e) {
    e.preventDefault();
    setError('');
    setFase('confirmar');
  }

  async function cargar() {
    setEnviando(true);
    setError('');
    try {
      const r = await api(`/api/admin/carga/${tipo}`, { method: 'POST', body: { ...f, peticion, confirmarRuta: avisoRuta } });
      setHecho(r);
      setFase('listo');
      onCargado();
    } catch (err) {
      if (err.status === 401) { onSalir(); return; }
      setFase('llenar');
      if (err.datos?.ruta) setAvisoRuta(true);
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  function otro() {
    setF(VACIO[tipo]);
    setPeticion('');
    setHecho(null);
    setFase('llenar');
    setCat((c) => (c && hecho?.peticion ? { ...c, pendientes: c.pendientes.filter((p) => p.id !== hecho.peticion.id) } : c));
  }

  const nombreBase = cat ? cat.colecciones[tipo] : '';

  return (
    <Ventana titulo="Cargar a Nutresa" subtitulo="Agrega un registro nuevo. Nunca edita ni borra lo que ya está." onCerrar={onCerrar} className="visor__caja--ancha">
      <div className="pestanas" role="tablist">
        <button type="button" role="tab" aria-selected={tipo === 'usuario'} className="pestana" onClick={() => cambiarTipo('usuario')}><Icono icon={UserAdd01Icon} size={18} /> Usuario</button>
        <button type="button" role="tab" aria-selected={tipo === 'pdv'} className="pestana" onClick={() => cambiarTipo('pdv')}><Icono icon={StoreAdd01Icon} size={18} /> Punto de venta</button>
      </div>

      {!cat ? (
        error ? <Aviso tipo="error">{error}</Aviso> : (
          <div className="carga">
            <div className="carga__form"><EsqueletoLista filas={5} avatar={false} /></div>
            <Esqueleto alto={360} redondo={18} />
          </div>
        )
      ) : fase === 'listo' ? (
        <div className="carga__listo">
          <div className="cartel entra" style={{ '--i': 0 }} role="status">
            <span className="cartel__icono"><Icono icon={CheckmarkCircle02Icon} size={32} /></span>
            <div>
              <b>{tipo === 'usuario' ? `${capital(hecho.datos.NOMBRE)} quedó en ${nombreBase}` : `${hecho.datos.PDV} quedó en ${nombreBase}`}</b>
              <span>
                {tipo === 'usuario' ? `C.C. ${hecho.datos.CEDULA} · ruta ${hecho.datos.RUTA}` : `SAP ${hecho.datos.SAP}`}
                {hecho.peticion ? ` · la petición de ${capital(hecho.peticion.las)} quedó cargada` : ''}
                {cat.simulada ? ' · modo de prueba: no se envió a Nutresa' : ''}
              </span>
            </div>
          </div>
          <div className="formulario__botones entra" style={{ '--i': 1 }}>
            <button type="button" className="btn btn--sec" onClick={onCerrar}>Cerrar</button>
            <button type="button" className="btn" onClick={otro}>Cargar otro {tipo === 'usuario' ? 'usuario' : 'punto de venta'}</button>
          </div>
        </div>
      ) : (
        <>
          {!cat.habilitada && (
            <Aviso tipo="alerta">La carga directa está apagada en este servidor. Para activarla, pon la variable <code>RUTERO_CARGA_NUTRESA=si</code> y reinicia.</Aviso>
          )}
          {cat.habilitada && cat.simulada && <Aviso tipo="info">Modo de prueba: lo que cargues queda en data/cargas-nutresa.jsonl y no llega a Nutresa.</Aviso>}

          {pendientes.length > 0 && (
            <label className="carga__desde">
              <span>Llenar desde una petición pendiente</span>
              <select value={peticion} onChange={(e) => usarPeticion(e.target.value)}>
                <option value="">Ninguna: llenar a mano</option>
                {pendientes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {tipo === 'pdv' ? `${p.datos.PDV} · SAP ${p.datos.SAP}` : `${capital(p.datos.NOMBRE)} · C.C. ${p.datos.CEDULA}`} · de {capital(p.las)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <form className="carga" onSubmit={revisar}>
            <div className="carga__form formulario">
              {tipo === 'usuario'
                ? <FormUsuario f={f} poner={poner} cat={cat} ruta={ruta} onSugerir={() => poner({ RUTA: ruta })} />
                : <FormPdv f={f} poner={poner} cat={cat} />}
              <datalist id="cn-ciudades">{cat.ciudades.map((o) => <option key={o} value={o} />)}</datalist>
              <datalist id="cn-regionales">{cat.regionales.map((o) => <option key={o} value={o} />)}</datalist>
            </div>

            <div className="carga__lado">
              <Ficha tipo={tipo} reg={reg} faltan={faltan} cat={cat} />
              <Aviso tipo="error">{error}</Aviso>
              {fase === 'confirmar' ? (
                <div className="carga__confirmar" role="alertdialog" aria-labelledby="carga-confirmar">
                  <span className="carga__confirmar-icono"><Icono icon={Alert02Icon} size={20} /></span>
                  <div>
                    <b id="carga-confirmar">¿Agregar este registro a {nombreBase}?</b>
                    <span>Se envía una sola vez. Desde Rutero no se puede editar ni borrar después.</span>
                  </div>
                  <div className="carga__confirmar-botones">
                    <button type="button" className="btn btn--sec" onClick={() => setFase('llenar')} disabled={enviando}>Corregir</button>
                    <button type="button" className="btn" onClick={cargar} disabled={enviando} autoFocus>
                      <Icono icon={CloudUploadIcon} size={18} /> {enviando ? 'Cargando…' : 'Sí, cargar'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {avisoRuta && <Aviso tipo="alerta">Si es un reemplazo y quieres dejar esa ruta igual, vuelve a revisar y confirma.</Aviso>}
                  <button className="btn btn--grande btn--bloque" disabled={!cat.habilitada || faltan > 0}>
                    <Icono icon={CloudUploadIcon} size={20} /> Revisar y cargar
                  </button>
                </>
              )}
            </div>
          </form>
        </>
      )}
    </Ventana>
  );
}
