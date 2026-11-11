// Modo demo (solo en el build de GitHub Pages, con VITE_DEMO=1): todas las llamadas a /api las
// responde un servidor de mentiras en el navegador. El build normal usa ./nada.js en su lugar.
import { reiniciarDemo, responder } from './servidor';
import './demo.css';

const fetchReal = window.fetch.bind(window);
window.fetch = async (url, opciones = {}) => {
  const texto = typeof url === 'string' ? url : url.url;
  if (!/\/api\//.test(texto)) return fetchReal(url, opciones);
  const [estado, cuerpo] = await responder(texto, opciones);
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });
};

function aviso(texto) {
  const viejo = document.querySelector('.demo-toast');
  if (viejo) viejo.remove();
  const t = document.createElement('div');
  t.className = 'demo-toast';
  t.setAttribute('role', 'status');
  t.textContent = texto;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// Los Excel los genera el servidor real: en la demo se avisa en vez de descargar.
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[href*="/api/"]');
  if (!a) return;
  e.preventDefault();
  aviso('En la demo no se descargan archivos: el Excel lo genera el servidor real.');
}, true);

function franja() {
  const interno = /\/interno\/?$/.test(location.pathname);
  const f = document.createElement('div');
  f.className = 'demo-franja';
  f.innerHTML = `<span><b>Demo</b> con datos inventados · ${interno ? 'usuario y clave: <code>demo</code>' : 'cédula de los LAS: <code>52123456</code> (Bogotá) o <code>71123456</code> (Medellín)'}</span>`;
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = 'Reiniciar';
  b.onclick = () => { reiniciarDemo(); location.reload(); };
  const ir = document.createElement('a');
  ir.href = interno ? '../' : './interno/';
  ir.textContent = interno ? 'Ir a campo' : 'Ir al área interna';
  f.append(ir, b);
  document.body.prepend(f);
}
if (document.body) franja(); else document.addEventListener('DOMContentLoaded', franja);
