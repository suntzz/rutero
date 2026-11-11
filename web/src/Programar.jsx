import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar03Icon, CheckmarkCircle02Icon, Home01Icon, Logout01Icon, Route01Icon, Store01Icon, Tag01Icon, UserAdd01Icon, UserIcon } from '@hugeicons/core-free-icons';

import Stepper, { Step } from './reactbits/Stepper';
import GradientText from './reactbits/GradientText';
import { api, capital, nombreMes } from './api';
import { Aviso, ComoEnviar, Dialogo, Esqueleto, EsqueletoLista, Icono, Iniciales, useEstilo, Volver } from './ui';
import PasoPersona from './pasos/PasoPersona';
import PasoTienda from './pasos/PasoTienda';
import PasoEvento from './pasos/PasoEvento';
import PasoDias from './pasos/PasoDias';
import PasoRevisar from './pasos/PasoRevisar';
import { calcularChoques, diasCerrados, numerosDeDia, otrosEventos, vacios } from './pasos/reglas';
import { borrarBorrador, guardarBorrador, haceCuanto, leerBorrador } from './borrador';

// Crear rutero (5 pasos) o, con `inicial.editar`, modificar una programación de mañana en adelante.
export default function Programar({ cat, equipo, las, inicial = {}, onSesionVencida, onSalir, onInicio, onMiRutero, onPedirUsuario, onPedirPdv }) {
  const editar = inicial.editar || null;
  const estilo = useEstilo();
  const [paso, setPaso] = useState(editar ? 4 : inicial.persona ? 2 : 1);
  const [persona, setPersona] = useState(null);
  const [pdv, setPdv] = useState(null);
  const [evento, setEvento] = useState(editar ? editar.evento : '');
  const [dias, setDias] = useState(() => (editar ? editar.dias : vacios(cat.fechas.length)));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [agenda, setAgenda] = useState([]); // turnos que la persona ya tiene este mes (en otras programaciones)
  const [ultimo, setUltimo] = useState(null);
  const [guardadas, setGuardadas] = useState([]); // lo que este LAS guardó en esta visita
  const [trayendo, setTrayendo] = useState(!!(editar || inicial.persona));
  const [unificar, setUnificar] = useState(false);
  const [dialogoEvento, setDialogoEvento] = useState(false);
  const arriba = useRef(null);
  const cerrados = useMemo(() => diasCerrados(cat), [cat]);
  // Borrador de una creación que quedó a medias (solo al crear desde cero, no al modificar). Llega
  // del servidor: si mientras tanto el LAS ya empezó otra, se ignora.
  const [borrador, setBorrador] = useState(null);
  const empezo = useRef(false);
  const pasoGuardado = useRef(null);

  // Retoma el borrador. Los días que ya pasaron desde que se guardó quedan libres (no se pueden programar).
  function retomar(b) {
    empezo.current = true;
    setPersona(b.persona);
    setPdv(b.pdv || null);
    setEvento(b.evento || '');
    setDias((b.dias || vacios(cat.fechas.length)).map((d, i) => (cerrados.has(i) ? null : d)));
    setPaso(Math.min(Math.max(b.paso || 1, 1), 5));
    setBorrador(null);
  }

  function descartar() {
    borrarBorrador(las);
    setBorrador(null);
  }

  useEffect(() => {
    if (editar || inicial.persona) return;
    leerBorrador(las, cat.periodo).then((b) => {
      if (!b || empezo.current) return;
      if (inicial.retomar) retomar(b);
      else setBorrador(b);
    });
  }, []);

  // Cada cambio se guarda (al servidor al cambiar de paso; los días, como mucho cada 4 s), mientras
  // no haya un borrador viejo esperando respuesta.
  useEffect(() => {
    if (editar || borrador || !persona || paso > 5) return;
    const cambioDePaso = pasoGuardado.current !== paso;
    pasoGuardado.current = paso;
    guardarBorrador(las, { periodo: cat.periodo, paso, persona, pdv, evento, dias }, { ya: cambioDePaso });
  }, [persona, pdv, evento, dias, paso]);

  function manejarError(e) {
    if (e && e.status === 401) onSesionVencida();
    else setError(e?.message || 'Algo salió mal.');
  }

  // Persona (y tienda, si se modifica) que llegan ya elegidas desde "Actualizar rutero".
  useEffect(() => {
    const cedula = editar ? editar.cedula : inicial.persona?.cedula;
    if (!cedula) return;
    Promise.all([api(`/api/persona/${cedula}`), editar ? api(`/api/pdv/${encodeURIComponent(editar.sap)}`) : null])
      .then(([p, t]) => {
        setPersona(p);
        if (t) setPdv(t);
        if (!editar && p.evento && cat.eventos.includes(p.evento)) setEvento(p.evento);
      })
      .catch(manejarError)
      .finally(() => setTrayendo(false));
  }, []);

  useEffect(() => {
    arriba.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [paso]);

  useEffect(() => setUnificar(false), [evento]);

  // Al elegir persona (y después de cada guardado) se trae lo que ya tiene programado.
  function cargarAgenda(p = persona) {
    if (!p) { setAgenda([]); return; }
    api(`/api/persona/${p.cedula}/agenda${editar ? `?excluir=${encodeURIComponent(editar.id)}` : ''}`).then(setAgenda).catch(manejarError);
  }
  useEffect(() => cargarAgenda(), [persona?.cedula, guardadas.length]);

  async function elegirPersona(p) {
    // Si empieza otra persona sin tocar el aviso del borrador, el borrador viejo se descarta.
    if (p) empezo.current = true;
    if (p && borrador) descartar();
    if (p && p.buscar) {
      setTrayendo(true);
      try {
        p = await api(`/api/persona/${p.cedula}`);
      } catch (e) {
        manejarError(e);
        return;
      } finally {
        setTrayendo(false);
      }
    }
    setPersona(p);
    if (p) {
      if (!evento && p.evento && cat.eventos.includes(p.evento)) setEvento(p.evento);
      setPaso(2);
    }
  }

  function elegirPdv(p) {
    setPdv(p);
    if (p) setPaso(3);
  }

  async function guardar() {
    setGuardando(true);
    setError('');
    try {
      const cuerpo = { cedula: persona.cedula, sap: pdv.sap, evento, dias, unificarEvento: unificar };
      const r = editar
        ? await api(`/api/programacion/${encodeURIComponent(editar.id)}`, { method: 'PUT', body: cuerpo })
        : await api('/api/programacion', { method: 'POST', body: cuerpo });
      const item = { id: r.id, persona, pdv, evento, horas: r.panel.horasProgramadas, cambio: r.cambio };
      setUltimo(item);
      setGuardadas((g) => [...g, item]);
      if (!editar) borrarBorrador(las);
      setPaso(6);
    } catch (e) {
      if (e.datos && e.datos.error === 'cruce') {
        // Otro LAS la programó mientras tanto: se vuelve al calendario con los choques en rojo.
        setAgenda((a) => [...a, ...e.datos.cruces]);
        cargarAgenda();
        setPaso(4);
      } else if (e.datos && e.datos.error === 'evento') {
        cargarAgenda();
        setPaso(4);
        setDialogoEvento(true);
      } else manejarError(e);
    } finally {
      setGuardando(false);
    }
  }

  function otraTienda() {
    setPdv(null);
    setDias(vacios(cat.fechas.length));
    setPaso(2);
  }

  function otraPersona() {
    setPersona(null);
    setPdv(null);
    setEvento('');
    setDias(vacios(cat.fechas.length));
    setPaso(1);
  }

  if (!cat.periodo) {
    return <section className="pantalla"><Aviso tipo="alerta">Todavía no hay un mes abierto para programar. Avísale al área.</Aviso></section>;
  }
  if (trayendo && editar) {
    return (
      <section className="pantalla pantalla--ancha" role="status" aria-label="Cargando">
        <div className="titular"><Esqueleto ancho={110} alto={14} /><Esqueleto ancho="75%" alto={30} className="esqueleto--titulo" /></div>
        <EsqueletoLista filas={4} />
      </section>
    );
  }

  const futurosMarcados = dias.some((d, i) => d && !cerrados.has(i));
  const choques = calcularChoques(agenda, dias, cerrados);
  const otros = evento ? otrosEventos(agenda, dias, evento) : [];
  const listo = {
    1: !!persona, 2: !!pdv, 3: !!evento,
    4: (futurosMarcados || (editar && dias.some(Boolean))) && choques.lista.length === 0,
    5: !guardando && choques.lista.length === 0,
  };
  const nombre = persona ? capital(persona.nombre.split(' ')[0]) : '';

  const completado = ultimo && (
    <div className="listo">
      <div className="cartel entra" style={{ '--i': 0 }} role="status">
        <span className="cartel__icono"><Icono icon={CheckmarkCircle02Icon} size={34} /></span>
        <div>
          <b>{editar ? 'Solicitud de cambio registrada' : 'Solicitud registrada'}</b>
          <span>{capital(ultimo.persona.nombre)} en {ultimo.pdv.nombre}: {ultimo.horas} horas. Todavía no es oficial: el área la revisa y la carga.</span>
        </div>
      </div>

      {ultimo.cambio && (
        <Aviso tipo="alerta">Se creó una <b>petición de cambio de evento</b> para {capital(ultimo.persona.nombre.split(' ')[0])} ({ultimo.evento}). Va incluida en el formato.</Aviso>
      )}
      <div className="entra" style={{ '--i': 1 }}>
        <ComoEnviar tipo="rutero" correos={cat.correos} mes={capital(nombreMes(cat.periodo).split(' ')[0])} las={capital(las.nombre)} />
      </div>

      {!editar && (
        <div className="hoy entra" style={{ '--i': 2 }}>
          <h3>Lo que registraste hoy ({guardadas.length})</h3>
          <ul>
            {guardadas.map((g) => (
              <li key={g.id}>
                <Iniciales nombre={g.persona.nombre} />
                <div>
                  <b>{capital(g.persona.nombre)}</b>
                  <span>{g.pdv.nombre} · {g.evento} · {g.horas} h</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="listo__pregunta entra" style={{ '--i': 2 }}>¿Qué quieres hacer ahora?</p>
      <div className="listo__botones entra" style={{ '--i': 3 }}>
        {editar ? (
          <>
            <button type="button" className="btn btn--sec btn--grande" onClick={onMiRutero}><Icono icon={Route01Icon} /> Volver a mi rutero</button>
            <button type="button" className="btn btn--grande" onClick={onInicio}><Icono icon={Home01Icon} /> Ir al inicio</button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn--sec btn--grande" onClick={otraTienda}><Icono icon={Store01Icon} /> Agregar otra tienda a {capital(ultimo.persona.nombre.split(' ')[0])}</button>
            <button type="button" className="btn btn--sec btn--grande" onClick={otraPersona}><Icono icon={UserAdd01Icon} /> Programar otra persona</button>
            <button type="button" className="btn btn--sec btn--grande" onClick={onMiRutero}><Icono icon={Route01Icon} /> Ver cómo va mi rutero</button>
            <button type="button" className="btn btn--grande" onClick={onSalir}><Icono icon={Logout01Icon} /> Terminé, salir</button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <section className="pantalla pantalla--ancha pantalla--programar" ref={arriba}>
      {editar || inicial.desde === 'actualizar' ? <Volver onClick={onMiRutero}>Volver a mi rutero</Volver> : <Volver onClick={onInicio} />}
      <div className="titular">
        <p className="titular__saludo">Hola, {capital(las.nombre.split(' ')[0])}</p>
        <h1>
          {editar ? 'Modifica la ruta de ' : 'Crea la ruta de '}
          <GradientText colors={estilo.tema === 'dark' ? ['#5ccfa8', '#9fe3c9', '#f2b85a', '#5ccfa8'] : ['#0f6e5a', '#2fa37f', '#d99a1e', '#0f6e5a']} animationSpeed={7} className="titular__mes">
            {nombreMes(cat.periodo).split(' ')[0]}
          </GradientText>
        </h1>
        <p>{editar ? 'Solo cambian los días de mañana en adelante.' : 'Una tienda a la vez. Si la persona va a varias tiendas, al final eliges “Otra tienda”.'}</p>
      </div>
      <Aviso tipo="error">{error}</Aviso>
      {borrador && (
        <div className="borrador" role="status">
          <span className="borrador__icono"><Icono icon={Calendar03Icon} size={22} /></span>
          <div className="borrador__txt">
            <b>Tienes un rutero sin terminar</b>
            <span>
              {capital(borrador.persona.nombre)}{borrador.pdv ? ` en ${borrador.pdv.nombre}` : ''} · paso {Math.min(borrador.paso || 1, 5)} de 5 · guardado {haceCuanto(borrador.guardado)}
            </span>
          </div>
          <div className="borrador__botones">
            <button type="button" className="btn btn--peq" onClick={() => retomar(borrador)}>Seguir donde iba</button>
            <button type="button" className="btn btn--sec btn--peq" onClick={descartar}>Empezar de nuevo</button>
          </div>
        </div>
      )}
      <Stepper
        step={paso}
        onStepChange={setPaso}
        linear
        theme={estilo.tema}
        accentColor={estilo.acento}
        width="100%"
        radius={24}
        style={{ '--stepper-frame': 'var(--vidrio-fuerte)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}
        backButtonText="Atrás"
        nextButtonText="Siguiente"
        completeButtonText={guardando ? 'Registrando…' : 'Registrar solicitud'}
        nextButtonProps={{
          disabled: !listo[paso],
          onClick: (e) => {
            // Un solo evento por persona y día: si ya tiene otro, se pregunta antes de revisar.
            if (paso === 4 && otros.length && !unificar) { e.preventDefault(); setDialogoEvento(true); }
            if (paso === 5) { e.preventDefault(); guardar(); }
          },
        }}
        completedContent={completado}
      >
        <Step title="Persona" icon={<Icono icon={UserIcon} size={16} />}>
          <PasoPersona equipo={equipo} persona={persona} buscando={trayendo} fija={!!editar} onElegir={elegirPersona} onPedirUsuario={onPedirUsuario} onError={manejarError} />
        </Step>
        <Step title="Tienda" icon={<Icono icon={Store01Icon} size={16} />}>
          <PasoTienda pdv={pdv} fija={!!editar} onElegir={elegirPdv} onPedirPdv={onPedirPdv} onError={manejarError} />
        </Step>
        <Step title="Evento" icon={<Icono icon={Tag01Icon} size={16} />}>
          <PasoEvento key={persona?.cedula || 'sin'} eventos={cat.eventos} evento={evento} sugerido={persona?.evento} eventoMarca={cat.eventoMarca} persona={persona} onElegir={(e) => { setEvento(e); setPaso(4); }} />
        </Step>
        <Step title="Días" icon={<Icono icon={Calendar03Icon} size={16} />}>
          {persona && <PasoDias cat={cat} dias={dias} setDias={setDias} persona={persona} agenda={agenda} choques={choques} cerrados={cerrados} />}
        </Step>
        <Step title="Revisar" icon={<Icono icon={CheckmarkCircle02Icon} size={16} />}>
          {persona && pdv && (
            <PasoRevisar cat={cat} persona={persona} pdv={pdv} evento={evento} marca={cat.eventoMarca[evento]} cambiaEvento={!!persona.evento && cat.eventos.includes(persona.evento) && evento !== persona.evento} dias={dias} cerrados={cerrados} unificarCon={unificar ? otros.map((o) => o.evento) : []} fijos={!!editar} irA={setPaso} />
          )}
        </Step>
      </Stepper>

      {dialogoEvento && otros.length > 0 && (
        <Dialogo
          titulo="Esta persona ya tiene otro evento esos días"
          onCerrar={() => setDialogoEvento(false)}
          acciones={[
            ...(otros.length === 1 ? [{ texto: `Seguir con ${otros[0].evento}`, onClick: () => { setEvento(otros[0].evento); setPaso(5); } }] : []),
            { texto: `Cambiar todo a ${evento}`, secundario: otros.length === 1, onClick: () => { setUnificar(true); setPaso(5); } },
            { texto: 'Volver', secundario: true },
          ]}
        >
          <p>Una persona solo puede tener un evento por día.</p>
          <ul>
            {otros.map((o) => (
              <li key={o.evento}>{nombre} está en <b>{o.evento}</b> {o.dias.length === 1 ? 'el día' : 'los días'} {numerosDeDia(cat, o.dias).join(', ')}.</li>
            ))}
          </ul>
          <p>¿Seguimos con ese evento o cambiamos todo a <b>{evento}</b>? Si cambias, sus otras tiendas pasan a {evento} de mañana en adelante.</p>
        </Dialogo>
      )}
    </section>
  );
}
