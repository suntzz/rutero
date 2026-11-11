import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, ArrowDown01Icon, ArrowLeft01Icon, Calendar03Icon, CheckmarkCircle02Icon, Copy01Icon, Download04Icon, Home01Icon, InformationCircleIcon, Logout01Icon, Moon02Icon, Sun03Icon } from '@hugeicons/core-free-icons';

import Grainient from './reactbits/Grainient';
import SpotlightCard from './reactbits/SpotlightCard';
import AnimatedList from './reactbits/AnimatedList';
import BorderGlow from './reactbits/BorderGlow';
import logoHorizontal from './marca/rutero-horizontal.svg';
import logoNegativo from './marca/rutero-horizontal-negativo.svg';
import simboloNegativo from './marca/rutero-simbolo-negativo.svg';
import logoSimbolo from './marca/rutero-simbolo.svg';
import logoEficacia from './marca/eficacia.png';
import logoNutresa from './marca/grupo-nutresa.png';

// Logo de Rutero ("Mes recorrido"): archivos maestros en logo/final, ver logo/GUIA.md.
// En modo oscuro se usa la versión negativa (símbolo y letras claras). En celulares angostos la
// cabecera muestra solo el símbolo para que quepan los logos de Eficacia y Nutresa.
export function Logo({ alto = 34 }) {
  const { tema } = useContext(TemaContexto);
  const oscuro = tema === 'dark';
  return (
    <span className="logo-caja">
      <img className="logo logo--completo" src={oscuro ? logoNegativo : logoHorizontal} alt="Rutero" width={Math.round((alto * 881) / 256)} height={alto} />
      <img className="logo logo--simbolo" src={oscuro ? simboloNegativo : logoSimbolo} alt="Rutero" width={alto} height={alto} />
    </span>
  );
}

// ---------- Tema claro / oscuro ----------
// Preferencia: 'sistema' (sigue al celular), 'claro' u 'oscuro'. public/tema.js la aplica antes de
// pintar para que no haya destello; este hook la mantiene y la comparte por contexto.
const CLAVE_TEMA = 'rutero-tema';
const COLOR_BARRA = { light: '#f5f3ee', dark: '#0c1613' };

function leerPreferencia() {
  try {
    return localStorage.getItem(CLAVE_TEMA) || 'sistema';
  } catch {
    return 'sistema';
  }
}

const consultaOscuro = () => window.matchMedia('(prefers-color-scheme: dark)');

export function useTema() {
  const [pref, setPref] = useState(leerPreferencia);
  const [sistemaOscuro, setSistemaOscuro] = useState(() => consultaOscuro().matches);

  useEffect(() => {
    const m = consultaOscuro();
    const cambio = (e) => setSistemaOscuro(e.matches);
    m.addEventListener('change', cambio);
    return () => m.removeEventListener('change', cambio);
  }, []);

  const tema = pref === 'sistema' ? (sistemaOscuro ? 'dark' : 'light') : pref === 'oscuro' ? 'dark' : 'light';

  useEffect(() => {
    const raiz = document.documentElement;
    if (pref === 'sistema') delete raiz.dataset.theme;
    else raiz.dataset.theme = tema;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_BARRA[tema]);
    try {
      if (pref === 'sistema') localStorage.removeItem(CLAVE_TEMA);
      else localStorage.setItem(CLAVE_TEMA, pref);
    } catch { /* sin almacenamiento: el tema dura mientras la página esté abierta */ }
  }, [pref, tema]);

  return { tema, cambiar: () => setPref(tema === 'dark' ? 'claro' : 'oscuro') };
}

export const TemaContexto = createContext({ tema: 'light', cambiar: () => {} });

// Colores que los componentes de React Bits necesitan como valor (no aceptan variables CSS).
const PALETA = {
  light: { acento: '#0f6e5a', papel: '#ffffff', foco: 'rgba(15, 110, 90, 0.14)' },
  dark: { acento: '#5ccfa8', papel: '#14201c', foco: 'rgba(92, 207, 168, 0.12)' },
};

export function useEstilo() {
  const { tema } = useContext(TemaContexto);
  return { tema, ...PALETA[tema] };
}

export function BotonTema() {
  const { tema, cambiar } = useContext(TemaContexto);
  const oscuro = tema === 'dark';
  return (
    <button type="button" className="tema" onClick={cambiar} aria-label={oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} title={oscuro ? 'Modo claro' : 'Modo oscuro'}>
      <Icono icon={oscuro ? Sun03Icon : Moon02Icon} size={20} />
    </button>
  );
}

// Lista para tocar (React Bits · AnimatedList) con los valores de Rutero: entrada mínima y sin
// animación mientras se escribe, porque se ve decenas de veces al día.
export function Lista({ escribiendo = false, ...props }) {
  const e = useEstilo();
  return (
    <AnimatedList
      theme={e.tema}
      accentColor={e.acento}
      width="100%"
      selectOnHover={false}
      animateOnce
      animation={escribiendo ? 'none' : 'fade'}
      stagger={0.03}
      {...props}
    />
  );
}

// Borde con brillo (React Bits · BorderGlow) para las acciones destacadas.
export function Brillo({ className = '', children }) {
  const e = useEstilo();
  return (
    <BorderGlow backgroundColor={e.papel} borderRadius={16} glowRadius={24} glowColor="160 70 40" colors={['#2fa37f', '#f5b942', '#7cc9ae']} fillOpacity={e.tema === 'dark' ? 0.12 : 0.22} className={className}>
      {children}
    </BorderGlow>
  );
}

// Fondo animado suave (React Bits · Grainient) detrás de toda la página.
const COLORES_FONDO = {
  light: ['#f7f4ea', '#cfeadd', '#7cc4a6', '#f3d38a', '#fbf8ef'],
  dark: ['#0b1a16', '#12352c', '#1f6b57', '#5c4a1c', '#0e1f1b'],
};
export function Fondo() {
  const { tema } = useEstilo();
  return (
    <div className="fondo" aria-hidden="true">
      <Grainient
        key={tema}
        colors={COLORES_FONDO[tema]}
        angle={140}
        speed={0.35}
        flow={0.6}
        softness={1.2}
        silk={0.5}
        grainAmount={0.05}
        saturation={0.9}
        clickSwirl={false}
        stir={0.6}
        intro={false}
      />
      <div className="fondo__velo" />
    </div>
  );
}

// Tarjeta blanca con una luz que sigue el dedo o el mouse (React Bits · SpotlightCard).
export function Tarjeta({ className = '', children, ...rest }) {
  const e = useEstilo();
  return (
    <SpotlightCard theme={e.tema} spotlightColor={e.foco} intensity={0.5} borderGlow={0.4} className={`tarjeta ${className}`} {...rest}>
      {children}
    </SpotlightCard>
  );
}

export function Icono({ icon, size = 20, ...rest }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.8} {...rest} />;
}

export function Aviso({ tipo = 'info', children, accion }) {
  if (!children) return null;
  const icon = tipo === 'error' || tipo === 'alerta' ? Alert02Icon : tipo === 'ok' ? CheckmarkCircle02Icon : InformationCircleIcon;
  return (
    <div className={`aviso aviso--${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      <Icono icon={icon} size={20} />
      <div className="aviso__texto">
        {children}
        {accion && <div className="aviso__accion">{accion}</div>}
      </div>
    </div>
  );
}

export function Iniciales({ nombre }) {
  const partes = String(nombre).trim().split(/\s+/);
  const ini = (partes[0]?.[0] || '') + (partes[1]?.[0] || '');
  return <span className="iniciales" aria-hidden="true">{ini}</span>;
}

// Tarjeta con los datos de lo que se eligió, con botón para cambiarlo.
export function Ficha({ titulo, etiqueta, datos, onCambiar }) {
  return (
    <div className="ficha">
      <div className="ficha__cab">
        <span className="ficha__ok"><Icono icon={CheckmarkCircle02Icon} size={22} /></span>
        <div className="ficha__titulo">
          {etiqueta && <small>{etiqueta}</small>}
          <b>{titulo}</b>
        </div>
        {onCambiar && <button type="button" className="btn-link" onClick={onCambiar}>Cambiar</button>}
      </div>
      <dl className="ficha__datos">
        {datos.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}

export function Campo({ etiqueta, ayuda, children }) {
  return (
    <label className="campo">
      <span className="campo__etiqueta">{etiqueta}</span>
      {children}
      {ayuda && <span className="campo__ayuda">{ayuda}</span>}
    </label>
  );
}

export function Buscador({ valor, onCambio, placeholder, autoFocus, inputMode, etiqueta }) {
  return (
    <div className="buscador">
      <input
        type="search"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        inputMode={inputMode}
        aria-label={etiqueta || placeholder}
        autoComplete="off"
      />
    </div>
  );
}

// Bloque gris con brillo para mostrar que algo está cargando.
export function Esqueleto({ ancho = '100%', alto = 16, redondo = 8, className = '' }) {
  return <span className={`esqueleto ${className}`} style={{ width: ancho, height: alto, borderRadius: redondo }} aria-hidden="true" />;
}

// Filas de lista (avatar + dos líneas) mientras llega una lista.
export function EsqueletoLista({ filas = 5, avatar = true }) {
  return (
    <div className="esqueleto-lista" role="status" aria-label="Cargando">
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="esqueleto-lista__fila">
          {avatar && <Esqueleto ancho={36} alto={36} redondo={18} />}
          <div className="esqueleto-lista__txt">
            <Esqueleto ancho={`${70 - (i % 3) * 12}%`} alto={14} />
            <Esqueleto ancho={`${42 - (i % 2) * 10}%`} alto={11} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Espera al menos `ms` para que el esqueleto alcance a verse aunque la respuesta sea instantánea.
export function conMinimo(promesa, ms = 600) {
  return Promise.all([promesa, new Promise((r) => setTimeout(r, ms))]).then(([v]) => v);
}

// Logos de Eficacia (quien opera Rutero) y Grupo Nutresa, arriba a la derecha de la cabecera.
export function Marcas() {
  return (
    <div className="marcas" aria-label="Eficacia para Grupo Nutresa">
      <img src={logoEficacia} alt="Eficacia" height="20" width="59" />
      <img src={logoNutresa} alt="Grupo Nutresa" height="34" width="26" />
    </div>
  );
}

// Ventana de confirmación o decisión. Sale más rápido de lo que entra; Esc o tocar afuera cierra.
export function Dialogo({ titulo, children, acciones, onCerrar }) {
  const [saliendo, setSaliendo] = useState(false);
  const caja = useRef(null);
  const cerrarRef = useRef(null);

  function cerrar(despues) {
    const fin = () => { onCerrar(); if (despues) despues(); };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { fin(); return; }
    setSaliendo(true);
    setTimeout(fin, 150);
  }
  cerrarRef.current = cerrar;

  useEffect(() => {
    const previo = document.activeElement;
    caja.current?.focus({ preventScroll: true });
    const tecla = (e) => e.key === 'Escape' && cerrarRef.current();
    document.addEventListener('keydown', tecla);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = '';
      previo?.focus?.({ preventScroll: true });
    };
  }, []);

  return (
    <div className={`visor dialogo${saliendo ? ' visor--sale' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dialogo-titulo" onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <div className="visor__caja dialogo__caja" ref={caja} tabIndex={-1}>
        <h2 id="dialogo-titulo">{titulo}</h2>
        <div className="dialogo__texto">{children}</div>
        <div className="dialogo__botones">
          {acciones.map((a) => (
            <button key={a.texto} type="button" className={`btn btn--grande${a.secundario ? ' btn--sec' : ''}`} onClick={() => cerrar(a.onClick)}>
              {a.icon && <Icono icon={a.icon} />} {a.texto}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Cabecera común: marca a la izquierda (Rutero + Eficacia y Grupo Nutresa) y, a la derecha, el menú
// de la persona (con sesión) o solo el botón de tema (sin sesión).
export function Cabecera({ usuario, detalle, periodo, onInicio, onSalir }) {
  return (
    <header className="barra">
      <div className="barra__contenido">
        <div className="barra__marca">
          {onInicio
            ? <button type="button" className="barra__logo" onClick={onInicio} aria-label="Ir al inicio"><Logo /></button>
            : <Logo />}
          <span className="barra__div" aria-hidden="true" />
          <Marcas />
        </div>
        {usuario ? <MenuUsuario nombre={usuario} detalle={detalle} periodo={periodo} onInicio={onInicio} onSalir={onSalir} /> : <BotonTema />}
      </div>
    </header>
  );
}

// Menú de la persona: mes abierto, modo oscuro, inicio y salir. Escala desde el botón; Esc o
// tocar afuera lo cierra. Cierra más rápido de lo que abre.
function MenuUsuario({ nombre, detalle, periodo, onInicio, onSalir }) {
  const { tema, cambiar } = useContext(TemaContexto);
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (!caja.current?.contains(e.target)) setAbierto(false); };
    const tecla = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  const elegir = (accion) => () => { setAbierto(false); accion(); };
  const primerNombre = String(nombre).trim().split(/\s+/)[0].toLowerCase();

  return (
    <div className="usuario" ref={caja}>
      <button type="button" className="usuario__boton" onClick={() => setAbierto((v) => !v)} aria-haspopup="menu" aria-expanded={abierto} aria-label={`Menú de ${primerNombre}`}>
        <Iniciales nombre={nombre} />
        <span className="usuario__nombre">{primerNombre}</span>
        <Icono icon={ArrowDown01Icon} size={16} className="usuario__flecha" />
      </button>
      <div className={`menu${abierto ? ' menu--abierto' : ''}`} role="menu" aria-hidden={!abierto}>
        <div className="menu__cab">
          <Iniciales nombre={nombre} />
          <div><b>{String(nombre).toLowerCase()}</b>{detalle && <span>{detalle}</span>}</div>
        </div>
        {periodo && (
          <div className="menu__dato"><Icono icon={Calendar03Icon} size={18} /> <span>Mes abierto</span> <b>{periodo}</b></div>
        )}
        <button type="button" role="menuitemcheckbox" aria-checked={tema === 'dark'} className="menu__item" onClick={cambiar} tabIndex={abierto ? 0 : -1}>
          <Icono icon={tema === 'dark' ? Moon02Icon : Sun03Icon} size={18} /> <span>Modo oscuro</span>
          <span className="interruptor" aria-hidden="true"><span /></span>
        </button>
        {onInicio && (
          <button type="button" role="menuitem" className="menu__item" onClick={elegir(onInicio)} tabIndex={abierto ? 0 : -1}>
            <Icono icon={Home01Icon} size={18} /> <span>Ir al inicio</span>
          </button>
        )}
        <span className="menu__sep" aria-hidden="true" />
        <button type="button" role="menuitem" className="menu__item menu__item--salir" onClick={elegir(onSalir)} tabIndex={abierto ? 0 : -1}>
          <Icono icon={Logout01Icon} size={18} /> <span>Salir</span>
        </button>
      </div>
    </div>
  );
}

// Botón para regresar, siempre arriba a la izquierda de cada pantalla.
export function Volver({ onClick, children = 'Volver al inicio' }) {
  return (
    <button type="button" className="volver" onClick={onClick}>
      <span className="volver__flecha" aria-hidden="true"><Icono icon={ArrowLeft01Icon} size={18} /></span>
      {children}
    </button>
  );
}

// Estado de una solicitud del LAS: solo el área la vuelve oficial.
const ESTADOS = {
  pendiente: { texto: 'Pendiente de cargue', clase: 'pendiente' },
  cargada: { texto: 'Cargada por el área', clase: 'cargada' },
  devuelta: { texto: 'Devuelta por el área', clase: 'devuelta' },
};

export function EstadoSolicitud({ estado = 'pendiente', comentario }) {
  const e = ESTADOS[estado] || ESTADOS.pendiente;
  return (
    <span className={`estado estado--${e.clase}`} title={comentario || undefined}>
      <i aria-hidden="true" />{e.texto}{estado === 'devuelta' && comentario ? `: ${comentario}` : ''}
    </span>
  );
}

function Copiar({ texto }) {
  const [hecho, setHecho] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setHecho(true);
      setTimeout(() => setHecho(false), 1600);
    } catch { /* sin portapapeles: el texto queda a la vista para copiarlo a mano */ }
  }
  return (
    <button type="button" className="btn btn--sec btn--peq copiar" onClick={copiar} aria-live="polite">
      <Icono icon={hecho ? CheckmarkCircle02Icon : Copy01Icon} size={16} /> {hecho ? 'Copiado' : 'Copiar'}
    </button>
  );
}

// Pasos para enviar el archivo al área. Rutero no envía correos: el LAS descarga el formato y lo envía.
const ARCHIVOS = {
  rutero: { href: '/api/las/formato.xlsx', boton: 'Descargar formato del rutero', correo: 'rutero', asunto: (mes, las) => `Rutero ${mes} - ${las}` },
  usuario: { href: '/api/peticiones/usuario.xlsx', boton: 'Descargar peticiones de usuario', correo: 'peticiones', asunto: (mes, las) => `Petición de usuarios ${mes} - ${las}` },
  pdv: { href: '/api/peticiones/pdv.xlsx', boton: 'Descargar peticiones de punto de venta', correo: 'peticiones', asunto: (mes, las) => `Petición de puntos de venta ${mes} - ${las}` },
};

export function ComoEnviar({ tipo, correos, mes = '', las = '' }) {
  const a = ARCHIVOS[tipo];
  const correo = correos[a.correo];
  const asunto = a.asunto(mes, las).replace(/\s+/g, ' ').trim();
  return (
    <div className="enviar">
      <p className="enviar__titulo">Para que el área lo cargue:</p>
      <ol className="enviar__pasos">
        <li>
          <span><b>Descarga el archivo.</b> Trae todo lo que has registrado este mes.</span>
          <a className="btn btn--peq" href={a.href} download><Icono icon={Download04Icon} size={16} /> {a.boton}</a>
        </li>
        <li>
          <span><b>Envíalo por correo a</b> <code>{correo}</code></span>
          <Copiar texto={correo} />
        </li>
        <li>
          <span><b>Con este asunto:</b> <code>{asunto}</code></span>
          <Copiar texto={asunto} />
        </li>
        <li><span>El área lo revisa y lo carga. Hasta entonces lo verás como <b>Pendiente de cargue</b>; si algo no cuadra te lo devuelven con un comentario.</span></li>
      </ol>
    </div>
  );
}
