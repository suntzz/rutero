import 'rutero-modo';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowTurnBackwardIcon, CheckmarkCircle02Icon, CloudUploadIcon, DatabaseSync01Icon, Download04Icon, LockKeyIcon, Route01Icon, StoreAdd01Icon, UserAdd01Icon, ViewIcon } from '@hugeicons/core-free-icons';

import CountUp from './reactbits/CountUp';
import { api, capital, claveLista, nombreMes, sinTildes } from './api';
import { Aviso, Brillo, Cabecera, EstadoSolicitud, Buscador, Campo, Esqueleto, EsqueletoLista, Fondo, Icono, Iniciales, Lista, Tarjeta, TemaContexto, conMinimo, useTema } from './ui';
import Ventana from './Ventana';
import CargaNutresa from './CargaNutresa';
import './estilos.css';

function Login({ onEntrar }) {
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      await api('/api/admin/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      onEntrar();
    } catch (err) {
      setError(err.message);
      e.target.clave.value = '';
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="pantalla pantalla--centro">
      <Tarjeta className="login-caja">
        <form className="login" onSubmit={enviar}>
          <span className="login__icono"><Icono icon={LockKeyIcon} size={26} /></span>
          <h1>Área interna</h1>
          <Campo etiqueta="Usuario"><input name="usuario" autoComplete="username" required autoFocus /></Campo>
          <Campo etiqueta="Clave"><input name="clave" type="password" autoComplete="current-password" required /></Campo>
          <Aviso tipo="error">{error}</Aviso>
          <button className="btn btn--grande" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        </form>
      </Tarjeta>
    </section>
  );
}

function fechaHora(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

// Cómo se muestra cada tipo de petición en el visor (campos con los nombres de Nutresa).
const TIPOS = {
  usuario: {
    titulo: 'Usuarios',
    icon: UserAdd01Icon,
    item: ({ id, tipo, datos: d, estado }) => ({ id, title: `${tipo === 'cambio' ? 'Cambio de evento · ' : ''}${capital(d.NOMBRE)}`, description: `C.C. ${d.CEDULA} · ${tipo === 'cambio' ? d.EVENTO : capital(d.CIUDAD || '—')}`, meta: ETIQUETA[estado], icon: <Iniciales nombre={d.NOMBRE} /> }),
    buscar: ({ datos: d, las }) => [d.NOMBRE, d.CEDULA, d.CIUDAD, las, d.MARCA, d.EVENTO].join(' '),
    campos: ['TELEFONO', 'CEDULA', 'REGIONAL', 'CIUDAD', 'NOMBRE', 'MARCA', 'EVENTO', 'ANTES', 'REEMPLAZA', 'RUTA', 'CARGO', 'LAS', 'ENVIO_CAMP', 'ESTADO'],
    nombre: (p) => `${p.tipo === 'cambio' ? 'Cambio de evento: ' : ''}${capital(p.datos.NOMBRE)}`,
  },
  pdv: {
    titulo: 'Puntos de venta',
    icon: StoreAdd01Icon,
    item: ({ id, datos: d, estado }) => ({ id, title: d.PDV, description: `SAP ${d.SAP} · ${capital(d.CIUDAD || '—')}`, meta: ETIQUETA[estado], icon: <span className="iniciales iniciales--tienda"><Icono icon={StoreAdd01Icon} size={18} /></span> }),
    buscar: ({ datos: d, las }) => [d.PDV, d.SAP, d.CIUDAD, las, d.CANAL].join(' '),
    campos: ['EVENTO', 'MARCA', 'SAP', 'PDV', 'REGIONAL', 'CIUDAD', 'DIRECCION', 'CANAL', 'LATITUD', 'LONGITUD', 'GEO_OK'],
    nombre: (p) => p.datos.PDV,
  },
};
const ETIQUETA = { pendiente: 'Pendiente', cargada: 'Cargada', devuelta: 'Devuelta' };

// Decisión del área sobre una solicitud: cargada (ya está en el sistema) o devuelta con comentario.
function Revision({ estado, comentario, onCambiar }) {
  const [devolviendo, setDevolviendo] = useState(false);
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  async function cambiar(nuevo, coment = '') {
    setOcupado(true);
    setError('');
    try {
      await onCambiar(nuevo, coment);
      setDevolviendo(false);
      setTexto('');
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  }
  return (
    <div className="revision">
      <EstadoSolicitud estado={estado} comentario={comentario} />
      {!devolviendo ? (
        <div className="revision__botones">
          {estado !== 'cargada' && <button type="button" className="btn btn--peq" onClick={() => cambiar('cargada')} disabled={ocupado}><Icono icon={CheckmarkCircle02Icon} size={16} /> Marcar cargada</button>}
          {estado !== 'devuelta' && <button type="button" className="btn btn--sec btn--peq btn--peligro" onClick={() => setDevolviendo(true)} disabled={ocupado}><Icono icon={ArrowTurnBackwardIcon} size={16} /> Devolver</button>}
          {estado !== 'pendiente' && <button type="button" className="btn-link" onClick={() => cambiar('pendiente')} disabled={ocupado}>Volver a pendiente</button>}
        </div>
      ) : (
        <form className="revision__form" onSubmit={(e) => { e.preventDefault(); cambiar('devuelta', texto); }}>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="¿Qué debe corregir el LAS?" rows={2} required autoFocus />
          <div className="revision__botones">
            <button className="btn btn--peq" disabled={ocupado || !texto.trim()}>Devolver al LAS</button>
            <button type="button" className="btn btn--sec btn--peq" onClick={() => setDevolviendo(false)}>Cancelar</button>
          </div>
        </form>
      )}
      <Aviso tipo="error">{error}</Aviso>
    </div>
  );
}

// Ventana para revisar las peticiones de los LAS, con pestañas, buscador y detalle.
function Visor({ inicial, datos: recibidos, onCerrar, onSalir, onCargar }) {
  const [tipo, setTipo] = useState(inicial);
  const [datos, setDatos] = useState(recibidos);
  useEffect(() => setDatos(recibidos), [recibidos]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const cfg = TIPOS[tipo];

  const lista = datos ? datos[tipo] : null; // null mientras llegan los datos
  const visibles = useMemo(() => {
    if (!lista) return [];
    const t = sinTildes(q.trim());
    return lista.filter((r) => !t || sinTildes(cfg.buscar(r)).includes(t));
  }, [lista, q, tipo]);

  function cambiarTipo(t) {
    setTipo(t);
    setQ('');
    setSel(null);
  }

  async function revisar(estado, comentario) {
    try {
      const p = await api(`/api/admin/peticiones/${encodeURIComponent(sel.id)}/estado`, { method: 'POST', body: { estado, comentario } });
      setDatos((d) => ({ ...d, [tipo]: d[tipo].map((x) => (x.id === p.id ? p : x)) }));
      setSel(p);
    } catch (e) {
      if (e.status === 401) onSalir();
      throw e;
    }
  }

  return (
    <Ventana
      titulo="Peticiones de los LAS"
      onCerrar={onCerrar}
      pie={(
        <a className={`btn btn--sec${!lista || lista.length === 0 ? ' btn--apagado' : ''}`} href={`/api/admin/peticiones-${tipo}.xlsx`} aria-disabled={!lista || lista.length === 0}>
          <Icono icon={Download04Icon} size={18} /> Descargar {tipo === 'usuario' ? 'usuarios' : 'puntos de venta'} en Excel
        </a>
      )}
    >
      <div className="pestanas" role="tablist">
        {Object.entries(TIPOS).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={tipo === k} className="pestana" onClick={() => cambiarTipo(k)}>
            <Icono icon={t.icon} size={18} /> {t.titulo} {datos ? <span className="pestana__n">{datos[k].length}</span> : <Esqueleto ancho={24} alto={20} redondo={10} />}
          </button>
        ))}
      </div>

      {!lista ? (
        <div className="visor__cuerpo">
          <div className="visor__lista"><Esqueleto alto={56} redondo={12} /><EsqueletoLista filas={4} /></div>
          <div className="visor__detalle"><Esqueleto alto={220} redondo={18} /></div>
        </div>
      ) : lista.length === 0 ? (
        <p className="vacio-txt visor__vacio">Ningún LAS ha pedido {tipo === 'usuario' ? 'usuarios' : 'puntos de venta'} todavía.</p>
      ) : (
        <div className="visor__cuerpo">
          <div className="visor__lista">
            <Buscador valor={q} onCambio={(v) => { setQ(v); setSel(null); }} placeholder={tipo === 'usuario' ? 'Nombre, cédula o LAS' : 'Nombre, SAP o LAS'} />
            {visibles.length ? (
              <Lista
                key={`${tipo}-${claveLista(visibles.map((r) => r.id))}`}
                escribiendo={!!q.trim()}
                items={visibles.map(cfg.item)}
                onItemSelect={(_, i) => setSel(visibles[i])}
                maxHeight={380}
              />
            ) : <p className="vacio-txt">Nada coincide con “{q.trim()}”.</p>}
          </div>

          <div className="visor__detalle" aria-live="polite">
            {sel ? (
              <div className="detalle" key={sel.id}>
                <div className="detalle__cab">
                  {tipo === 'usuario' ? <Iniciales nombre={sel.datos.NOMBRE} /> : <span className="iniciales iniciales--tienda"><Icono icon={StoreAdd01Icon} size={20} /></span>}
                  <div>
                    <b>{cfg.nombre(sel)}</b>
                    <span>Pedido por {capital(sel.las)} · {fechaHora(sel.creado)}</span>
                  </div>
                </div>
                <dl>
                  {cfg.campos.filter((k) => sel.datos[k]).map((k) => <div key={k}><dt>{k === 'ANTES' ? 'ANTES (EVENTO / MARCA)' : k === 'REEMPLAZA' ? 'A QUIÉN REEMPLAZA' : k}</dt><dd>{sel.datos[k]}</dd></div>)}
                </dl>
                {sel.estado === 'pendiente' && sel.tipo !== 'cambio' && (
                  <button type="button" className="btn btn--bloque carga__desde-peticion" onClick={() => onCargar(sel)}>
                    <Icono icon={CloudUploadIcon} size={18} /> Cargar en Nutresa con estos datos
                  </button>
                )}
                <Revision estado={sel.estado} comentario={sel.comentario} onCambiar={revisar} />
              </div>
            ) : (
              <p className="detalle__vacio">Toca un registro para ver todos sus datos.</p>
            )}
          </div>
        </div>
      )}
    </Ventana>
  );
}

// Solicitudes de rutero por LAS: el área las marca cargadas o las devuelve con comentario.
function Solicitudes({ onCerrar, onSalir, onCambio }) {
  const [datos, setDatos] = useState(null);
  const [sel, setSel] = useState(null);
  const [error, setError] = useState('');

  function cargar() {
    api('/api/admin/solicitudes')
      .then((d) => { setDatos(d); setSel((s) => (s ? d.las.find((l) => l.nombre === s.nombre) || null : null)); })
      .catch((e) => (e.status === 401 ? onSalir() : setError(e.message)));
  }
  useEffect(cargar, []);

  async function revisar(id, estado, comentario) {
    try {
      await api(`/api/admin/programacion/${encodeURIComponent(id)}/estado`, { method: 'POST', body: { estado, comentario } });
      cargar();
      onCambio();
    } catch (e) {
      if (e.status === 401) onSalir();
      throw e;
    }
  }

  async function cargarTodo() {
    const ids = sel.programaciones.filter((p) => p.estado === 'pendiente').map((p) => p.id);
    try {
      await api('/api/admin/solicitudes/cargar', { method: 'POST', body: { ids } });
      cargar();
      onCambio();
    } catch (e) {
      if (e.status === 401) onSalir();
      else setError(e.message);
    }
  }

  const trabajo = (dias) => dias.filter((d) => d && d.inicio).length;
  const libres = (dias) => dias.filter((d) => d && (d.novedad || d.cancelada)).length;

  return (
    <Ventana titulo="Solicitudes de rutero" onCerrar={onCerrar}>
      <Aviso tipo="error">{error}</Aviso>
      {!datos ? <EsqueletoLista filas={5} /> : datos.las.length === 0 ? (
        <p className="vacio-txt visor__vacio">Ningún LAS ha registrado rutero todavía.</p>
      ) : (
        <div className="visor__cuerpo">
          <div className="visor__lista">
            <Lista
              key={claveLista(datos.las.map((l) => `${l.nombre}${l.pendientes}`))}
              items={datos.las.map((l) => ({ id: l.nombre, title: capital(l.nombre), description: `${l.pendientes} pendientes · ${l.cargadas} cargadas${l.devueltas ? ` · ${l.devueltas} devueltas` : ''}`, meta: l.ultima ? fechaHora(l.ultima) : '', icon: <Iniciales nombre={l.nombre} /> }))}
              onItemSelect={(_, i) => setSel(datos.las[i])}
              maxHeight={440}
            />
          </div>
          <div className="visor__detalle">
            {sel ? (
              <div className="detalle" key={sel.nombre}>
                <div className="detalle__cab">
                  <Iniciales nombre={sel.nombre} />
                  <div><b>{capital(sel.nombre)}</b><span>{sel.programaciones.length} programaciones · {sel.pendientes} pendientes</span></div>
                </div>
                {sel.pendientes > 0 && (
                  <button type="button" className="btn btn--bloque" onClick={cargarTodo}><Icono icon={CheckmarkCircle02Icon} size={18} /> Marcar todo lo pendiente como cargado</button>
                )}
                <ul className="solicitudes">
                  {sel.programaciones.map((p) => (
                    <li key={p.id}>
                      <b>{capital(p.persona)}</b>
                      <span>{p.pdv} · SAP {p.sap}</span>
                      <span>{p.evento}{p.marca ? ` · ${p.marca}` : ''} · {trabajo(p.dias)} días de trabajo · {p.horas} h{libres(p.dias) ? ` · ${libres(p.dias)} sin hora` : ''}</span>
                      <Revision estado={p.estado} comentario={p.comentario} onCambiar={(e, c) => revisar(p.id, e, c)} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : <p className="detalle__vacio">Toca un LAS para ver sus solicitudes.</p>}
          </div>
        </div>
      )}
    </Ventana>
  );
}

function FilaNuevos({ icon, titulo, n, href, onVer, cargando }) {
  return (
    <Brillo className="nuevos__borde">
      <div className="nuevos__fila">
        <button type="button" className="nuevos__ver" onClick={onVer} disabled={n === 0}>
          <span className="nuevos__icono"><Icono icon={icon} size={22} /></span>
          <span className="nuevos__txt">
            <b>{titulo}</b>
            {cargando ? <Esqueleto ancho="45%" alto={11} /> : <span>{n === 0 ? 'Ninguna todavía' : `${n} ${n === 1 ? 'registro' : 'registros'} · toca para ver`}</span>}
          </span>
          {n > 0 && <span className="nuevos__ojo"><Icono icon={ViewIcon} size={20} /></span>}
        </button>
        <a className={`btn btn--sec btn--peq${n === 0 ? ' btn--apagado' : ''}`} href={href} aria-disabled={n === 0} aria-label={`Descargar ${titulo} en Excel`} title="Descargar en Excel">
          <Icono icon={Download04Icon} size={18} />
        </a>
      </div>
    </Brillo>
  );
}

function haceCuanto(iso) {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : fechaHora(iso);
}

// Estado de la conexión con la API de Nutresa (usuarios y PDV en vivo).
// Comprobación de rutas: ninguna ruta debe estar en dos personas activas.
function RutasDuplicadas({ recarga, onSalir }) {
  const [lista, setLista] = useState(null);
  const [ver, setVer] = useState(false);
  useEffect(() => {
    if (recarga) return;
    api('/api/admin/rutas-duplicadas').then(setLista).catch((e) => (e.status === 401 ? onSalir() : setLista(null)));
  }, [recarga]);
  if (!lista) return null;
  const ok = lista.length === 0;
  return (
    <div className={`maestros${ok ? '' : ' maestros--alerta'}`}>
      <span className="maestros__icono"><Icono icon={ok ? CheckmarkCircle02Icon : Route01Icon} size={22} /></span>
      <div className="maestros__txt">
        <b>{ok ? 'Rutas sin repetir' : `${lista.length} ${lista.length === 1 ? 'ruta repetida' : 'rutas repetidas'} entre personas activas`}</b>
        <span>{ok ? 'Ninguna ruta está en dos personas activas.' : 'Inactiven a quien ya salió o asignen una ruta nueva.'}</span>
        {ver && !ok && (
          <ul className="duplicadas">
            {lista.map((d) => (
              <li key={d.ruta}><b>{d.ruta}</b>: {d.personas.map((p) => `${capital(p.nombre)} (${p.origen === 'Petición' ? 'petición' : `C.C. ${p.cedula}`})`).join(' · ')}</li>
            ))}
          </ul>
        )}
      </div>
      {!ok && <button type="button" className="btn btn--sec btn--peq" onClick={() => setVer((v) => !v)}>{ver ? 'Ocultar' : 'Ver cuáles'}</button>}
    </div>
  );
}

function Maestros({ m, onActualizar, actualizando }) {
  const ok = m.configurada && !m.error;
  const n = (x) => x.toLocaleString('es-CO');
  let titulo = 'En vivo desde Nutresa';
  if (!m.configurada) titulo = 'Sin conexión a Nutresa (falta el token)';
  else if (m.error) titulo = m.respaldo ? 'Nutresa no responde: usando respaldo' : 'Nutresa no responde';
  return (
    <div className={`maestros${ok ? '' : ' maestros--alerta'}`}>
      <span className="maestros__icono"><Icono icon={DatabaseSync01Icon} size={22} /></span>
      {actualizando ? (
        <div className="maestros__txt" role="status" aria-label="Consultando Nutresa">
          <Esqueleto ancho="55%" alto={15} />
          <Esqueleto ancho="80%" alto={12} />
        </div>
      ) : (
        <div className="maestros__txt">
          <b>{titulo}</b>
          <span>
            {n(m.enUso.usuarios)} usuarios · {n(m.enUso.pdv)} PDV
            {ok && m.ultimaOk ? ` · consultado ${haceCuanto(m.ultimaOk)}` : ''}
            {!ok && m.respaldo ? ` · respaldo del ${fechaHora(m.respaldo)}` : ''}
          </span>
          {!ok && m.error && <span className="maestros__error">{m.error}</span>}
        </div>
      )}
      {m.configurada && (
        <button type="button" className="btn btn--sec btn--peq" onClick={onActualizar} disabled={actualizando}>
          {actualizando ? 'Consultando…' : 'Consultar ya'}
        </button>
      )}
    </div>
  );
}

// Forma de la tarjeta mientras llega la primera respuesta.
function DescargaEsqueleto() {
  return (
    <Tarjeta className="descarga" role="status" aria-label="Cargando">
      <Esqueleto ancho={120} alto={14} className="cifra-esqueleto" />
      <Esqueleto ancho={190} alto={30} className="cifra-esqueleto" />
      <div className="descarga__cifras">
        {[0, 1, 2].map((i) => (
          <div key={i}><Esqueleto ancho={56} alto={26} className="cifra-esqueleto" /><Esqueleto ancho="70%" alto={11} className="cifra-esqueleto" /></div>
        ))}
      </div>
      <Esqueleto alto={56} redondo={12} />
      <EsqueletoLista filas={3} />
    </Tarjeta>
  );
}

function Descarga({ onSalir }) {
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  const [cambiarMes, setCambiarMes] = useState(false);
  const [visor, setVisor] = useState(null); // { tipo, datos }
  const [solicitudes, setSolicitudes] = useState(false);
  const [carga, setCarga] = useState(null); // { tipo, peticion }
  const [actualizando, setActualizando] = useState(false);
  const [cargando, setCargando] = useState(true);

  async function actualizarMaestros() {
    setActualizando(true);
    try {
      const maestros = await conMinimo(api('/api/admin/actualizar-maestros', { method: 'POST' }));
      setR((x) => ({ ...x, maestros }));
    } catch (e) {
      if (e.status === 401) onSalir();
      else setError(e.message);
    } finally {
      setActualizando(false);
    }
  }

  function cargar() {
    setCargando(true);
    setError('');
    conMinimo(api('/api/admin/resumen'))
      .then(setR)
      .catch((e) => (e.status === 401 ? onSalir() : setError(e.message)))
      .finally(() => setCargando(false));
  }
  useEffect(cargar, []);

  async function abrirVisor(tipo) {
    setVisor({ tipo, datos: null });
    try {
      setVisor({ tipo, datos: await conMinimo(api('/api/admin/peticiones'), 400) });
    } catch (e) {
      setVisor(null);
      if (e.status === 401) onSalir();
      else setError(e.message);
    }
  }

  async function guardarMes(e) {
    e.preventDefault();
    try {
      await api('/api/admin/periodo', { method: 'PUT', body: { periodo: e.target.periodo.value } });
      setCambiarMes(false);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!r) {
    return (
      <section className="pantalla pantalla--centro">
        <Aviso tipo="error">{error}</Aviso>
        {!error && <DescargaEsqueleto />}
      </section>
    );
  }

  const cifra = (valor, sep) => (cargando
    ? <Esqueleto ancho={56} alto={26} className="cifra-esqueleto" />
    : <CountUp to={valor} separator={sep} trigger="load" duration={0.8} />);

  const vacio = r.programaciones === 0;
  return (
    <section className="pantalla pantalla--centro">
      <Tarjeta className="descarga">
        <p className="descarga__mes">{r.periodo ? capital(nombreMes(r.periodo)) : 'Sin mes abierto'}</p>
        <h1>03 Rutero</h1>
        <div className="descarga__cifras">
          <div><b>{cifra(r.programaciones, '.')}</b><span>tiendas programadas</span></div>
          <div><b>{cifra(r.las)}</b><span>LAS que han llenado</span></div>
          <div><b>{cifra(r.filasRutero, '.')}</b><span>filas del Excel</span></div>
        </div>
        {vacio && <Aviso tipo="info">Todavía nadie ha guardado programaciones este mes.</Aviso>}
        <a className={`btn btn--grande btn--bloque${vacio ? ' btn--apagado' : ''}`} href="/api/admin/rutero.xlsx" aria-disabled={vacio}>
          <Icono icon={Download04Icon} /> Descargar Excel
        </a>
        <div className="nuevos">
          <h2>Lo que piden los LAS</h2>
          <p>Nada es oficial hasta que ustedes lo cargan. Revisa, marca como cargado o devuelve con un comentario.</p>
          <Brillo className="nuevos__borde">
            <div className="nuevos__fila">
              <button type="button" className="nuevos__ver" onClick={() => setSolicitudes(true)}>
                <span className="nuevos__icono"><Icono icon={Route01Icon} size={22} /></span>
                <span className="nuevos__txt">
                  <b>Solicitudes de rutero</b>
                  {cargando ? <Esqueleto ancho="45%" alto={11} /> : <span>{r.pendientes ? `${r.pendientes} pendientes de cargue · toca para revisar` : 'Nada pendiente'}</span>}
                </span>
                <span className="nuevos__ojo"><Icono icon={ViewIcon} size={20} /></span>
              </button>
            </div>
          </Brillo>
          <FilaNuevos icon={UserAdd01Icon} titulo="Creación de usuario" n={r.peticionesUsuario} cargando={cargando} href="/api/admin/peticiones-usuario.xlsx" onVer={() => abrirVisor('usuario')} />
          <FilaNuevos icon={StoreAdd01Icon} titulo="Creación de punto de venta" n={r.peticionesPdv} cargando={cargando} href="/api/admin/peticiones-pdv.xlsx" onVer={() => abrirVisor('pdv')} />
        </div>
        <div className="nuevos">
          <h2>Cargar directo a Nutresa</h2>
          <p>Agrega un usuario o un punto de venta nuevo a la base de Nutresa. Solo agrega: no edita ni borra.</p>
          <div className="carga-accesos">
            <button type="button" className="carga-acceso" onClick={() => setCarga({ tipo: 'usuario' })}>
              <span className="carga-acceso__icono"><Icono icon={UserAdd01Icon} size={22} /></span>
              <span className="carga-acceso__txt"><b>Usuario</b><span>12 campos de usuarios_nutresa</span></span>
              <Icono icon={CloudUploadIcon} size={20} className="carga-acceso__ir" />
            </button>
            <button type="button" className="carga-acceso" onClick={() => setCarga({ tipo: 'pdv' })}>
              <span className="carga-acceso__icono carga-acceso__icono--tienda"><Icono icon={StoreAdd01Icon} size={22} /></span>
              <span className="carga-acceso__txt"><b>Punto de venta</b><span>11 campos de pdv_nutresa</span></span>
              <Icono icon={CloudUploadIcon} size={20} className="carga-acceso__ir" />
            </button>
          </div>
        </div>
        {r.maestros && <Maestros m={r.maestros} onActualizar={actualizarMaestros} actualizando={actualizando || cargando} />}
        <RutasDuplicadas recarga={cargando} onSalir={onSalir} />
        <div className="descarga__pie">
          <button type="button" className="btn-link" onClick={cargar} disabled={cargando}>{cargando ? 'Actualizando…' : 'Actualizar números'}</button>
          <button type="button" className="btn-link" onClick={() => setCambiarMes((v) => !v)}>Cambiar mes</button>
        </div>
        {cambiarMes && (
          <form className="formulario descarga__mes-form" onSubmit={guardarMes}>
            <Campo etiqueta="Primer día del mes a programar" ayuda="Las programaciones guardadas se quedan; solo cambian las fechas del Excel.">
              <input type="date" name="periodo" defaultValue={r.periodo || ''} required />
            </Campo>
            <button className="btn">Guardar mes</button>
          </form>
        )}
        <Aviso tipo="error">{error}</Aviso>
      </Tarjeta>
      {visor && <Visor inicial={visor.tipo} datos={visor.datos} onCerrar={() => { setVisor(null); cargar(); }} onSalir={onSalir} onCargar={(p) => { setVisor(null); setCarga({ tipo: p.tipo === 'pdv' ? 'pdv' : 'usuario', peticion: p }); }} />}
      {carga && <CargaNutresa inicial={carga} onCerrar={() => setCarga(null)} onSalir={onSalir} onCargado={cargar} />}
      {solicitudes && <Solicitudes onCerrar={() => setSolicitudes(false)} onSalir={onSalir} onCambio={cargar} />}
    </section>
  );
}

function App() {
  const tema = useTema();
  const [dentro, setDentro] = useState(null);
  useEffect(() => {
    api('/api/admin/yo').then(() => setDentro(true)).catch(() => setDentro(false));
  }, []);

  async function salir() {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    setDentro(false);
  }

  return (
    <TemaContexto.Provider value={tema}>
      <Fondo />
      <Cabecera usuario={dentro ? 'Área interna' : null} detalle="Descargas y peticiones" onSalir={salir} />
      <main>
        {dentro === false && <Login onEntrar={() => setDentro(true)} />}
        {dentro && <Descarga onSalir={() => setDentro(false)} />}
      </main>
    </TemaContexto.Provider>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
