import 'rutero-modo';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Calendar03Icon, LockKeyIcon, Search01Icon } from '@hugeicons/core-free-icons';

import BlurText from './reactbits/BlurText';
import Programar from './Programar';
import Inicio from './Inicio';
import MiRutero from './MiRutero';
import { PeticionPdv, PeticionUsuario } from './Peticiones';
import { api, capital, claveLista, nombreMes, sinTildes } from './api';
import { Aviso, Buscador, Cabecera, Esqueleto, EsqueletoLista, Fondo, Icono, Iniciales, Lista, Tarjeta, TemaContexto, useEstilo, useTema } from './ui';
import simbolo from './marca/rutero-simbolo.svg';
import simboloNegativo from './marca/rutero-simbolo-negativo.svg';
import './estilos.css';

// El LAS busca su nombre en la maestra y entra escribiendo su cédula.
function Ingreso({ onEntrar, mensaje }) {
  const { tema } = useEstilo();
  const [lista, setLista] = useState(null);
  const [q, setQ] = useState('');
  const [elegido, setElegido] = useState(null);
  const [error, setError] = useState('');
  const [cedula, setCedula] = useState('');
  const [entrando, setEntrando] = useState(false);

  useEffect(() => {
    api('/api/las').then(setLista).catch((e) => setError(e.message));
  }, []);

  const visibles = useMemo(() => {
    if (!lista) return [];
    const t = sinTildes(q.trim());
    return lista.filter((l) => !t || sinTildes(l.nombre).includes(t) || sinTildes(l.regional).includes(t));
  }, [lista, q]);

  async function entrar(e) {
    e.preventDefault();
    setError('');
    setEntrando(true);
    try {
      onEntrar(await api('/api/las/entrar', { method: 'POST', body: { id: elegido.id, cedula } }));
    } catch (err) {
      setError(err.message);
      setCedula('');
    } finally {
      setEntrando(false);
    }
  }

  function otroNombre() {
    setElegido(null);
    setCedula('');
    setError('');
  }

  const tarjeta = elegido ? (
    <div className="confirmar">
      <Iniciales nombre={elegido.nombre} />
      <p className="confirmar__pregunta">Hola,</p>
      <h2 className="confirmar__nombre">{capital(elegido.nombre)}</h2>
      <p className="confirmar__rol">LAS · {capital(elegido.regional)}</p>
      <form className="confirmar__form" onSubmit={entrar}>
        <label className="campo">
          <span className="campo__etiqueta">Escribe tu cédula para entrar</span>
          <input
            className="cedula"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={cedula}
            onChange={(e) => setCedula(e.target.value.replace(/\D/g, ''))}
            placeholder="Tu número de cédula"
            maxLength={15}
            autoFocus
            required
          />
        </label>
        <Aviso tipo="error">{error}</Aviso>
        <button className="btn btn--grande" disabled={entrando || cedula.length < 5}>{entrando ? 'Entrando…' : 'Entrar'}</button>
        <button type="button" className="btn btn--sec btn--grande" onClick={otroNombre}>No soy yo, elegir otro nombre</button>
      </form>
      <p className="confirmar__nota">Solo verás y podrás programar a tu equipo.</p>
    </div>
  ) : (
    <>
      <div className="ingreso__cab">
        <h2>¿Quién eres?</h2>
        <p>Busca tu nombre y tócalo.</p>
      </div>
      <Buscador valor={q} onCambio={setQ} placeholder="Tu nombre o tu ciudad" autoFocus etiqueta="Buscar tu nombre" />
      <Aviso tipo="error">{error}</Aviso>
      {!lista && !error && <EsqueletoLista filas={5} />}
      {lista && (visibles.length ? (
        <Lista
          key={claveLista(visibles.map((l) => l.id))}
          escribiendo={!!q.trim()}
          items={visibles.map((l) => ({ id: l.id, title: capital(l.nombre), description: `LAS · ${capital(l.regional)}`, icon: <Iniciales nombre={l.nombre} /> }))}
          onItemSelect={(_, i) => setElegido(visibles[i])}
          maxHeight={420}
        />
      ) : <p className="vacio-txt">No encontramos “{q}”. Revisa cómo lo escribiste.</p>)}
    </>
  );

  return (
    <section className="ingreso">
      <div className="ingreso__hero">
        <img className="ingreso__simbolo" src={tema === 'dark' ? simboloNegativo : simbolo} alt="" width="64" height="64" />
        <BlurText as="h1" className="ingreso__titulo" text="Programa la ruta del mes en minutos" trigger="load" delay={70} stepDuration={0.3} distance={12} blur={8} />
        <p className="ingreso__bajada">Para los LAS de Grupo Nutresa: tu equipo, sus tiendas y sus horarios, en un solo lugar.</p>
        <ol className="ingreso__pasos">
          <li><span><Icono icon={Search01Icon} size={18} /></span>Busca tu nombre</li>
          <li><span><Icono icon={LockKeyIcon} size={18} /></span>Escribe tu cédula</li>
          <li><span><Icono icon={Calendar03Icon} size={18} /></span>Programa a tu equipo</li>
        </ol>
      </div>
      <div className="ingreso__panel">
        {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
        <Tarjeta className="ingreso__tarjeta">{tarjeta}</Tarjeta>
      </div>
    </section>
  );
}

const PANTALLAS = ['crear', 'actualizar', 'peticion-usuario', 'peticion-pdv'];

// Ir al inicio deshace los pasos del historial, para que "atrás" no vuelva a pantallas viejas.
function irAlInicio(setPantalla) {
  const n = (window.history.state && window.history.state.n) || 0;
  if (n > 0) window.history.go(-n);
  else setPantalla('inicio');
  window.scrollTo({ top: 0 });
}

// Ya dentro: carga catálogos y equipo una vez y mueve al LAS entre las cuatro funciones.
function Sesion({ las, pantalla, setPantalla, onPeriodo, onSesionVencida, onTerminar }) {
  const [cat, setCat] = useState(null);
  const [equipo, setEquipo] = useState([]);
  const [error, setError] = useState('');
  const [inicial, setInicial] = useState({});

  function cargarEquipo() {
    return api('/api/las/equipo').then(setEquipo);
  }

  useEffect(() => {
    Promise.all([api('/api/catalogos'), api('/api/las/equipo')])
      .then(([c, eq]) => { setCat(c); setEquipo(eq); onPeriodo(c.periodo); })
      .catch((e) => (e.status === 401 ? onSesionVencida() : setError(e.message)));
  }, []);

  // El botón "atrás" del celular o del navegador regresa de pantalla en pantalla (no se sale de Rutero).
  // Las pantallas que necesitan datos (modificar) vuelven a la lista de donde salieron.
  useEffect(() => {
    const atras = (e) => {
      const destino = e.state && e.state.rutero;
      setInicial({});
      setPantalla(destino === 'editar' ? 'actualizar' : PANTALLAS.includes(destino) ? destino : 'inicio');
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('popstate', atras);
    return () => window.removeEventListener('popstate', atras);
  }, []);

  // Cada pantalla vuelve a cargar lo suyo; `inicial` lleva la persona o la programación elegida.
  function ir(destino, datos = {}) {
    setInicial(datos);
    if (destino === 'crear' || destino === 'inicio') cargarEquipo().catch(() => {});
    if (destino === 'inicio') {
      irAlInicio(setPantalla);
      return;
    }
    const n = (window.history.state && window.history.state.n) || 0;
    window.history.pushState({ rutero: destino, n: n + 1 }, '');
    setPantalla(destino);
    window.scrollTo({ top: 0 });
  }

  if (!cat) {
    return (
      <section className="pantalla" role="status" aria-label="Cargando">
        <Aviso tipo="error">{error}</Aviso>
        {!error && (
          <>
            <div className="titular"><Esqueleto ancho={110} alto={14} /><Esqueleto ancho="75%" alto={30} className="esqueleto--titulo" /></div>
            <EsqueletoLista filas={4} />
          </>
        )}
      </section>
    );
  }

  const comunes = { cat, las, onSesionVencida, onInicio: () => ir('inicio') };
  switch (pantalla) {
    case 'crear':
    case 'editar':
      return (
        <Programar
          key={`${pantalla}-${inicial.editar?.id || inicial.persona?.cedula || ''}`}
          {...comunes}
          equipo={equipo}
          inicial={inicial}
          onSalir={onTerminar}
          onMiRutero={() => ir('actualizar')}
          onPedirUsuario={() => ir('peticion-usuario')}
          onPedirPdv={() => ir('peticion-pdv')}
        />
      );
    case 'actualizar':
      return <MiRutero cat={cat} las={las} onInicio={() => ir('inicio')} onSesionVencida={onSesionVencida} onEditar={(p) => ir('editar', { editar: p })} onProgramar={(p) => ir('crear', { persona: p, desde: 'actualizar' })} />;
    case 'peticion-usuario':
      return <PeticionUsuario {...comunes} onProgramar={(p) => ir('crear', { persona: p })} />;
    case 'peticion-pdv':
      return <PeticionPdv {...comunes} />;
    default:
      return <Inicio las={las} cat={cat} onIr={ir} onSesionVencida={onSesionVencida} />;
  }
}

function App() {
  const tema = useTema();
  const [las, setLas] = useState(undefined); // undefined = cargando, null = sin sesión
  const [periodo, setPeriodo] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [pantalla, setPantalla] = useState('inicio');

  useEffect(() => {
    api('/api/las/yo').then(setLas).catch(() => setLas(null));
  }, []);

  async function salir() {
    await api('/api/las/salir', { method: 'POST' }).catch(() => {});
    setLas(null);
    setMensaje(null);
    setPantalla('inicio');
  }

  // "Terminé, salir" después de guardar: se despide confirmando que todo quedó guardado.
  async function terminar() {
    await salir();
    setMensaje({ tipo: 'ok', texto: '¡Gracias! Toda tu información quedó guardada. Ya puedes cerrar esta página.' });
  }

  function sesionVencida() {
    setLas(null);
    setPantalla('inicio');
    setMensaje({ tipo: 'alerta', texto: 'Tu sesión se cerró por inactividad. Elige tu nombre otra vez; lo que no habías guardado se perdió.' });
  }

  return (
    <TemaContexto.Provider value={tema}>
      <Fondo />
      <Cabecera
        usuario={las ? las.nombre : null}
        detalle={las ? `LAS · ${capital(las.regional)}` : ''}
        periodo={periodo ? capital(nombreMes(periodo)) : ''}
        onInicio={las ? () => irAlInicio(setPantalla) : null}
        onSalir={salir}
      />
      <main>
        {las === undefined && <section className="pantalla pantalla--centro"><EsqueletoLista filas={6} /></section>}
        {las === null && <Ingreso onEntrar={(l) => { setMensaje(null); setLas(l); }} mensaje={mensaje} />}
        {las && <Sesion las={las} pantalla={pantalla} setPantalla={setPantalla} onPeriodo={setPeriodo} onSesionVencida={sesionVencida} onTerminar={terminar} />}
      </main>
    </TemaContexto.Provider>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
