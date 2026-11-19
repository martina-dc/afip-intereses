// Descarga la página de AFIP, extrae la tabla de tasas punitorias y regenera tasas.js.
// Uso: node actualizar_tasas.js   (Node 18+)
const fs = require('fs'), path = require('path');
const URL = 'https://serviciosweb.afip.gob.ar/genericos/calculoInteres/punitorios.aspx';

(async () => {
  const res = await fetch(URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('AFIP respondió ' + res.status);
  const html = await res.text();

  const rows = [];
  for (const m of html.matchAll(/fecha\[(\d+)\]\s*=\s*'(\d\d)\/(\d\d)\/(\d{4})';\s*tasa\[\d+\]\s*=\s*([\d.]+);/g))
    rows.push([+m[1], +m[4] * 10000 + +m[3] * 100 + +m[2], parseFloat(m[5])]);
  rows.sort((a, b) => a[0] - b[0]);

  // Validaciones: si AFIP cambia el formato, falla en vez de pisar la tabla con datos rotos.
  if (rows.length < 42) throw new Error('Se esperaban al menos 42 tramos y se leyeron ' + rows.length);
  rows.forEach((r, i) => {
    if (i && r[1] <= rows[i - 1][1]) throw new Error('Fechas no crecientes en tramo ' + r[0]);
    if (!(r[2] > 0 && r[2] < 100)) throw new Error('Tasa inválida en tramo ' + r[0]);
  });

  const body = rows.map(r => `    [${r[1]}, ${r[2]}]`).join(',\n');
  const file = path.join(__dirname, 'tasas.js');
  const prev = fs.readFileSync(file, 'utf8');
  const next = prev.replace(/  var T = \[\n[\s\S]*?\n  \];/, `  var T = [\n${body}\n  ];`);
  if (next === prev) return console.log('Sin cambios (' + rows.length + ' tramos).');
  fs.writeFileSync(file, next);
  console.log('tasas.js actualizado (' + rows.length + ' tramos).');
})().catch(e => { console.error(e.message); process.exit(1); });
