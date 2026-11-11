import { useEffect, useState } from 'react';
import { ArrowRight01Icon, CalendarAdd01Icon, Route01Icon, StoreAdd01Icon, UserAdd01Icon } from '@hugeicons/core-free-icons';

import CountUp from './reactbits/CountUp';
import { api, capital, nombreMes } from './api';
import { Brillo, EstadoSolicitud, Esqueleto, Icono } from './ui';
import { haceCuanto, leerBorrador } from './borrador';

// Avance del mes: cuántos del equipo ya tienen programación.
function TuMes({ las, cat, rutero, peticiones }) {
  const mes = cat.periodo ? capital(nombreMes(cat.periodo).split(' ')[0]) : '';
  const total = rutero ? rutero.programados.length + rutero.sinProgramar.length : 0;
  const hechos = rutero ? rutero.programados.length : 0;
  const pct = total ? Math.round((hechos / total) * 100) : 0;
  // Estado de lo que el LAS ha registrado: solo el área lo vuelve oficial.
  const progs = rutero ? rutero.programados.flatMap((p) => p.programaciones) : [];
  const todas = [...progs, ...(peticiones || [])];
  const pendientes = todas.filter((x) => x.estado === 'pendiente').length;
  const devueltas = todas.filter((x) => x.estado === 'devuelta').length;
  return (
    <div className="tumes entra" style={{ '--i': 0 }}>
      <div className="tumes__cab">
        <div>
          <p className="tumes__hola">Hola, {capital(las.nombre.split(' ')[0])}</p>
          <h1>{cat.periodo ? <>Tu ruta de <span className="tumes__mes">{mes}</span></> : 'Todavía no hay un mes abierto'}</h1>
        </div>
        {rutero && total > 0 && <span className="tumes__pct"><CountUp to={pct} duration={0.7} trigger="load" />%</span>}
      </div>
      {rutero ? (
        <>
          <div className="avance" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={hechos} aria-label="Promotores programados">
            <span style={{ transform: `scaleX(${total ? hechos / total : 0})` }} />
          </div>
          <div className="tumes__datos">
            <span><b>{hechos}</b> de {total} promotores programados</span>
            <span><b>{rutero.sinProgramar.length}</b> sin programar</span>
            {pendientes > 0 && <span><b>{pendientes}</b> pendientes de cargue por el área</span>}
            {devueltas > 0 && <span className="tumes__devueltas"><b>{devueltas}</b> {devueltas === 1 ? 'devuelta' : 'devueltas'}: revísalas en Actualizar rutero</span>}
          </div>
        </>
      ) : (
        <div role="status" aria-label="Cargando tu mes">
          <Esqueleto alto={10} redondo={5} />
          <div className="tumes__datos"><Esqueleto ancho={180} alto={13} /><Esqueleto ancho={110} alto={13} /></div>
        </div>
      )}
    </div>
  );
}

function Accion({ icon, tono, titulo, texto, onClick, i }) {
  return (
    <button type="button" className={`accion accion--${tono} entra`} style={{ '--i': i }} onClick={onClick}>
      <span className="accion__icono"><Icono icon={icon} size={24} /></span>
      <span className="accion__txt"><b>{titulo}</b><small>{texto}</small></span>
    </button>
  );
}

// Pantalla de entrada del LAS: cómo va el mes y las cuatro funciones.
export default function Inicio({ las, cat, onIr, onSesionVencida }) {
  const [rutero, setRutero] = useState(null);
  const [peticiones, setPeticiones] = useState(null);
  const [borrador, setBorrador] = useState(null);

  useEffect(() => {
    api('/api/las/rutero').then(setRutero).catch((e) => e.status === 401 && onSesionVencida());
    api('/api/peticiones').then(setPeticiones).catch(() => setPeticiones([]));
    if (cat.periodo) leerBorrador(las, cat.periodo).then(setBorrador);
  }, []);

  return (
    <section className="pantalla pantalla--inicio">
      <TuMes las={las} cat={cat} rutero={rutero} peticiones={peticiones} />

      {borrador && (
        <div className="borrador entra" style={{ '--i': 1 }} role="status">
          <span className="borrador__icono"><Icono icon={CalendarAdd01Icon} size={22} /></span>
          <div className="borrador__txt">
            <b>Dejaste un rutero sin terminar</b>
            <span>{capital(borrador.persona.nombre)}{borrador.pdv ? ` en ${borrador.pdv.nombre}` : ''} · guardado {haceCuanto(borrador.guardado)}</span>
          </div>
          <div className="borrador__botones">
            <button type="button" className="btn btn--peq" onClick={() => onIr('crear', { retomar: true })}>Seguir donde iba</button>
          </div>
        </div>
      )}

      <div className="entra" style={{ '--i': 1 }}>
        <Brillo className="principal-borde">
          <button type="button" className="principal" onClick={() => onIr('crear')} disabled={!cat.periodo}>
            <span className="principal__icono"><Icono icon={CalendarAdd01Icon} size={28} /></span>
            <span className="principal__txt">
              <b>Crear rutero</b>
              <small>Programa a una persona en una tienda, día por día.</small>
            </span>
            <span className="principal__ir"><Icono icon={ArrowRight01Icon} size={22} /></span>
          </button>
        </Brillo>
      </div>

      <div className="acciones">
        <Accion i={2} tono="verde" icon={Route01Icon} titulo="Actualizar rutero" texto="Mira cómo va, cambia, valida y envía." onClick={() => onIr('actualizar')} />
        <Accion i={3} tono="ambar" icon={UserAdd01Icon} titulo="Petición de creación de usuario" texto="Una persona que no está en la base." onClick={() => onIr('peticion-usuario')} />
        <Accion i={4} tono="azul" icon={StoreAdd01Icon} titulo="Petición de creación de punto de venta" texto="Una tienda que no aparece al buscarla." onClick={() => onIr('peticion-pdv')} />
      </div>

      {peticiones && peticiones.length > 0 && (
        <div className="hoy entra" style={{ '--i': 5 }}>
          <h3>Tus peticiones</h3>
          <ul>
            {peticiones.slice(0, 6).map((p) => (
              <li key={p.id}>
                <span className={`iniciales${p.tipo === 'pdv' ? ' iniciales--tienda' : ''}`}><Icono icon={p.tipo === 'pdv' ? StoreAdd01Icon : UserAdd01Icon} size={18} /></span>
                <div>
                  <b>{p.tipo === 'pdv' ? p.datos.PDV : capital(p.datos.NOMBRE)}</b>
                  <span>{p.tipo === 'pdv' ? `SAP ${p.datos.SAP}` : p.tipo === 'cambio' ? `Cambio a ${p.datos.EVENTO}` : `C.C. ${p.datos.CEDULA}`}</span>
                  <EstadoSolicitud estado={p.estado} comentario={p.comentario} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
