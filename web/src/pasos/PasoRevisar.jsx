import Calendario from '../Calendario';
import { capital, nombreMes } from '../api';
import { Aviso } from '../ui';
import { agruparDias, contar, plural } from './reglas';

// Paso 5: revisar antes de guardar, con el calendario del mes tal como va a quedar.
export default function PasoRevisar({ cat, persona, pdv, evento, marca, cambiaEvento, dias, cerrados, unificarCon, fijos, irA }) {
  const { diasT, horas, nov } = contar(dias);
  const fila = (titulo, valor, detalle, paso) => (
    <div className="revisar__fila">
      <div>
        <small>{titulo}</small>
        <b>{valor}</b>
        {detalle && <span>{detalle}</span>}
      </div>
      {paso && <button type="button" className="btn-link" onClick={() => irA(paso)}>Cambiar</button>}
    </div>
  );
  return (
    <div className="paso">
      <p className="paso__num">Paso 5 de 5</p>
      <h2>Revisa que todo esté bien</h2>
      <p className="paso__ayuda">Si algo no cuadra, toca “Cambiar”. Si está bien, toca <b>Registrar solicitud</b>: el área la revisa y la carga.</p>
      <div className="revisar-dos">
      <div className="revisar-dos__info">
      <div className="revisar">
        {fila('Persona', capital(persona.nombre), `C.C. ${persona.cedula}`, fijos ? null : 1)}
        {fila('Tienda', pdv.nombre, `SAP ${pdv.sap} · ${capital(pdv.ciudad)}`, fijos ? null : 2)}
        {fila('Evento', evento, marca ? `Marca ${marca}` : null, 3)}
        {fila('Mes', capital(nombreMes(cat.periodo)), `${plural(diasT, 'día', 'días')} de trabajo · ${plural(horas, 'hora', 'horas')} · ${plural(nov, 'novedad', 'novedades')}`, 4)}
      </div>
      {cambiaEvento && (
        <Aviso tipo="alerta">
          {capital(persona.nombre.split(' ')[0])} cambia de evento: se crea una <b>petición de cambio</b> (evento y marca) que va dentro de tu formato.
        </Aviso>
      )}
      {unificarCon.length > 0 && (
        <Aviso tipo="alerta">
          Al guardar, las otras tiendas de {capital(persona.nombre.split(' ')[0])} con {unificarCon.join(', ')} pasan a <b>{evento}</b> de mañana en adelante.
        </Aviso>
      )}
      <div className="revisar__dias">
        {agruparDias(cat, dias).map(([clave, g]) => (
          <div key={clave} className={`revisar__grupo revisar__grupo--${g.tipo}`}>
            <b>{clave}</b>
            <span>{g.dias.length} {g.dias.length === 1 ? 'día' : 'días'}: {g.dias.join(', ')}</span>
          </div>
        ))}
      </div>
      </div>
      <div className="revisar-dos__cal">
        <Calendario fechas={cat.fechas} dias={dias} cerrados={cerrados} soloLectura />
      </div>
      </div>
    </div>
  );
}
