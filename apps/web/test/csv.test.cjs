const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.join(__dirname, '../lib/csv.ts');
const mod = new Module(filename, module);
mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { toCsv } = mod.exports;

test('csv export quotes separators, quotes and line breaks', () => {
  assert.equal(toCsv(['Nombre', 'Total'], [['Roldán; Valeria', 3], ['Dijo "hola"', 0], ['dos\nlíneas', null]]),
    'Nombre;Total\r\n"Roldán; Valeria";3\r\n"Dijo ""hola""";0\r\n"dos\nlíneas";\r\n');
});

test('csv export neutralizes text that a spreadsheet would run as a formula', () => {
  // Un médico podría registrarse con un nombre como =HYPERLINK(...): al abrir el archivo no debe ejecutarse.
  assert.equal(toCsv(['Nombre'], [['=HYPERLINK("http://x")'], ['+54 261'], ['@cmd'], ['-1']]),
    'Nombre\r\n"\'=HYPERLINK(""http://x"")"\r\n\'+54 261\r\n\'@cmd\r\n\'-1\r\n');
  // Los números negativos reales no se tocan.
  assert.equal(toCsv(['Total'], [[-1]]), 'Total\r\n-1\r\n');
});
