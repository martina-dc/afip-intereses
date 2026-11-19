// Descarga la página de AFIP, extrae la tabla de tasas (punitorias y resarcitorias) y regenera tasas.js.
// Uso: node actualizar_tasas.js   (Node 18+)
const fs = require('fs'), path = require('path');
const URL = 'https://serviciosweb.afip.gob.ar/genericos/calculoInteres/punitorios.aspx';

(async () => {
  const res = await fetch(URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('AFIP respondió ' + res.status);
  const html = await res.text();

  // Punitorias: arreglo del script de la página (fecha de vigencia -> % mensual).
  const pun = new Map();
  for (const m of html.matchAll(/fecha\[\d+\]\s*=\s*'(\d\d)\/(\d\d)\/(\d{4})';\s*tasa\[\d+\]\s*=\s*([\d.]+);/g))
    pun.set(+m[3] * 10000 + +m[2] * 100 + +m[1], parseFloat(m[4]));

  // Resarcitorias: tabla "Evolución de Tasas" (desde, hasta, norma, res.mensual, res.diario, pun.mensual, pun.diario).
  const txt = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const resMap = new Map();
  for (const m of txt.matchAll(/(\d\d)\/(\d\d)\/(\d{4}) \d\d\/\d\d\/\d{4} R \([^)]*\) \S+ ([\d.]+) [\d.]+ ([\d.]+) [\d.]+/g)) {
    const f = +m[3] * 10000 + +m[2] * 100 + +m[1];
    // La punitoria de la tabla debe coincidir con la del script; si no, AFIP cambió algo.
    if (pun.has(f) && Math.abs(pun.get(f) - parseFloat(m[5])) > 1e-9) throw new Error('Punitoria inconsistente en ' + f);
    resMap.set(f, parseFloat(m[4]));
  }

  const rows = [...pun.keys()].sort((a, b) => a - b).map(f => [f, pun.get(f), resMap.get(f)]);

  // Validaciones: si AFIP cambia el formato, falla en vez de pisar la tabla con datos rotos.
  if (rows.length < 42) throw new Error('Se esperaban al menos 42 tramos y se leyeron ' + rows.length);
  rows.forEach((r, i) => {
    if (i && r[0] <= rows[i - 1][0]) throw new Error('Fechas no crecientes en ' + r[0]);
    if (!(r[1] > 0 && r[1] < 100)) throw new Error('Tasa punitoria inválida en ' + r[0]);
    if (!(r[2] > 0 && r[2] < 100)) throw new Error('Tasa resarcitoria faltante o inválida en ' + r[0]);
  });

  const body = rows.map(r => `    [${r[0]}, ${r[1]}, ${r[2]}]`).join(',\n');
  const file = path.join(__dirname, 'tasas.js');
  const prev = fs.readFileSync(file, 'utf8');
  const next = prev.replace(/  var T = \[\n[\s\S]*?\n  \];/, `  var T = [\n${body}\n  ];`)
    .replace(/^\/\/ \[fecha.*$/m, '// [fecha de vigencia yyyymmdd, tasa punitoria % mensual, tasa resarcitoria % mensual]');
  if (next === prev) return console.log('Sin cambios (' + rows.length + ' tramos).');
  fs.writeFileSync(file, next);
  console.log('tasas.js actualizado (' + rows.length + ' tramos).');
})().catch(e => { console.error(e.message); process.exit(1); });
