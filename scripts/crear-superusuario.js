// Crea o cambia la clave de un super usuario.
// Uso: node scripts/crear-superusuario.js <usuario>
// La clave se pide por consola (o por la variable RUTERO_CLAVE) para que no quede en el historial.

const readline = require('readline');
const { guardarSuperusuario } = require('../lib/seguridad');

async function pedirClave() {
  if (process.env.RUTERO_CLAVE) return process.env.RUTERO_CLAVE;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => { if (s.includes('Clave')) process.stdout.write(s); };
  const clave = await new Promise((ok) => rl.question('Clave: ', ok));
  rl.close();
  process.stdout.write('\n');
  return clave;
}

(async () => {
  const usuario = process.argv[2];
  if (!usuario) {
    console.error('Uso: node scripts/crear-superusuario.js <usuario>');
    process.exit(1);
  }
  const clave = await pedirClave();
  if (!clave || clave.length < 8) {
    console.error('La clave debe tener al menos 8 caracteres.');
    process.exit(1);
  }
  guardarSuperusuario(usuario, clave);
  console.log(`Super usuario "${usuario}" guardado en data/superusuarios.json.`);
  console.log('Para el servidor (Railway): crea la variable RUTERO_SUPERUSUARIOS con el contenido de ese');
  console.log('archivo, y usa el mismo RUTERO_SECRETO de tu .env (la clave se verifica con ese secreto).');
})();
