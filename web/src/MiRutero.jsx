import { useEffect, useState } from 'react';
import { Calendar03Icon, Cancel01Icon, Edit02Icon, StoreAdd01Icon } from '@hugeicons/core-free-icons';

import { api, capital, claveLista, fecha, hora12, horaCorta, nombreMes } from './api';
import { nombreNovedad } from './Calendario';
import { Aviso, Brillo, ComoEnviar, Dialogo, EstadoSolicitud, Esqueleto, EsqueletoLista, Icono, Iniciales, Lista, Tarjeta, Volver } from './ui';
import { contar, plural } from './pasos/reglas';

const DSEM = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Calendario de una persona con todas sus tiendas: cada tienda con su color y su horario.
function CalendarioPersona({ datos, programaciones }) {
  const primero = fecha(datos.fechas[0]);
  const offset = (primero.getUTCDay() + 6) % 7;
  return (
    <div className="cal cal--lectura">
      <div className="cal__grilla">
        {DSEM.map((d, i) => <div key={d} className={`cal__dsem${i === 6 ? ' cal__dsem--dom' : ''}`}>{d}</div>)}
        {Array.from({ length: offset }, (_, i) => <div key={`v${i}`} aria-hidden="true" />)}
        {datos.fechas.map((iso, i) => {
          const f = fecha(iso);
          const turnos = programaciones.flatMap((p, t) => (p.dias[i] ? [{ ...p.dias[i], t, pdv: p.pdv }] : []));
          const pasado = iso <= datos.hoy;
          return (
            <div key={iso} className={`cal__dia cal__dia--persona${pasado ? ' cal__dia--cerrado' : ''}${f.getUTCMonth() !== primero.getUTCMonth() ? ' cal__dia--otro' : ''}`}>
              <span className="cal__num">{f.getUTCDate()}</span>
              {turnos.length === 0 && <span className="cal__txt">Libre</span>}
              {turnos.map((d) => (
                <span key={d.t} className={`turno turno--${d.t % 4}${d.novedad || d.cancelada ? ' turno--no' : ''}`} title={`${d.pdv}${d.inicio ? `: ${hora12(d.inicio)} a ${hora12(d.fin)}` : ''}`}>
                  {d.cancelada ? 'Cancelado' : d.novedad ? nombreNovedad(d.novedad) : `${horaCorta(d.inicio)}–${horaCorta(d.fin)}`}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Persona({ datos, persona, onVolver, onEditar, onCancelar, onAgregarTienda }) {
  const [cancelar, setCancelar] = useState(null);
  return (
    <section className="pantalla pantalla--ancha pantalla--programar">
      <Volver onClick={onVolver}>Volver a mi rutero</Volver>
      <div className="titular">
        <p className="titular__saludo">C.C. {persona.cedula}</p>
        <h1>{capital(persona.nombre)}</h1>
        <p>Así está programada en {nombreMes(datos.periodo).split(' ')[0]}. Solo se cambia de mañana en adelante.</p>
      </div>
      <div className="persona-dos">
      <Tarjeta className="persona-dos__cal">
        <CalendarioPersona datos={datos} programaciones={persona.programaciones} />
        <div className="leyenda leyenda--tiendas">
          {persona.programaciones.map((p, t) => <span key={p.id}><i className={`leyenda__c turno--${t % 4}`} />{p.pdv}</span>)}
        </div>
      </Tarjeta>
      <div className="tiendas">
        <h2 className="seccion">Tiendas ({persona.programaciones.length})</h2>
        {persona.programaciones.map((p, t) => {
          const c = contar(p.dias);
          const futuro = p.dias.some((d, i) => d && !d.cancelada && datos.fechas[i] > datos.hoy);
          return (
            <div key={p.id} className="tienda">
              <span className={`tienda__marca turno--${t % 4}`} aria-hidden="true" />
              <div className="tienda__txt">
                <b>{p.pdv}</b>
                <span>SAP {p.sap} · {p.evento}</span>
                <span>{plural(c.diasT, 'día', 'días')} de trabajo · {plural(c.horas, 'hora', 'horas')}{c.nov ? ` · ${plural(c.nov, 'novedad', 'novedades')}` : ''}</span>
                <EstadoSolicitud estado={p.estado} comentario={p.comentario} />
              </div>
              <div className="tienda__botones">
                <button type="button" className="btn btn--sec btn--peq" onClick={() => onEditar({ ...p, cedula: persona.cedula })}><Icono icon={Edit02Icon} size={16} /> Modificar</button>
                {futuro && <button type="button" className="btn btn--sec btn--peq btn--peligro" onClick={() => setCancelar(p)}><Icono icon={Cancel01Icon} size={16} /> Cancelar desde mañana</button>}
              </div>
            </div>
          );
        })}
        <Brillo className="agregar-borde">
          <button type="button" className="agregar" onClick={() => onAgregarTienda(persona)}>
            <span className="agregar__icono"><Icono icon={StoreAdd01Icon} size={22} /></span>
            <span><b>Agregar otra tienda a {capital(persona.nombre.split(' ')[0])}</b><small>Eliges la tienda, confirmas el evento y marcas los días</small></span>
          </button>
        </Brillo>
      </div>
      </div>
      {cancelar && (
        <Dialogo
          titulo="¿Cancelar desde mañana?"
          onCerrar={() => setCancelar(null)}
          acciones={[
            { texto: 'Sí, pedir la cancelación', icon: Cancel01Icon, onClick: () => onCancelar(cancelar) },
            { texto: 'No, dejarla así', secundario: true },
          ]}
        >
          <p>Los días de trabajo de {capital(persona.nombre.split(' ')[0])} en <b>{cancelar.pdv}</b> de mañana en adelante quedan como <b>cancelados</b>. Los días que ya pasaron no cambian. Es una solicitud: el área la revisa y la carga.</p>
        </Dialogo>
      )}
    </section>
  );
}

// "Actualizar rutero": promotores programados (tócalos para ver su calendario) y los que faltan.
export default function MiRutero({ cat, las, onEditar, onProgramar, onSesionVencida, onInicio }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState(null);

  function manejar(e) {
    if (e.status === 401) onSesionVencida();
    else setError(e.message);
  }

  function cargar() {
    api('/api/las/rutero').then((d) => {
      setDatos(d);
      setSel((s) => (s ? d.programados.find((p) => p.cedula === s.cedula) || null : null));
    }).catch(manejar);
  }
  useEffect(cargar, []);

  async function cancelar(p) {
    try {
      await api(`/api/programacion/${encodeURIComponent(p.id)}/cancelar`, { method: 'POST' });
      cargar();
    } catch (e) { manejar(e); }
  }

  if (!datos) {
    return (
      <section className="pantalla" role="status" aria-label="Cargando">
        <Aviso tipo="error">{error}</Aviso>
        {!error && <><div className="titular"><Esqueleto ancho={110} alto={14} /><Esqueleto ancho="75%" alto={30} className="esqueleto--titulo" /></div><EsqueletoLista filas={5} /></>}
      </section>
    );
  }

  if (sel) return <Persona datos={datos} persona={sel} onVolver={() => setSel(null)} onEditar={onEditar} onCancelar={cancelar} onAgregarTienda={onProgramar} />;

  const total = datos.programados.length + datos.sinProgramar.length;
  const devueltas = datos.programados.reduce((n, p) => n + p.programaciones.filter((g) => g.estado === 'devuelta').length, 0);
  return (
    <section className="pantalla pantalla--ancha pantalla--programar">
      <Volver onClick={onInicio} />
      <div className="titular">
        <p className="titular__saludo">Actualizar rutero</p>
        <h1>Así va tu rutero de {datos.periodo ? nombreMes(datos.periodo).split(' ')[0] : 'este mes'}</h1>
        <p>{datos.programados.length} de {total} promotores programados. Toca a alguien para ver su calendario, cambiar sus tiendas o agregarle otra.</p>
      </div>
      <Aviso tipo="error">{error}</Aviso>

      <div className="rutero-dos">
        <div className="rutero-dos__listas">
          {devueltas > 0 && (
            <Aviso tipo="alerta">El área te devolvió {plural(devueltas, 'solicitud', 'solicitudes')}. Toca a la persona (dice “devuelta”), lee el comentario y corrígela con “Modificar”.</Aviso>
          )}
          <h2 className="seccion">Promotores programados ({datos.programados.length})</h2>
          {datos.programados.length ? (
            <Lista
              key={claveLista(datos.programados.map((p) => p.cedula))}
              maxHeight={480}
              items={datos.programados.map((p) => {
                const dias = p.programaciones.reduce((n, g) => n + contar(g.dias).diasT, 0);
                const estados = ['devuelta', 'pendiente', 'cargada'].map((e) => [e, p.programaciones.filter((g) => g.estado === e).length]).filter(([, n]) => n);
                const resumen = estados.map(([e, n]) => `${n} ${{ devuelta: n === 1 ? 'devuelta' : 'devueltas', pendiente: n === 1 ? 'pendiente' : 'pendientes', cargada: n === 1 ? 'cargada' : 'cargadas' }[e]}`).join(' · ');
                return { id: p.cedula, title: capital(p.nombre), description: `${plural(p.programaciones.length, 'tienda', 'tiendas')} · ${plural(dias, 'día', 'días')} de trabajo · ${resumen}`, icon: <Iniciales nombre={p.nombre} />, meta: <Icono icon={Calendar03Icon} size={18} /> };
              })}
              onItemSelect={(_, i) => setSel(datos.programados[i])}
            />
          ) : <p className="vacio-txt">Todavía no has programado a nadie este mes.</p>}

          <h2 className="seccion">Aún no has programado ({datos.sinProgramar.length})</h2>
          {datos.sinProgramar.length ? (
            <ul className="faltan">
              {datos.sinProgramar.map((p) => (
                <li key={p.cedula}>
                  <Iniciales nombre={p.nombre} />
                  <span><b>{capital(p.nombre)}</b><small>C.C. {p.cedula}{p.nuevo ? ' · pedida' : ''}</small></span>
                  <button type="button" className="btn btn--peq" onClick={() => onProgramar(p)}>Programar</button>
                </li>
              ))}
            </ul>
          ) : <p className="vacio-txt">¡Todo tu equipo tiene programación!</p>}
        </div>

        <aside className="rutero-dos__info">
          {datos.programados.length > 0
            ? <ComoEnviar tipo="rutero" correos={cat.correos} mes={datos.periodo ? capital(nombreMes(datos.periodo).split(' ')[0]) : ''} las={capital(las.nombre)} />
            : <p className="enviar enviar--vacio">Cuando programes a tu equipo, aquí descargas el formato para enviarlo al área.</p>}
        </aside>
      </div>
    </section>
  );
}
