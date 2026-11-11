// Seguridad del área interna.
//
// - Las claves se guardan como scrypt(HMAC(secreto, clave), sal). El secreto vive en .env
//   (fuera del repositorio), así que con solo el código y data/ no se puede adivinar la clave.
// - Bloqueo por intentos fallidos (por usuario y por IP), sesiones que vencen y cookies HttpOnly.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const ENV = path.join(RAIZ, '.env');
const SUPERUSUARIOS = path.join(process.env.RUTERO_DATA || path.join(RAIZ, 'data'), 'superusuarios.json');

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESION_MAX_MS = 8 * 60 * 60 * 1000;
const SESION_INACTIVA_MS = 60 * 60 * 1000;
const FALLOS_POR_USUARIO = 5;
const FALLOS_POR_IP = 20;
const BLOQUEO_MS = 15 * 60 * 1000;

// ---------- Secreto del servidor ----------

function leerEnv() {
  if (!fs.existsSync(ENV)) return {};
  return Object.fromEntries(fs.readFileSync(ENV, 'utf8').split('\n')
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}

// Variable de configuración: primero el entorno (Railway), luego el archivo .env.
function variable(nombre) {
  return process.env[nombre] || leerEnv()[nombre] || '';
}

function secreto() {
  if (process.env.RUTERO_SECRETO) return process.env.RUTERO_SECRETO;
  const env = leerEnv();
  if (env.RUTERO_SECRETO) return env.RUTERO_SECRETO;
  // En el servidor no se inventa uno: cambiaría en cada despliegue y dejaría sin servir las claves
  // del área interna y las sesiones abiertas.
  if (process.env.RAILWAY_ENVIRONMENT) throw new Error('Falta la variable RUTERO_SECRETO en Railway (cópiala de tu .env).');
  const nuevo = crypto.randomBytes(48).toString('base64url');
  fs.appendFileSync(ENV, `RUTERO_SECRETO=${nuevo}\n`, { mode: 0o600 });
  return nuevo;
}

const SECRETO = secreto();

function hashClave(clave, sal) {
  const conSecreto = crypto.createHmac('sha256', SECRETO).update(String(clave)).digest();
  return crypto.scryptSync(conSecreto, Buffer.from(sal, 'hex'), 64, SCRYPT).toString('hex');
}

// ---------- Super usuarios ----------

// En el servidor (Railway) los super usuarios van en la variable RUTERO_SUPERUSUARIOS (el JSON que
// imprime scripts/crear-superusuario.js); en local, en data/superusuarios.json.
function leerSuperusuarios() {
  const env = variable('RUTERO_SUPERUSUARIOS');
  try {
    if (env) return JSON.parse(env);
    return JSON.parse(fs.readFileSync(SUPERUSUARIOS, 'utf8'));
  } catch {
    return [];
  }
}

function guardarSuperusuario(usuario, clave) {
  const lista = leerSuperusuarios().filter((u) => u.usuario !== usuario);
  const sal = crypto.randomBytes(16).toString('hex');
  lista.push({ usuario, sal, hash: hashClave(clave, sal), creado: new Date().toISOString() });
  fs.writeFileSync(SUPERUSUARIOS, JSON.stringify(lista, null, 2), { mode: 0o600 });
}

// Hash de relleno para que un usuario inexistente tarde lo mismo que uno real.
const SAL_FALSA = crypto.randomBytes(16).toString('hex');

function verificar(usuario, clave) {
  const su = leerSuperusuarios().find((u) => u.usuario === usuario);
  const calculado = Buffer.from(hashClave(clave, su ? su.sal : SAL_FALSA), 'hex');
  const esperado = su ? Buffer.from(su.hash, 'hex') : crypto.randomBytes(calculado.length);
  return crypto.timingSafeEqual(calculado, esperado) && !!su;
}

// ---------- Bloqueo por intentos ----------

const fallos = new Map(); // clave -> { n, hasta }

function bloqueado(clave) {
  const f = fallos.get(clave);
  return !!(f && f.hasta && f.hasta > Date.now());
}

function registrarFallo(clave, limite) {
  const f = fallos.get(clave) || { n: 0, hasta: 0 };
  if (f.hasta && f.hasta <= Date.now()) { f.n = 0; f.hasta = 0; }
  f.n++;
  if (f.n >= limite) f.hasta = Date.now() + BLOQUEO_MS;
  fallos.set(clave, f);
}

function intentarLogin(usuario, clave, ip) {
  const kU = `u:${usuario}`;
  const kI = `ip:${ip}`;
  if (bloqueado(kU) || bloqueado(kI)) return { ok: false, bloqueado: true };
  if (typeof usuario !== 'string' || typeof clave !== 'string' || usuario.length > 64 || clave.length > 256) {
    registrarFallo(kI, FALLOS_POR_IP);
    return { ok: false };
  }
  if (verificar(usuario, clave)) {
    fallos.delete(kU);
    return { ok: true };
  }
  registrarFallo(kU, FALLOS_POR_USUARIO);
  registrarFallo(kI, FALLOS_POR_IP);
  return { ok: false, bloqueado: bloqueado(kU) || bloqueado(kI) };
}

// ---------- Ingreso de los LAS (su cédula es la clave) ----------

// Identificador público de un LAS en la lista: no revela la cédula.
function idOpaco(cedula) {
  return crypto.createHmac('sha256', SECRETO).update(`las:${cedula}`).digest('base64url').slice(0, 16);
}

function huellaCedula(v) {
  return crypto.createHmac('sha256', SECRETO).update(String(v).replace(/\D/g, '')).digest();
}

// Compara la cédula escrita con la del LAS elegido. Mismo bloqueo que el área interna:
// 5 intentos fallidos por LAS (o 20 por IP) bloquean 15 minutos.
function intentarLoginLas(idLas, cedulaEscrita, cedulaReal, ip) {
  const kL = `las:${idLas}`;
  const kI = `ip-las:${ip}`;
  if (bloqueado(kL) || bloqueado(kI)) return { ok: false, bloqueado: true };
  const escrita = String(cedulaEscrita || '').replace(/\D/g, '');
  const ok = !!cedulaReal && escrita.length >= 5 && escrita.length <= 15
    && crypto.timingSafeEqual(huellaCedula(escrita), huellaCedula(cedulaReal));
  if (ok) {
    fallos.delete(kL);
    return { ok: true };
  }
  registrarFallo(kL, FALLOS_POR_USUARIO);
  registrarFallo(kI, FALLOS_POR_IP);
  return { ok: false, bloqueado: bloqueado(kL) || bloqueado(kI) };
}

// ---------- Sesiones ----------

// La sesión viaja en la cookie, cifrada y firmada (AES-256-GCM con una llave derivada del secreto):
// el navegador no puede leerla ni cambiarla, y sobrevive a los reinicios y despliegues del servidor.
// `tipo` ('las' o 'admin') va dentro de la llave: una sesión de LAS no sirve en el área interna.
function crearAlmacenSesiones(tipo = 'sesion') {
  const llave = crypto.createHmac('sha256', SECRETO).update(`sesion:${tipo}`).digest();
  const cerradas = new Map(); // huella -> vence (sesiones cerradas con "Salir" antes de vencer)
  const huella = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

  function sellar(s) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', llave, iv);
    const cuerpo = Buffer.concat([c.update(JSON.stringify(s), 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), cuerpo]).toString('base64url');
  }

  function abrir(token) {
    try {
      const b = Buffer.from(String(token), 'base64url');
      const d = crypto.createDecipheriv('aes-256-gcm', llave, b.subarray(0, 12));
      d.setAuthTag(b.subarray(12, 28));
      return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
    } catch {
      return null;
    }
  }

  function vigente(s, ahora) {
    return s && ahora - s.c <= SESION_MAX_MS && ahora - s.u <= SESION_INACTIVA_MS;
  }

  return {
    crear(datos) {
      const ahora = Date.now();
      return sellar({ d: datos, c: ahora, u: ahora });
    },
    leer(token) {
      if (!token || cerradas.has(huella(token))) return null;
      const s = abrir(token);
      return vigente(s, Date.now()) ? s.d : null;
    },
    // Misma sesión con la hora de uso al día (para que venza tras 1 hora sin uso, no 1 hora después de entrar).
    renovar(token) {
      const s = abrir(token);
      const ahora = Date.now();
      if (!vigente(s, ahora) || ahora - s.u < 60 * 1000) return null;
      return sellar({ ...s, u: ahora });
    },
    borrar(token) {
      if (!token) return;
      const ahora = Date.now();
      for (const [k, vence] of cerradas) if (vence < ahora) cerradas.delete(k);
      cerradas.set(huella(token), ahora + SESION_MAX_MS);
    },
  };
}

function leerCookie(req, nombre) {
  const c = (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(`${nombre}=`));
  return c ? decodeURIComponent(c.slice(nombre.length + 1)) : null;
}

function cookie(req, nombre, valor, maxAgeSeg) {
  const segura = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return `${nombre}=${valor}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeg}${segura ? '; Secure' : ''}`;
}

// Cabeceras básicas de seguridad para todas las respuestas.
function cabeceras(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  res.removeHeader('X-Powered-By');
  next();
}

module.exports = {
  guardarSuperusuario, intentarLogin, intentarLoginLas, idOpaco, crearAlmacenSesiones, leerCookie, cookie, cabeceras,
  variable, SESION_MAX_MS,
};
