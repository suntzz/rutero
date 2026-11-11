import { useEffect, useState } from 'react';
import { Calendar03Icon, CheckmarkCircle02Icon, Home01Icon, StoreAdd01Icon, UserAdd01Icon } from '@hugeicons/core-free-icons';

import { api, capital, nombreMes } from './api';
import { Aviso, Campo, ComoEnviar, Icono, Tarjeta, Volver } from './ui';

// Peticiones de creación: el LAS llena los campos de Nutresa, descarga el Excel y lo envía al área.
// No crean nada en Nutresa: quedan pendientes hasta que el área las carga.

function ListaOpciones({ id, opciones }) {
  return <datalist id={id}>{opciones.map((o) => <option key={o} value={o} />)}</datalist>;
}

function Elegir({ name, opciones, defaultValue = '', placeholder }) {
  return (
    <select name={name} required defaultValue={defaultValue}>
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// Marca y evento van amarrados como en la base de Nutresa: primero la marca, y el evento solo ofrece
// los de esa marca (si hay uno solo, queda elegido).
function MarcaEvento({ relacion, marca, evento, onCambio }) {
  const eventos = relacion[marca] || [];
  return (
    <div className="formulario__fila">
      <Campo etiqueta="Marca">
        <select name="MARCA" required value={marca} onChange={(e) => {
          const m = e.target.value;
          const lista = relacion[m] || [];
          onCambio(m, lista.length === 1 ? lista[0] : '');
        }}>
          <option value="" disabled>Elige la marca…</option>
          {Object.keys(relacion).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Evento" ayuda={marca ? `${eventos.length} ${eventos.length === 1 ? 'evento' : 'eventos'} de ${marca}` : 'Primero elige la marca'}>
        <select name="EVENTO" required value={evento} disabled={!marca} onChange={(e) => onCambio(marca, e.target.value)}>
          <option value="" disabled>{marca ? 'Elige el evento…' : '—'}</option>
          {eventos.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
        </select>
      </Campo>
    </div>
  );
}

// Resultado: la petición queda registrada y pendiente; el LAS descarga el Excel y lo envía.
function Registrada({ pet, titulo, detalle, tipo, cat, las, acciones }) {
  return (
    <div className="listo">
      <div className="cartel cartel--pendiente entra" style={{ '--i': 0 }} role="status">
        <span className="cartel__icono"><Icono icon={CheckmarkCircle02Icon} size={32} /></span>
        <div>
          <b>{titulo} registrada</b>
          <span>{detalle} Todavía no es oficial: el área la revisa y la crea.</span>
        </div>
      </div>
      <div className="entra" style={{ '--i': 1 }}>
        <ComoEnviar tipo={tipo} correos={cat.correos} mes={cat.periodo ? capital(nombreMes(cat.periodo).split(' ')[0]) : ''} las={capital(las.nombre)} />
      </div>
      <div className="listo__botones entra" style={{ '--i': 2 }}>
        {acciones}
      </div>
    </div>
  );
}

function useEnvio(ruta, onSesionVencida) {
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [pet, setPet] = useState(null);
  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      setPet(await api(ruta, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }));
    } catch (err) {
      if (err.status === 401) onSesionVencida();
      else setError(err.message);
    } finally {
      setEnviando(false);
    }
  }
  return { error, enviando, pet, enviar, otra: () => setPet(null) };
}

export function PeticionUsuario({ cat, las, onInicio, onProgramar, onSesionVencida }) {
  const { error, enviando, pet, enviar, otra } = useEnvio('/api/peticiones/usuario', onSesionVencida);
  const [me, setMe] = useState({ marca: '', evento: '' });
  const [reemplaza, setReemplaza] = useState(false);
  const [equipo, setEquipo] = useState(null);
  const [quien, setQuien] = useState('');

  useEffect(() => {
    if (!reemplaza || equipo) return;
    api('/api/las/reemplazables').then(setEquipo).catch((e) => (e.status === 401 ? onSesionVencida() : setEquipo([])));
  }, [reemplaza]);

  // Quien reemplaza hereda la ruta y, por defecto, la marca y el evento de la persona que sale.
  function elegirReemplazado(cedula) {
    setQuien(cedula);
    const p = (equipo || []).find((x) => x.cedula === cedula);
    if (p && cat.marcaEventos[p.marca]?.includes(p.evento)) setMe({ marca: p.marca, evento: p.evento });
  }
  const reemplazado = (equipo || []).find((x) => x.cedula === quien);

  function nueva() {
    otra();
    setMe({ marca: '', evento: '' });
    setReemplaza(false);
    setQuien('');
  }
  return (
    <section className="pantalla">
      <Volver onClick={onInicio} />
      <div className="titular">
        <p className="titular__saludo">Petición de creación de usuario</p>
        <h1>¿A quién hay que crear?</h1>
        <p>Llena sus datos. Después descargas el Excel y lo envías al área; mientras la crean, ya la puedes programar.</p>
      </div>
      {pet ? (
        <Registrada
          pet={pet}
          tipo="usuario"
          cat={cat}
          las={las}
          titulo="Petición de usuario"
          detalle={`${capital(pet.datos.NOMBRE)} (C.C. ${pet.datos.CEDULA}), ruta ${pet.datos.RUTA}${pet.datos.REEMPLAZA ? ' heredada' : ''}.`}
          acciones={(
            <>
              <button type="button" className="btn btn--grande" onClick={() => onProgramar({ cedula: pet.datos.CEDULA, nombre: pet.datos.NOMBRE })}><Icono icon={Calendar03Icon} /> Programar a {capital(pet.datos.NOMBRE.split(' ')[0])} ahora</button>
              <button type="button" className="btn btn--sec btn--grande" onClick={nueva}><Icono icon={UserAdd01Icon} /> Pedir otro usuario</button>
              <button type="button" className="btn btn--sec btn--grande" onClick={onInicio}><Icono icon={Home01Icon} /> Ir al inicio</button>
            </>
          )}
        />
      ) : (
        <Tarjeta>
          <form className="formulario" onSubmit={enviar}>
            <div className="formulario__fila">
              <Campo etiqueta="Cédula" ayuda="Sin puntos"><input name="CEDULA" inputMode="numeric" pattern="\d{5,12}" required autoFocus /></Campo>
              <Campo etiqueta="Nombre completo"><input name="NOMBRE" required autoComplete="off" /></Campo>
            </div>
            <Campo etiqueta="Teléfono" ayuda="10 números"><input name="TELEFONO" inputMode="tel" pattern="\d{10}" required /></Campo>

            <div className="reemplazo">
              <p className="reemplazo__pregunta">¿Reemplaza a alguien de tu equipo?</p>
              <div className="reemplazo__opciones" role="radiogroup" aria-label="¿Reemplaza a alguien?">
                <button type="button" role="radio" aria-checked={!reemplaza} className="pincel" onClick={() => { setReemplaza(false); setQuien(''); }}>No, es un cupo nuevo</button>
                <button type="button" role="radio" aria-checked={reemplaza} className="pincel" onClick={() => setReemplaza(true)}>Sí, reemplaza a alguien</button>
              </div>
              {reemplaza && (
                <Campo etiqueta="¿A quién reemplaza?" ayuda={reemplazado ? `Se queda con su ruta ${reemplazado.ruta || '(sin ruta)'}, su marca y su evento.` : 'Quien llega se queda con el código de ruta de quien se va.'}>
                  <select name="REEMPLAZA" required value={quien} onChange={(e) => elegirReemplazado(e.target.value)} disabled={!equipo}>
                    <option value="" disabled>{equipo ? 'Elige a la persona que sale…' : 'Cargando tu equipo…'}</option>
                    {(equipo || []).map((p) => <option key={p.cedula} value={p.cedula}>{capital(p.nombre)} · {p.ruta || 'sin ruta'}{/INACTIVO/i.test(p.estado) ? ' · inactiva' : ''}</option>)}
                  </select>
                </Campo>
              )}
              {!reemplaza && <p className="reemplazo__nota">La ruta se asigna sola y nunca se repite: 3 letras del evento + la regional + el siguiente número (ej. NUTME170).</p>}
              {reemplazado && !/INACTIVO/i.test(reemplazado.estado) && <p className="reemplazo__nota">{capital(reemplazado.nombre.split(' ')[0])} sigue activa: en la petición queda marcada para inactivarla, así la ruta no se repite.</p>}
            </div>
            <div className="formulario__fila">
              <Campo etiqueta="Ciudad"><input name="CIUDAD" list="pu-ciudades" required autoComplete="off" /><ListaOpciones id="pu-ciudades" opciones={cat.ciudades} /></Campo>
              <Campo etiqueta="Regional"><input name="REGIONAL" list="pu-regionales" required defaultValue={las.regional} autoComplete="off" /><ListaOpciones id="pu-regionales" opciones={cat.regionales} /></Campo>
            </div>
            <MarcaEvento relacion={cat.marcaEventos} marca={me.marca} evento={me.evento} onCambio={(marca, evento) => setMe({ marca, evento })} />
            <div className="formulario__fila">
              <Campo etiqueta="Cargo"><Elegir name="CARGO" opciones={['PROMOTOR']} defaultValue="PROMOTOR" /></Campo>
              <Campo etiqueta="Envío de campaña"><Elegir name="ENVIO_CAMP" opciones={['ENVIO', 'NO ENVIO']} defaultValue="ENVIO" /></Campo>
            </div>
            <dl className="fijos">
              <div><dt>LAS</dt><dd>{capital(las.nombre)}</dd></div>
              <div><dt>Estado</dt><dd>Activo</dd></div>
            </dl>
            <Aviso tipo="error">{error}</Aviso>
            <div className="formulario__botones">
              <button type="button" className="btn btn--sec" onClick={onInicio}>Volver</button>
              <button className="btn" disabled={enviando}>{enviando ? 'Registrando…' : 'Registrar petición'}</button>
            </div>
          </form>
        </Tarjeta>
      )}
    </section>
  );
}

export function PeticionPdv({ cat, las, onInicio, onSesionVencida }) {
  const { error, enviando, pet, enviar, otra } = useEnvio('/api/peticiones/pdv', onSesionVencida);
  const [me, setMe] = useState({ marca: '', evento: '' });
  return (
    <section className="pantalla">
      <Volver onClick={onInicio} />
      <div className="titular">
        <p className="titular__saludo">Petición de creación de punto de venta</p>
        <h1>¿Qué tienda falta?</h1>
        <p>Rutero no crea la tienda: registras la petición, descargas el Excel y lo envías al área. Cuando llegue desde Nutresa ya la podrás programar.</p>
      </div>
      {pet ? (
        <Registrada
          pet={pet}
          tipo="pdv"
          cat={cat}
          las={las}
          titulo="Petición de punto de venta"
          detalle={`${pet.datos.PDV} (SAP ${pet.datos.SAP}).`}
          acciones={(
            <>
              <button type="button" className="btn btn--sec btn--grande" onClick={() => { otra(); setMe({ marca: '', evento: '' }); }}><Icono icon={StoreAdd01Icon} /> Pedir otro punto de venta</button>
              <button type="button" className="btn btn--grande" onClick={onInicio}><Icono icon={Home01Icon} /> Ir al inicio</button>
            </>
          )}
        />
      ) : (
        <Tarjeta>
          <form className="formulario" onSubmit={enviar}>
            <div className="formulario__fila">
              <Campo etiqueta="Código SAP"><input name="SAP" inputMode="numeric" required autoFocus autoComplete="off" /></Campo>
              <Campo etiqueta="Nombre del punto de venta"><input name="PDV" required autoComplete="off" /></Campo>
            </div>
            <Campo etiqueta="Dirección" ayuda="Ej: CL 11 17 63"><input name="DIRECCION" required autoComplete="off" /></Campo>
            <div className="formulario__fila">
              <Campo etiqueta="Ciudad"><input name="CIUDAD" list="pp-ciudades" required autoComplete="off" /><ListaOpciones id="pp-ciudades" opciones={cat.ciudades} /></Campo>
              <Campo etiqueta="Regional"><input name="REGIONAL" list="pp-regionales" required defaultValue={las.regional} autoComplete="off" /><ListaOpciones id="pp-regionales" opciones={cat.regionales} /></Campo>
            </div>
            <div className="formulario__fila">
              <Campo etiqueta="Canal"><Elegir name="CANAL" opciones={cat.canales} placeholder="Elige el canal…" /></Campo>
            </div>
            <MarcaEvento relacion={cat.marcaEventosPdv} marca={me.marca} evento={me.evento} onCambio={(marca, evento) => setMe({ marca, evento })} />

            <Aviso tipo="error">{error}</Aviso>
            <div className="formulario__botones">
              <button type="button" className="btn btn--sec" onClick={onInicio}>Volver</button>
              <button className="btn" disabled={enviando}>{enviando ? 'Registrando…' : 'Registrar petición'}</button>
            </div>
          </form>
        </Tarjeta>
      )}
    </section>
  );
}
