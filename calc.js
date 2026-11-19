// Cálculo de intereses punitorios de AFIP/ARCA.
// Port fiel del algoritmo de https://serviciosweb.afip.gob.ar/genericos/calculoInteres/punitorios.aspx
// (funciones_puni.js v2.1.2.0): meses de 30 días, interés por tramo de tasa, redondeo a 2 decimales por tramo.
// Fechas como enteros yyyymmdd. Tasas en % mensual, vigentes desde la fecha indicada.
(function (root) {
  var TASAS = (typeof module !== 'undefined' && module.exports) ? require('./tasas.js') : root.TASAS_PUNITORIOS;
  var FMIN = 19880127, FMAX = 20991231;

  function esFecha(n) {
    var y = Math.floor(n / 10000), m = Math.floor(n / 100) % 100, d = n % 100;
    var f = new Date(y, m - 1, d);
    return f.getFullYear() === y && f.getMonth() === m - 1 && f.getDate() === d;
  }
  function diaMenos(n) {
    var a = Math.floor(n / 10000), m = Math.floor(n / 100) % 100, d = n % 100 - 1;
    if (d <= 0) { d = 31; m -= 1; if (m <= 0) { m = 12; a -= 1; } }
    while (!esFecha(a * 10000 + m * 100 + d)) d -= 1;
    return a * 10000 + m * 100 + d;
  }
  function diaMas(n) {
    var a = Math.floor(n / 10000), m = Math.floor(n / 100) % 100, d = n % 100 + 1;
    if (!esFecha(a * 10000 + m * 100 + d)) { d = 1; m += 1; if (m > 12) { m = 1; a += 1; } }
    return a * 10000 + m * 100 + d;
  }
  function sumMeses(n, meses) {
    var a = Math.floor(n / 10000), m = Math.floor(n / 100) % 100, d = n % 100;
    a += parseInt(meses / 12, 10);
    m += meses % 12;
    if (m > 12) { m -= 12; a += 1; }
    while (!esFecha(a * 10000 + m * 100 + d)) d -= 1;
    return a * 10000 + m * 100 + d;
  }
  // La versión original solo ejecuta la rama "mes9 = 1" (por un "=" en lugar de "==") y se replica igual.
  function difDias(f0, f9) {
    var ax9 = Math.floor(f9 / 10000), mx9 = Math.floor(f9 / 100) % 100, dx9 = f9 % 100;
    var dia9 = 1;
    dx9 += 1;
    while (esFecha(ax9 * 10000 + mx9 * 100 + dx9)) { dia9 += 1; dx9 += 1; }
    mx9 += 1;
    if (mx9 > 12) { ax9 += 1; mx9 -= 12; }
    dx9 = 1;
    var fecn = ax9 * 10000 + mx9 * 100 + dx9;
    while (f0 > fecn) { dia9 += 1; dx9 += 1; fecn = ax9 * 10000 + mx9 * 100 + dx9; }
    return dia9;
  }
  function difFecha(f7, f6) {
    var meses = (Math.floor(f7 / 10000) - Math.floor(f6 / 10000)) * 12 +
      (Math.floor(f7 / 100) % 100) - (Math.floor(f6 / 100) % 100);
    var dias;
    if (f6 % 100 > f7 % 100) { meses -= 1; dias = difDias(f7, sumMeses(f6, meses)); }
    else dias = f7 % 100 - f6 % 100;
    return [meses, dias];
  }
  function redondeo(x, p) { var c = Math.pow(10, p); return Math.round(x * c) / c; }

  // Tabla de tramos (igual a la de la página: cada tramo arranca el día anterior al inicio del siguiente).
  var tdes = [], thas = [];
  (function () {
    var n = TASAS.length;
    for (var i = 0; i < n; i++) {
      tdes[i] = TASAS[i][0];
      if (i > 0) { thas[i - 1] = diaMenos(tdes[i]); tdes[i] = thas[i - 1]; }
    }
    thas[n - 1] = FMAX;
  })();

  // desde/hasta: enteros yyyymmdd. Devuelve {interes, tramos:[{desde,hasta,tasaMensual,tasaDiaria,interes}]} o {error}.
  function calcular(desde, hasta, importe) {
    if (!esFecha(desde)) return { error: 'Fecha de inicio inválida' };
    if (!esFecha(hasta)) return { error: 'Fecha de pago inválida' };
    if (desde < FMIN) return { error: 'La fecha de inicio debe ser igual o mayor que 27/01/1988' };
    if (desde > FMAX) return { error: 'La fecha de inicio debe ser igual o menor que 31/12/2099' };
    if (hasta <= desde) return { error: 'La fecha de pago debe ser mayor que la fecha de inicio' };
    if (hasta > FMAX) return { error: 'La fecha de pago debe ser igual o menor que 31/12/2099' };
    if (!(importe > 0)) return { error: 'El importe debe ser mayor que cero' };
    if (importe >= 1e10) return { error: 'El importe debe ser menor que 10.000.000.000' };
    importe = redondeo(importe, 2);

    var mini = false, tramos = [], total = 0;
    for (var x = 0; x < tdes.length; x++) {
      var todo = true, cd, ch, maxi = false;
      if (!mini && desde >= tdes[x] && desde <= thas[x]) { cd = desde; mini = true; todo = false; }
      if (mini) {
        if (hasta <= thas[x]) { if (todo) cd = tdes[x]; ch = hasta; maxi = true; }
        else if (!todo) ch = thas[x];
        else { cd = tdes[x]; ch = thas[x]; }
        var dif = difFecha(ch, cd);
        var t = TASAS[x][1];
        var int = redondeo((dif[0] + dif[1] / 30) * t * importe / 100, 2);
        tramos.push({ desde: diaMas(cd), hasta: ch, dias: dif[0] * 30 + dif[1], tasaMensual: t, tasaDiaria: redondeo(t / 30, 6), interes: int });
        total += int;
      }
      if (mini && maxi) break;
    }
    return { interes: redondeo(total, 2), tramos: tramos };
  }

  var api = { calcular: calcular, TASAS: TASAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AfipPunitorios = api;
})(typeof window !== 'undefined' ? window : this);
