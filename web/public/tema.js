// Aplica el modo claro u oscuro elegido antes de pintar la página (sin destello).
try {
  var p = localStorage.getItem('rutero-tema');
  if (p === 'oscuro' || p === 'claro') document.documentElement.dataset.theme = p === 'oscuro' ? 'dark' : 'light';
  var oscuro = p === 'oscuro' || (p !== 'claro' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', oscuro ? '#0c1613' : '#f5f3ee');
} catch (e) { /* sin almacenamiento: se usa el tema del sistema */ }
