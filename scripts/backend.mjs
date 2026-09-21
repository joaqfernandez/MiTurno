import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const localPython = fileURLToPath(new URL(
  process.platform === 'win32'
    ? '../apps/api-python/.venv/Scripts/python.exe'
    : '../apps/api-python/.venv/bin/python',
  import.meta.url,
));
const candidates = [
  ...(existsSync(localPython) ? [[localPython]] : []),
  ...(process.platform === 'win32' ? [['py', '-3'], ['python'], ['python3']] : [['python3'], ['python']]),
];
const python = candidates.find(([command, ...args]) =>
  spawnSync(command, [...args, '--version'], { stdio: 'ignore' }).status === 0,
);
if (!python) {
  console.error('No se encontró Python. Instalá Python 3.12 y volvé a ejecutar npm run setup:api.');
  process.exit(1);
}
const [command, ...args] = python;
const result = spawnSync(command, [...args, 'scripts/backend.py', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
