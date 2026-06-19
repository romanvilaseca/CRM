// --- IDs DE TUS DOS BASES DE DATOS ---
const SHEET_ID_VENTAS = '184yrmB_4BRtVWKAvGYNC3Y3qNsoN0x6DSKLme0kfdXw';
const SHEET_ID_CRM = '14WJaC8VkcYAXIiO65Q9DDXh9RXhdUSg8120_L9mG9YY';

// ============================================================
// FASE 1 - SISTEMA DE PUNTOS POR RESULTADO
// Columnas nuevas en VISITAS (al final, no rompen indices viejos):
//   H (idx 7) = Resultado | I (idx 8) = Puntos | J (idx 9) = Origen_Puntaje
// La configuracion de puntos vive en la hoja CONFIG_PUNTOS (editable por gerencia).
// ============================================================
const RESULTADOS_DEFAULT = [
  ['Pedido / venta cerrada', 3],
  ['Cotización / oportunidad abierta', 1],
  ['Pedido pendiente de confirmar', 1],
  ['Contacto efectivo con respuesta', 1],
  ['Cliente completo / no necesita', 0.5],
  ['Producto no disponible (sin stock)', 0.5],
  ['Mensaje enviado sin respuesta', 0],
  ['No se obtuvo contacto', 0]
];
// Resultados que NO implican contacto real con el cliente (no marcan "contactado").
const RESULTADOS_SIN_CONTACTO = ['No se obtuvo contacto'];

// Bono fijo por corregir el teléfono de un cliente (no sale de CONFIG_PUNTOS; es un premio aparte).
const PUNTO_CORRECCION_CONTACTO = 1;
const RESULTADO_CORRECCION = 'Corrección de teléfono';

function obtenerHojaConfigPuntos() {
  const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
  let h = ss.getSheetByName('CONFIG_PUNTOS');
  if (!h) {
    h = ss.insertSheet('CONFIG_PUNTOS');
    h.appendRow(['Resultado', 'Puntos']);
    RESULTADOS_DEFAULT.forEach(function(r) { h.appendRow(r); });
    h.setFrozenRows(1);
    h.getRange(1, 1, 1, 2).setFontWeight('bold');
    h.setColumnWidth(1, 280);
  }
  return h;
}

function obtenerConfigPuntos() {
  const h = obtenerHojaConfigPuntos();
  const data = h.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const res = String(data[i][0]).trim();
    if (!res) continue;
    let pts = parseFloat(String(data[i][1]).replace(',', '.'));
    map[res] = isNaN(pts) ? 0 : pts;
  }
  return map;
}

// Devuelve la lista de resultados (en orden) para poblar el desplegable del formulario.
function obtenerResultadosDisponibles() {
  try {
    const h = obtenerHojaConfigPuntos();
    const data = h.getDataRange().getValues();
    const lista = [];
    for (let i = 1; i < data.length; i++) {
      const res = String(data[i][0]).trim();
      if (!res) continue;
      let pts = parseFloat(String(data[i][1]).replace(',', '.'));
      lista.push({ resultado: res, puntos: isNaN(pts) ? 0 : pts });
    }
    return { exito: true, resultados: lista };
  } catch (e) {
    return { exito: false, mensaje: e.message, resultados: RESULTADOS_DEFAULT.map(function(r){ return {resultado:r[0], puntos:r[1]}; }) };
  }
}

function calcularPuntos(resultado, mapOpcional) {
  const map = mapOpcional || obtenerConfigPuntos();
  const r = String(resultado || '').trim();
  return map.hasOwnProperty(r) ? map[r] : 0;
}

// Guarda la ponderación editada desde el modal de admin. Solo actualiza la columna Puntos
// de los resultados existentes (no renombra ni borra). lista = [{resultado, puntos}, ...].
function guardarConfigPuntos(lista) {
  try {
    if (!lista || !lista.length) return { exito: false, mensaje: 'No se recibió ninguna ponderación.' };
    const h = obtenerHojaConfigPuntos();
    const data = h.getDataRange().getValues();
    let cambios = 0;
    lista.forEach(function(item) {
      const res = String(item.resultado || '').trim();
      let pts = parseFloat(String(item.puntos).replace(',', '.'));
      if (!res || isNaN(pts)) return;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() === res) {
          h.getRange(i + 1, 2).setValue(pts);
          cambios++;
          break;
        }
      }
    });
    return { exito: true, cambios: cambios };
  } catch (e) {
    return { exito: false, mensaje: e.message };
  }
}

// One-shot 2026-06-18: incentivar el registro de baja interaccion
// (antes valian 0; ahora 0.25 y 0.10 respectivamente).
// Idempotente: ejecutar una vez desde el editor y opcionalmente borrar.
function ajustarPuntosBajaInteraccion20260618() {
  return guardarConfigPuntos([
    { resultado: 'Mensaje enviado sin respuesta', puntos: 0.25 },
    { resultado: 'No se obtuvo contacto', puntos: 0.10 }
  ]);
}

// Asegura los encabezados de las columnas nuevas en VISITAS (idempotente).
function inicializarColumnasVisitas() {
  const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
  const h = ss.getSheetByName('VISITAS');
  if (!h) return { exito: false, mensaje: 'No existe la hoja VISITAS' };
  if (!String(h.getRange(1, 8).getValue()).trim()) h.getRange(1, 8).setValue('Resultado');
  if (!String(h.getRange(1, 9).getValue()).trim()) h.getRange(1, 9).setValue('Puntos');
  if (!String(h.getRange(1, 10).getValue()).trim()) h.getRange(1, 10).setValue('Origen_Puntaje');
  return { exito: true };
}

// Setup de la Fase 1: crea CONFIG_PUNTOS y prepara columnas. Correr UNA vez (admin).
function inicializarFase1() {
  obtenerHojaConfigPuntos();
  return inicializarColumnasVisitas();
}

// Suma de puntos del dia para un vendedor (o de todo el equipo si email es null).
function contarPuntosMes(emailFiltro, yyyymmOpcional) {
  const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
  const h = ss.getSheetByName('VISITAS');
  if (!h || h.getLastRow() <= 1) return 0;
  const hoy = new Date();
  const targetYear = yyyymmOpcional ? parseInt(String(yyyymmOpcional).substring(0, 4), 10) : hoy.getFullYear();
  const targetMonth = yyyymmOpcional ? parseInt(String(yyyymmOpcional).substring(5, 7), 10) : (hoy.getMonth() + 1);
  const data = h.getDataRange().getValues();
  const emailLower = emailFiltro ? String(emailFiltro).trim().toLowerCase() : null;
  let suma = 0;
  for (let i = 1; i < data.length; i++) {
    let fVal = data[i][0];
    let y, m;
    if (fVal instanceof Date) {
      y = fVal.getFullYear();
      m = fVal.getMonth() + 1;
    } else {
      const fStr = String(fVal).trim();
      if (fStr.length < 10) continue;
      m = parseInt(fStr.substring(3, 5), 10);
      y = parseInt(fStr.substring(6, 10), 10);
    }
    if (y !== targetYear || m !== targetMonth) continue;
    if (emailLower && String(data[i][1]).trim().toLowerCase() !== emailLower) continue;
    let p = parseFloat(data[i][8]);
    if (!isNaN(p)) suma += p;
  }
  return Math.round(suma * 100) / 100;
}

function contarDiasHabilesMes(year, month) {
  // month es 1-indexed. Cuenta lunes a sabado (excluye domingos).
  let count = 0;
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    if (d.getDay() !== 0) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function obtenerCockpitMes(emailUsuario, yyyymmOpcional) {
  try {
    const email = String(emailUsuario || "").trim().toLowerCase();
    if (!email) return { exito: false, mensaje: "Email vacio", meta: 0, puntos: 0 };
    const metas = obtenerMetasUsuario(email);
    const metaDiaria = metas.puntos > 0 ? metas.puntos : 10;
    const hoy = new Date();
    const targetYear = yyyymmOpcional ? parseInt(String(yyyymmOpcional).substring(0, 4), 10) : hoy.getFullYear();
    const targetMonth = yyyymmOpcional ? parseInt(String(yyyymmOpcional).substring(5, 7), 10) : (hoy.getMonth() + 1);
    const diasHabiles = contarDiasHabilesMes(targetYear, targetMonth);
    const metaMes = metaDiaria * diasHabiles;
    const puntos = contarPuntosMes(email, yyyymmOpcional);
    return {
      exito: true,
      meta: metaMes,
      puntos: puntos,
      metaDiaria: metaDiaria,
      diasHabiles: diasHabiles,
      yyyymm: targetYear + '-' + String(targetMonth).padStart(2, '0')
    };
  } catch (e) {
    return { exito: false, mensaje: e.message, meta: 0, puntos: 0 };
  }
}

function contarPuntosHoy(emailFiltro, fechaStrOpcional) {
  const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
  const h = ss.getSheetByName('VISITAS');
  if (!h || h.getLastRow() <= 1) return 0;
  const fechaObjetivo = fechaStrOpcional || Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy");
  const data = h.getDataRange().getValues();
  const emailLower = emailFiltro ? String(emailFiltro).trim().toLowerCase() : null;
  let suma = 0;
  for (let i = 1; i < data.length; i++) {
    let fVal = data[i][0];
    let fStr = (fVal instanceof Date)
      ? Utilities.formatDate(fVal, "GMT-6", "dd/MM/yyyy")
      : String(fVal).trim().substring(0, 10);
    if (fStr !== fechaObjetivo) continue;
    if (emailLower && String(data[i][1]).trim().toLowerCase() !== emailLower) continue;
    let p = parseFloat(data[i][8]);
    if (!isNaN(p)) suma += p;
  }
  return Math.round(suma * 100) / 100;
}

// Infiere un resultado a partir del tipo y el texto de la nota (para migracion historica).
function inferirResultado(tipo, notaLower) {
  if (String(tipo).trim() === 'No se obtuvo respuesta por llamada') return 'No se obtuvo contacto';
  const n = String(notaLower || '').toLowerCase();
  const tiene = function(arr) { return arr.some(function(k) { return n.indexOf(k) >= 0; }); };
  if (!n.trim()) {
    return (String(tipo).trim() === 'Contacto WhatsApp') ? 'Mensaje enviado sin respuesta' : 'No se obtuvo contacto';
  }
  if (tiene(['no contesta','no respond','no contesto','no contestó','buzon','buzón','apagado','no se logro','no se logró','no localiz','sin respuesta'])) return 'No se obtuvo contacto';
  if (tiene(['realizo pedido','realizó pedido','hizo pedido','pedido realizado','coloco pedido','colocó pedido','factur','compro','compró','venta cerrada','pedido por','se vendio','se vendió'])) return 'Pedido / venta cerrada';
  if (tiene(['pendiente de confirmar','por confirmar','confirmar pedido','queda pendiente','pendiente confirmacion','pendiente confirmación'])) return 'Pedido pendiente de confirmar';
  if (tiene(['cotiz','presupuesto','oportunidad','interesad','paso precio','pasó precio','enviar precio','envio precio','envió precio','envie precio'])) return 'Cotización / oportunidad abierta';
  if (tiene(['no tenemos','sin stock','no hay','agotado','no disponible','sin existencia','no contamos','fuera de stock'])) return 'Producto no disponible (sin stock)';
  if (tiene(['completo','no necesita','abastecid','surtido','no requiere','por el momento no','tiene producto','bien abastecido'])) return 'Cliente completo / no necesita';
  return 'Contacto efectivo con respuesta';
}

// MIGRACION HISTORICA - correr UNA sola vez (admin). Solo rellena filas SIN resultado.
// Marca el origen como 'inferido'. No toca filas ya clasificadas. Reversible (no borra nada).
function migrarResultadosHistoricos() {
  const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
  const h = ss.getSheetByName('VISITAS');
  if (!h || h.getLastRow() <= 1) return { exito: false, mensaje: 'VISITAS vacía' };
  inicializarColumnasVisitas();
  const map = obtenerConfigPuntos();
  const data = h.getDataRange().getValues();
  const n = data.length - 1;
  const resCol = [], ptsCol = [], oriCol = [];
  let inferidas = 0, yaTenian = 0;
  const conteoPorResultado = {};
  for (let i = 1; i < data.length; i++) {
    let resActual = String(data[i][7] || '').trim();
    if (resActual) {
      resCol.push([data[i][7]]); ptsCol.push([data[i][8]]); oriCol.push([data[i][9] || 'manual']);
      yaTenian++;
      continue;
    }
    let tipo = String(data[i][4] || '').trim();
    let nota = String(data[i][5] || '');
    let resultado = inferirResultado(tipo, nota);
    let pts = calcularPuntos(resultado, map);
    resCol.push([resultado]); ptsCol.push([pts]); oriCol.push(['inferido']);
    inferidas++;
    conteoPorResultado[resultado] = (conteoPorResultado[resultado] || 0) + 1;
  }
  if (resCol.length > 0) {
    h.getRange(2, 8, resCol.length, 1).setValues(resCol);
    h.getRange(2, 9, ptsCol.length, 1).setValues(ptsCol);
    h.getRange(2, 10, oriCol.length, 1).setValues(oriCol);
  }
  return { exito: true, totalFilas: n, inferidas: inferidas, yaClasificadas: yaTenian, desglose: conteoPorResultado };
}

// ============================================================
// FASE 2 - METAS POR USUARIO + RENDIMIENTO POR PUNTOS
// Hoja METAS_USUARIO (editable): Vendedor | Meta puntos | Meta llamadas | Meta WhatsApp | Meta visitas
// El cockpit pasa a medir PUNTOS (no clientes únicos) - decisión C3.
// ============================================================
const METAS_HEADERS = ['Vendedor (correo)', 'Meta puntos', 'Meta llamadas', 'Meta WhatsApp', 'Meta visitas'];

// Crea METAS_USUARIO si no existe, con una fila por vendedor activo (no Admin).
// Semilla: Meta puntos = meta_diaria_clientes existente (USUARIOS_AJUSTES col H). Resto en 0 (sin meta).
function obtenerHojaMetasUsuario() {
  const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
  let h = ss.getSheetByName('METAS_USUARIO');
  if (!h) {
    h = ss.insertSheet('METAS_USUARIO');
    h.appendRow(METAS_HEADERS);
    h.setFrozenRows(1);
    h.getRange(1, 1, 1, METAS_HEADERS.length).setFontWeight('bold');
    h.setColumnWidth(1, 260);
    const hojaAjustes = ss.getSheetByName('USUARIOS_AJUSTES');
    if (hojaAjustes) {
      const datos = hojaAjustes.getDataRange().getDisplayValues();
      for (let i = 1; i < datos.length; i++) {
        let rol = String(datos[i][1]).trim();
        let estado = String(datos[i][3]).trim();
        if (estado !== 'Activo' || rol === 'Admin') continue;
        let email = String(datos[i][0]).trim().toLowerCase();
        if (!email) continue;
        let metaPuntos = parseInt(String(datos[i][7] || '').trim(), 10);
        if (isNaN(metaPuntos) || metaPuntos <= 0) metaPuntos = 10;
        h.appendRow([email, metaPuntos, 0, 0, 0]);
      }
    }
  }
  return h;
}

// Devuelve un mapa email -> {puntos, llamadas, whatsapp, visitas}
function obtenerTodasLasMetas() {
  const h = obtenerHojaMetasUsuario();
  const data = h.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    let email = String(data[i][0]).trim().toLowerCase();
    if (!email) continue;
    map[email] = {
      puntos: parseFloat(data[i][1]) || 0,
      llamadas: parseFloat(data[i][2]) || 0,
      whatsapp: parseFloat(data[i][3]) || 0,
      visitas: parseFloat(data[i][4]) || 0
    };
  }
  return map;
}

function obtenerMetasUsuario(email) {
  const map = obtenerTodasLasMetas();
  const e = String(email || '').trim().toLowerCase();
  return map[e] || { puntos: 10, llamadas: 0, whatsapp: 0, visitas: 0 };
}

// Lista de vendedores activos con su alias y sus 4 metas (para el editor del admin).
function obtenerMetasEquipo() {
  try {
    obtenerHojaMetasUsuario(); // asegura que exista con semilla
    const map = obtenerTodasLasMetas();
    const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
    const hojaAjustes = ss.getSheetByName('USUARIOS_AJUSTES');
    const lista = [];
    if (hojaAjustes) {
      const datos = hojaAjustes.getDataRange().getDisplayValues();
      for (let i = 1; i < datos.length; i++) {
        let rol = String(datos[i][1]).trim();
        let estado = String(datos[i][3]).trim();
        if (estado !== 'Activo' || rol === 'Admin') continue;
        let email = String(datos[i][0]).trim().toLowerCase();
        if (!email) continue;
        let alias = String(datos[i][4]).trim() || email.split('@')[0];
        let m = map[email] || { puntos: 10, llamadas: 0, whatsapp: 0, visitas: 0 };
        lista.push({ email: email, alias: alias, puntos: m.puntos, llamadas: m.llamadas, whatsapp: m.whatsapp, visitas: m.visitas });
      }
    }
    return { exito: true, asesores: lista };
  } catch (e) {
    return { exito: false, mensaje: e.message, asesores: [] };
  }
}

// Guarda/actualiza las 4 metas de un vendedor en METAS_USUARIO (solo admin desde el modal).
function guardarMetasUsuario(d) {
  try {
    const email = String(d.email || '').trim().toLowerCase();
    if (!email) return { exito: false, mensaje: 'Falta el correo del vendedor.' };
    const h = obtenerHojaMetasUsuario();
    const data = h.getDataRange().getValues();
    const fila = [
      email,
      _numMeta(d.puntos, 30),
      _numMeta(d.llamadas, 0),
      _numMeta(d.whatsapp, 0),
      _numMeta(d.visitas, 0)
    ];
    let encontrado = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === email) { encontrado = i + 1; break; }
    }
    if (encontrado > 0) {
      h.getRange(encontrado, 1, 1, 5).setValues([fila]);
    } else {
      h.appendRow(fila);
    }
    return { exito: true, metas: { puntos: fila[1], llamadas: fila[2], whatsapp: fila[3], visitas: fila[4] } };
  } catch (e) {
    return { exito: false, mensaje: e.message };
  }
}

function _numMeta(v, def) {
  let n = parseFloat(String(v).replace(',', '.'));
  if (isNaN(n) || n < 0) return def;
  return n;
}

// Ajuste masivo de la Meta puntos para todos los vendedores (admin).
function ajustarMetaPuntosTodos(valor) {
  try {
    const v = _numMeta(valor, 30);
    obtenerHojaMetasUsuario();
    const eq = obtenerMetasEquipo();
    eq.asesores.forEach(function(a) {
      guardarMetasUsuario({ email: a.email, puntos: v, llamadas: a.llamadas, whatsapp: a.whatsapp, visitas: a.visitas });
    });
    return { exito: true, valor: v, vendedores: eq.asesores.length };
  } catch (e) {
    return { exito: false, mensaje: e.message };
  }
}

// Convierte una celda de fecha de VISITAS a Date (solo día, zona El Salvador).
function _fechaVisitaADate(fVal) {
  let ds = (fVal instanceof Date)
    ? Utilities.formatDate(fVal, "GMT-6", "dd/MM/yyyy")
    : String(fVal).trim().substring(0, 10);
  let p = ds.split('/');
  if (p.length < 3) return null;
  let d = parseInt(p[0], 10), m = parseInt(p[1], 10), y = parseInt(p[2], 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  return new Date(y, m - 1, d);
}

function _refContexto(fechaStrOpcional) {
  let ref;
  if (fechaStrOpcional && /^\d{2}\/\d{2}\/\d{4}$/.test(fechaStrOpcional)) {
    let p = fechaStrOpcional.split('/');
    ref = new Date(parseInt(p[2],10), parseInt(p[1],10) - 1, parseInt(p[0],10));
  } else {
    let hoy = Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy").split('/');
    ref = new Date(parseInt(hoy[2],10), parseInt(hoy[1],10) - 1, parseInt(hoy[0],10));
  }
  let dow = ref.getDay(); // 0=Dom..6=Sab
  let offset = (dow === 0) ? 6 : (dow - 1); // semana inicia lunes
  let weekStart = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - offset);
  let weekEnd = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - offset + 6);
  let monthStart = new Date(ref.getFullYear(), ref.getMonth(), 1);
  let monthEnd = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { ref: ref, weekStart: weekStart, weekEnd: weekEnd, monthStart: monthStart, monthEnd: monthEnd };
}

function _bucketVacio() { return { puntos: 0, llamadas: 0, whatsapp: 0, visitas: 0 }; }

function _acumular(bucket, tipo, puntos) {
  bucket.puntos += puntos;
  if (tipo === 'Llamada Telefónica') bucket.llamadas++;
  else if (tipo === 'Contacto WhatsApp') bucket.whatsapp++;
  else if (tipo === 'Visita en Persona') bucket.visitas++;
}

// Rendimiento de un vendedor: hoy / semana / mes (4 indicadores) + sus metas.
function obtenerRendimientoUsuario(emailUsuario, fechaStrOpcional) {
  try {
    const email = String(emailUsuario || '').trim().toLowerCase();
    if (!email) return { exito: false, mensaje: 'Email vacío' };
    const ctx = _refContexto(fechaStrOpcional);
    const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
    const h = ss.getSheetByName('VISITAS');
    const hoy = _bucketVacio(), semana = _bucketVacio(), mes = _bucketVacio();
    if (h && h.getLastRow() > 1) {
      const data = h.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][1]).trim().toLowerCase() !== email) continue;
        const rd = _fechaVisitaADate(data[i][0]);
        if (!rd) continue;
        const tipo = String(data[i][4] || '').trim();
        const pts = parseFloat(data[i][8]) || 0;
        const t = rd.getTime();
        if (t === ctx.ref.getTime()) _acumular(hoy, tipo, pts);
        if (t >= ctx.weekStart.getTime() && t <= ctx.weekEnd.getTime()) _acumular(semana, tipo, pts);
        if (t >= ctx.monthStart.getTime() && t <= ctx.monthEnd.getTime()) _acumular(mes, tipo, pts);
      }
    }
    [hoy, semana, mes].forEach(function(b){ b.puntos = Math.round(b.puntos * 100) / 100; });
    return { exito: true, hoy: hoy, semana: semana, mes: mes, metas: obtenerMetasUsuario(email) };
  } catch (e) {
    return { exito: false, mensaje: e.message };
  }
}

// Rendimiento consolidado del equipo (para gerencia): por vendedor hoy + metas.
function obtenerRendimientoEquipo(fechaStrOpcional) {
  try {
    const ctx = _refContexto(fechaStrOpcional);
    const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
    const hojaAjustes = ss.getSheetByName('USUARIOS_AJUSTES');
    const metasMap = obtenerTodasLasMetas();
    const asesores = {};
    const orden = [];
    if (hojaAjustes) {
      const datos = hojaAjustes.getDataRange().getDisplayValues();
      for (let i = 1; i < datos.length; i++) {
        let rol = String(datos[i][1]).trim();
        let estado = String(datos[i][3]).trim();
        if (estado !== 'Activo' || rol === 'Admin') continue;
        let email = String(datos[i][0]).trim().toLowerCase();
        if (!email) continue;
        let alias = String(datos[i][4]).trim() || email.split('@')[0];
        asesores[email] = { email: email, alias: alias, metas: metasMap[email] || { puntos: 10, llamadas: 0, whatsapp: 0, visitas: 0 }, hoy: _bucketVacio() };
        orden.push(email);
      }
    }
    const h = ss.getSheetByName('VISITAS');
    if (h && h.getLastRow() > 1) {
      const data = h.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        let email = String(data[i][1]).trim().toLowerCase();
        if (!asesores[email]) continue;
        const rd = _fechaVisitaADate(data[i][0]);
        if (!rd || rd.getTime() !== ctx.ref.getTime()) continue;
        _acumular(asesores[email].hoy, String(data[i][4] || '').trim(), parseFloat(data[i][8]) || 0);
      }
    }
    const lista = orden.map(function(em){ const a = asesores[em]; a.hoy.puntos = Math.round(a.hoy.puntos * 100) / 100; return a; });
    lista.sort(function(a, b){
      let pa = a.metas.puntos > 0 ? a.hoy.puntos / a.metas.puntos : a.hoy.puntos;
      let pb = b.metas.puntos > 0 ? b.hoy.puntos / b.metas.puntos : b.hoy.puntos;
      if (pa !== pb) return pb - pa;
      return a.alias.localeCompare(b.alias);
    });
    return { exito: true, asesores: lista, hoyStr: Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy") };
  } catch (e) {
    return { exito: false, mensaje: e.message, asesores: [] };
  }
}

// Setup de la Fase 2: crea METAS_USUARIO con la semilla. Correr UNA vez (admin).
function inicializarFase2() {
  obtenerHojaMetasUsuario();
  return { exito: true };
}

// Desglose de los puntos de UN vendedor en UN día: resumen por resultado + detalle cronológico.
// Para el drill-down del admin (clic en un vendedor del panel de rendimiento).
function obtenerDesglosePuntosDia(email, fechaStrOpcional) {
  try {
    const em = String(email || '').trim().toLowerCase();
    if (!em) return { exito: false, mensaje: 'Email vacío' };
    const fecha = fechaStrOpcional || Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy");
    const alias = getAliasMap();
    const metas = obtenerMetasUsuario(em);
    const ctx = _refContexto(fecha);
    const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
    const h = ss.getSheetByName('VISITAS');
    const filas = [], porResultado = {};
    let total = 0, ptsSemana = 0, ptsMes = 0;
    if (h && h.getLastRow() > 1) {
      const data = h.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][1] || '').trim().toLowerCase() !== em) continue;
        let fVal = data[i][0];
        let fStr = (fVal instanceof Date) ? Utilities.formatDate(fVal, "GMT-6", "dd/MM/yyyy HH:mm") : String(fVal).trim();
        let pts = parseFloat(data[i][8]); if (isNaN(pts)) pts = 0;
        // Acumulados de semana y mes (respecto a la fecha seleccionada).
        let rd = _fechaVisitaADate(fVal);
        if (rd) {
          let t = rd.getTime();
          if (t >= ctx.weekStart.getTime() && t <= ctx.weekEnd.getTime()) ptsSemana += pts;
          if (t >= ctx.monthStart.getTime() && t <= ctx.monthEnd.getTime()) ptsMes += pts;
        }
        if (fStr.substring(0, 10) !== fecha) continue;
        let resultado = String(data[i][7] || '').trim() || '(sin resultado)';
        filas.push({ hora: fStr.substring(11, 16), cod: String(data[i][2] || '').replace(/'/g, ''), cliente: String(data[i][3] || '').trim(), tipo: String(data[i][4] || '').trim(), resultado: resultado, puntos: pts });
        if (!porResultado[resultado]) porResultado[resultado] = { veces: 0, puntosUnit: pts, subtotal: 0 };
        porResultado[resultado].veces++;
        porResultado[resultado].subtotal += pts;
        total += pts;
      }
    }
    filas.sort(function(a, b){ return a.hora.localeCompare(b.hora); });
    const resumen = Object.keys(porResultado).map(function(k){
      return { resultado: k, veces: porResultado[k].veces, puntosCadaUno: porResultado[k].puntosUnit, subtotal: Math.round(porResultado[k].subtotal * 100) / 100 };
    }).sort(function(a, b){ return b.subtotal - a.subtotal; });
    return {
      exito: true,
      alias: alias[em] || em.split('@')[0],
      fecha: fecha,
      metaPuntos: metas.puntos,
      totalInteracciones: filas.length,
      totalPuntos: Math.round(total * 100) / 100,
      puntosSemana: Math.round(ptsSemana * 100) / 100,
      puntosMes: Math.round(ptsMes * 100) / 100,
      resumen: resumen,
      filas: filas
    };
  } catch (e) {
    return { exito: false, mensaje: e.message };
  }
}

// Genera un PDF del desglose de puntos de un vendedor en un rango de fechas (admin).
function generarDesglosePuntosPDF(email, iniYYYYMMDD, finYYYYMMDD) {
  try {
    const em = String(email || '').trim().toLowerCase();
    if (!em) return { exito: false, mensaje: 'Vendedor vacío.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iniYYYYMMDD) || !/^\d{4}-\d{2}-\d{2}$/.test(finYYYYMMDD)) {
      return { exito: false, mensaje: 'Fechas inválidas (use el selector).' };
    }
    const ini = new Date(iniYYYYMMDD + 'T00:00:00');
    const fin = new Date(finYYYYMMDD + 'T23:59:59');
    if (ini > fin) return { exito: false, mensaje: 'La fecha inicial es posterior a la final.' };
    const iniDay = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate());
    const finDay = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate());

    const alias = getAliasMap();
    const metas = obtenerMetasUsuario(em);
    const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
    const h = ss.getSheetByName('VISITAS');
    const porResultado = {}, porDia = {};
    let total = 0, inter = 0;
    if (h && h.getLastRow() > 1) {
      const data = h.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][1] || '').trim().toLowerCase() !== em) continue;
        const rd = _fechaVisitaADate(data[i][0]);
        if (!rd) continue;
        if (rd.getTime() < iniDay.getTime() || rd.getTime() > finDay.getTime()) continue;
        let pts = parseFloat(data[i][8]); if (isNaN(pts)) pts = 0;
        let resultado = String(data[i][7] || '').trim() || '(sin resultado)';
        let diaStr = Utilities.formatDate(rd, "GMT-6", "dd/MM/yyyy");
        if (!porResultado[resultado]) porResultado[resultado] = { veces: 0, unit: pts, sub: 0 };
        porResultado[resultado].veces++; porResultado[resultado].sub += pts;
        if (!porDia[diaStr]) porDia[diaStr] = { pts: 0, inter: 0, orden: rd.getTime() };
        porDia[diaStr].pts += pts; porDia[diaStr].inter++;
        total += pts; inter++;
      }
    }
    if (inter === 0) return { exito: false, mensaje: 'No hay interacciones de ese vendedor en el rango.' };

    const nombre = alias[em] || em.split('@')[0];
    const rangoTxt = formatearDDMMYYYY(ini) + ' al ' + formatearDDMMYYYY(fin);
    const resArr = Object.keys(porResultado).map(function(k){ return { r: k, v: porResultado[k].veces, u: porResultado[k].unit, s: Math.round(porResultado[k].sub * 100) / 100 }; }).sort(function(a, b){ return b.s - a.s; });
    const diasArr = Object.keys(porDia).map(function(k){ return { dia: k, pts: Math.round(porDia[k].pts * 100) / 100, inter: porDia[k].inter, orden: porDia[k].orden }; }).sort(function(a, b){ return a.orden - b.orden; });
    const diasActivos = diasArr.length;
    const promedio = diasActivos > 0 ? Math.round((total / diasActivos) * 10) / 10 : 0;

    const filasRes = resArr.map(function(x){ return '<tr><td>' + x.r + '</td><td style="text-align:center;">' + x.v + '</td><td style="text-align:center;color:#94a3b8;">' + x.u + '</td><td style="text-align:right;font-weight:900;">' + x.s + '</td></tr>'; }).join('');
    const filasDia = diasArr.map(function(x){ return '<tr><td>' + x.dia + '</td><td style="text-align:center;">' + x.inter + '</td><td style="text-align:right;font-weight:900;color:#1d4ed8;">' + x.pts + '</td></tr>'; }).join('');

    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
      + '@page { margin: 18mm 14mm; } body{font-family:Arial,sans-serif;color:#0f172a;}'
      + 'h1{font-size:22px;margin:0 0 2px 0;} .sub{color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin-bottom:18px;}'
      + '.kpis{display:flex;gap:10px;margin-bottom:20px;} .kpi{background:#0f172a;color:#fff;border-radius:14px;padding:12px 16px;flex:1;text-align:center;}'
      + '.kpi b{font-size:22px;display:block;} .kpi span{font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8;}'
      + 'h3{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#475569;margin:18px 0 6px;}'
      + 'table{width:100%;border-collapse:collapse;font-size:11px;} th{background:#1e293b;color:#fff;padding:8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;}'
      + 'td{padding:7px 8px;border-bottom:1px solid #e2e8f0;} .footer{margin-top:20px;font-size:9px;color:#94a3b8;text-align:center;text-transform:uppercase;letter-spacing:2px;}'
      + '</style></head><body>'
      + '<h1>Desglose de Puntos</h1>'
      + '<p class="sub">CRM CDES &middot; ' + nombre + ' &middot; ' + rangoTxt + '</p>'
      + '<div class="kpis">'
      + '<div class="kpi"><b>' + (Math.round(total * 100) / 100) + '</b><span>Puntos totales</span></div>'
      + '<div class="kpi"><b>' + inter + '</b><span>Interacciones</span></div>'
      + '<div class="kpi"><b>' + diasActivos + '</b><span>Días activos</span></div>'
      + '<div class="kpi"><b>' + promedio + '</b><span>Promedio/día</span></div>'
      + '</div>'
      + '<h3>Puntos por resultado</h3>'
      + '<table><thead><tr><th>Resultado</th><th style="text-align:center;">Veces</th><th style="text-align:center;">c/u</th><th style="text-align:right;">Subtotal</th></tr></thead><tbody>' + filasRes
      + '<tr><td style="font-weight:900;">TOTAL</td><td></td><td></td><td style="text-align:right;font-weight:900;background:#eff6ff;color:#1d4ed8;">' + (Math.round(total * 100) / 100) + '</td></tr>'
      + '</tbody></table>'
      + '<h3>Puntos por día</h3>'
      + '<table><thead><tr><th>Día</th><th style="text-align:center;">Interacciones</th><th style="text-align:right;">Puntos</th></tr></thead><tbody>' + filasDia + '</tbody></table>'
      + '<p class="footer">Generado el ' + Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy HH:mm") + ' &middot; Meta diaria ' + metas.puntos + ' pts &middot; CRM CDES</p>'
      + '</body></html>';

    const pdf = Utilities.newBlob(html, 'text/html', 'desglose.html').getAs('application/pdf');
    const nombreArch = 'Puntos ' + nombre + ' ' + iniYYYYMMDD + ' al ' + finYYYYMMDD + '.pdf';
    pdf.setName(nombreArch);
    const carpeta = obtenerCarpetaInformes();
    const archivo = carpeta.createFile(pdf);
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { exito: true, url: archivo.getUrl(), nombre: nombreArch, totalPuntos: Math.round(total * 100) / 100, interacciones: inter };
  } catch (e) {
    return { exito: false, mensaje: e.message };
  }
}

function doGet(e) {
  let html = HtmlService.createTemplateFromFile('Index').evaluate();
  html.setTitle('CRM Ventas CDES');
  html.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  html.addMetaTag('viewport', 'width=device-width, initial-scale=1');
  return html;
}

// Tiempo desde la última interacción (de cualquier fecha) de un vendedor.
function obtenerUltimaInteraccion(emailUsuario) {
  try {
    const email = String(emailUsuario || '').trim().toLowerCase();
    if (!email) return { exito: false, minutos: null };
    const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
    const h = ss.getSheetByName('VISITAS');
    if (!h || h.getLastRow() <= 1) return { exito: true, minutos: null };
    const data = h.getDataRange().getValues();
    let ultima = null;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).trim().toLowerCase() !== email) continue;
      let fVal = data[i][0];
      let d = null;
      if (fVal instanceof Date) {
        d = fVal;
      } else {
        let s = String(fVal).trim();
        if (s.length < 16) continue;
        let dd = parseInt(s.substring(0, 2), 10), mm = parseInt(s.substring(3, 5), 10), yy = parseInt(s.substring(6, 10), 10);
        let hh = parseInt(s.substring(11, 13), 10), mi = parseInt(s.substring(14, 16), 10);
        if (isNaN(dd) || isNaN(hh)) continue;
        d = new Date(yy, mm - 1, dd, hh, mi);
      }
      if (d && (!ultima || d.getTime() > ultima.getTime())) ultima = d;
    }
    if (!ultima) return { exito: true, minutos: null };
    const minutos = Math.max(0, Math.floor((new Date().getTime() - ultima.getTime()) / 60000));
    return { exito: true, minutos: minutos, fecha: Utilities.formatDate(ultima, "GMT-6", "dd/MM/yyyy HH:mm") };
  } catch (e) {
    return { exito: false, minutos: null, mensaje: e.message };
  }
}

function getAliasMap() {
  const hojaAjustes = SpreadsheetApp.openById(SHEET_ID_CRM).getSheetByName('USUARIOS_AJUSTES');
  let map = {};
  if (hojaAjustes) {
      let data = hojaAjustes.getDataRange().getDisplayValues();
      for(let i = 1; i < data.length; i++) {
          let email = String(data[i][0]).trim().toLowerCase();
          let alias = String(data[i][4]).trim(); 
          if(alias) map[email] = alias;
      }
  }
  return map;
}

function verificarAccesoUsuario(emailLogin, pinLogin) {
  try {
    const hojaAjustes = SpreadsheetApp.openById(SHEET_ID_CRM).getSheetByName('USUARIOS_AJUSTES');
    if (!hojaAjustes) return { exito: false, mensaje: "No se encontró la pestaña USUARIOS_AJUSTES." };

    const datosUsuarios = hojaAjustes.getDataRange().getDisplayValues();
    
    for (let i = 1; i < datosUsuarios.length; i++) {
      let emailBD = String(datosUsuarios[i][0]).trim().toLowerCase();
      let rolBD = String(datosUsuarios[i][1]).trim();
      let estadoBD = String(datosUsuarios[i][3]).trim();
      let aliasBD = String(datosUsuarios[i][4]).trim();
      let pinBD = String(datosUsuarios[i][5] || "").trim();
      let metaBD = parseInt(String(datosUsuarios[i][7] || "").trim(), 10);
      if (isNaN(metaBD) || metaBD <= 0) metaBD = 10;

      if (emailBD === String(emailLogin).trim().toLowerCase()) {
        if (pinBD !== String(pinLogin).trim()) return { exito: false, mensaje: "PIN de acceso incorrecto." };
        if (estadoBD !== 'Activo') return { exito: false, mensaje: "Usuario inactivo en el sistema." };

        let fechaAhora = Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy HH:mm:ss");
        hojaAjustes.getRange(i + 1, 7).setValue(fechaAhora);

        // C3: la meta del cockpit es de PUNTOS (METAS_USUARIO), no de clientes.
        let metaPuntos = obtenerMetasUsuario(emailBD).puntos;
        if (!(metaPuntos > 0)) metaPuntos = 10;
        return { exito: true, email: emailBD, rol: rolBD, alias: aliasBD || emailBD.split('@')[0], metaDiaria: metaPuntos };
      }
    }
    return { exito: false, mensaje: "El correo no está registrado en el sistema." };
  } catch(e) {
    return { exito: false, mensaje: "Error de conexión a la BD: " + e.message };
  }
}

function obtenerCockpitDiario(emailUsuario, fechaStrOpcional) {
  try {
    const email = String(emailUsuario || "").trim().toLowerCase();
    if (!email) return { exito: false, mensaje: "Email vacío", meta: 10, atendidos: 0, clientesAtendidos: 0 };

    // C3: el cockpit mide PUNTOS. Meta = Meta puntos de METAS_USUARIO.
    const metas = obtenerMetasUsuario(email);
    const meta = metas.puntos > 0 ? metas.puntos : 10;
    const atendidos = contarPuntosHoy(email, fechaStrOpcional);
    const clientesAtendidos = contarClientesAtendidosHoy(email, fechaStrOpcional);
    return { exito: true, meta: meta, atendidos: atendidos, clientesAtendidos: clientesAtendidos };
  } catch (e) {
    return { exito: false, mensaje: e.message, meta: 10, atendidos: 0, clientesAtendidos: 0 };
  }
}

// Clientes UNICOS atendidos hoy con interaccion positiva (excluye sin contacto,
// sin respuesta, y bonus por correccion de telefono).
function contarClientesAtendidosHoy(emailFiltro, fechaStrOpcional) {
  const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
  const h = ss.getSheetByName('VISITAS');
  if (!h || h.getLastRow() <= 1) return 0;
  const fechaObjetivo = fechaStrOpcional || Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy");
  const data = h.getDataRange().getValues();
  const emailLower = emailFiltro ? String(emailFiltro).trim().toLowerCase() : null;
  const EXCLUIDOS = {
    'No se obtuvo contacto': true,
    'Mensaje enviado sin respuesta': true,
    'Corrección de teléfono': true
  };
  const codigos = {};
  for (let i = 1; i < data.length; i++) {
    let fVal = data[i][0];
    let fStr = (fVal instanceof Date)
      ? Utilities.formatDate(fVal, "GMT-6", "dd/MM/yyyy")
      : String(fVal).trim().substring(0, 10);
    if (fStr !== fechaObjetivo) continue;
    if (emailLower && String(data[i][1]).trim().toLowerCase() !== emailLower) continue;
    let resultado = String(data[i][7] || '').trim();
    if (EXCLUIDOS[resultado]) continue;
    let cod = String(data[i][2]).trim().replace(/'/g, "");
    if (cod) codigos[cod] = true;
  }
  return Object.keys(codigos).length;
}

function contarClientesUnicosHoy(emailFiltro, fechaStrOpcional) {
  const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
  const hojaVisitas = ss.getSheetByName('VISITAS');
  if (!hojaVisitas || hojaVisitas.getLastRow() <= 1) return 0;

  const fechaObjetivo = fechaStrOpcional || Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy");
  const vData = hojaVisitas.getDataRange().getValues();
  const emailLower = emailFiltro ? String(emailFiltro).trim().toLowerCase() : null;
  const codigosUnicos = {};

  for (let i = 1; i < vData.length; i++) {
    let fVal = vData[i][0];
    let fStr = (fVal instanceof Date)
      ? Utilities.formatDate(fVal, "GMT-6", "dd/MM/yyyy")
      : String(fVal).trim().substring(0, 10);
    if (fStr !== fechaObjetivo) continue;

    if (emailLower) {
      let emailFila = String(vData[i][1]).trim().toLowerCase();
      if (emailFila !== emailLower) continue;
    }

    let cod = String(vData[i][2]).trim().replace(/'/g, "");
    if (cod) codigosUnicos[cod] = true;
  }

  return Object.keys(codigosUnicos).length;
}

function obtenerCockpitsEquipo(fechaStrOpcional) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
    const hojaAjustes = ss.getSheetByName('USUARIOS_AJUSTES');
    if (!hojaAjustes) return { exito: false, mensaje: "No se encontró USUARIOS_AJUSTES", asesores: [] };

    // C3: ranking del equipo por PUNTOS del día contra la Meta puntos de cada quien.
    const metasMap = obtenerTodasLasMetas();
    const datosUsr = hojaAjustes.getDataRange().getDisplayValues();
    const asesores = [];
    const idx = {};
    for (let i = 1; i < datosUsr.length; i++) {
      let rol = String(datosUsr[i][1]).trim();
      let estado = String(datosUsr[i][3]).trim();
      if (estado !== 'Activo') continue;
      if (rol === 'Admin') continue;
      let email = String(datosUsr[i][0]).trim().toLowerCase();
      let alias = String(datosUsr[i][4]).trim() || email.split('@')[0];
      let meta = (metasMap[email] && metasMap[email].puntos > 0) ? metasMap[email].puntos : 10;
      idx[email] = asesores.length;
      asesores.push({ email: email, alias: alias, meta: meta, atendidos: 0 });
    }

    const fechaObjetivo = fechaStrOpcional || Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy");
    const hojaVisitas = ss.getSheetByName('VISITAS');
    if (hojaVisitas && hojaVisitas.getLastRow() > 1) {
      const vData = hojaVisitas.getDataRange().getValues();
      for (let i = 1; i < vData.length; i++) {
        let fVal = vData[i][0];
        let fStr = (fVal instanceof Date)
          ? Utilities.formatDate(fVal, "GMT-6", "dd/MM/yyyy")
          : String(fVal).trim().substring(0, 10);
        if (fStr !== fechaObjetivo) continue;
        let emailFila = String(vData[i][1]).trim().toLowerCase();
        if (idx[emailFila] === undefined) continue;
        let p = parseFloat(vData[i][8]);
        if (!isNaN(p)) asesores[idx[emailFila]].atendidos += p;
      }
      asesores.forEach(function(a){ a.atendidos = Math.round(a.atendidos * 100) / 100; });
    }

    asesores.sort(function(a, b) {
      let pa = a.atendidos / a.meta;
      let pb = b.atendidos / b.meta;
      if (pa !== pb) return pb - pa;
      return a.alias.localeCompare(b.alias);
    });

    return { exito: true, asesores: asesores, hoyStr: fechaObjetivo };
  } catch (e) {
    return { exito: false, mensaje: e.message, asesores: [] };
  }
}

function obtenerCockpitAgregado(fechaStrOpcional) {
  try {
    // C3: meta del equipo = suma de Meta puntos; realizado = suma de puntos del día.
    const metasMap = obtenerTodasLasMetas();
    let metaTotal = 0;
    Object.keys(metasMap).forEach(function(em){ metaTotal += (metasMap[em].puntos > 0 ? metasMap[em].puntos : 10); });
    const atendidos = contarPuntosHoy(null, fechaStrOpcional);
    return { exito: true, meta: metaTotal || 10, atendidos: atendidos };
  } catch (e) {
    return { exito: false, mensaje: e.message, meta: 10, atendidos: 0 };
  }
}

function obtenerTimelineUsuario(emailUsuario, fechaStrOpcional) {
  try {
    const email = String(emailUsuario || "").trim().toLowerCase();
    if (!email) return { exito: false, mensaje: "Email vacío", visitas: [] };

    const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
    const hojaVisitas = ss.getSheetByName('VISITAS');
    const hoyStr = Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy");
    const fechaObjetivo = fechaStrOpcional || hoyStr;
    const esHoy = fechaObjetivo === hoyStr;

    if (!hojaVisitas || hojaVisitas.getLastRow() <= 1) {
      return { exito: true, visitas: [], total: 0, porFranja: { manana: 0, mediodia: 0, tarde: 0, ultimaHora: 0 }, ultimaInteraccionMin: null, fecha: fechaObjetivo, esHoy: esHoy };
    }

    const ahora = new Date();
    const minutoAhora = ahora.getHours() * 60 + ahora.getMinutes();
    const vData = hojaVisitas.getDataRange().getValues();

    const visitas = [];
    let codigosUnicos = {};
    for (let i = 1; i < vData.length; i++) {
      let fVal = vData[i][0];
      let fStr = (fVal instanceof Date)
        ? Utilities.formatDate(fVal, "GMT-6", "dd/MM/yyyy HH:mm")
        : String(fVal).trim();
      if (fStr.substring(0, 10) !== fechaObjetivo) continue;

      let emailFila = String(vData[i][1]).trim().toLowerCase();
      if (emailFila !== email) continue;

      let hora = fStr.substring(11, 16);
      let cod = String(vData[i][2]).trim().replace(/'/g, "");
      let tipo = String(vData[i][4]).trim();
      visitas.push({ hora: hora, cod: cod, tipo: tipo });
      if (cod) codigosUnicos[cod] = true;
    }

    visitas.sort(function(a, b) { return a.hora.localeCompare(b.hora); });

    let manana = 0, mediodia = 0, tarde = 0, ultimaHora = 0;
    visitas.forEach(function(v) {
      let h = parseInt(v.hora.substring(0, 2), 10);
      let m = parseInt(v.hora.substring(3, 5), 10);
      let minutos = h * 60 + m;
      if (h < 12) manana++;
      else if (h < 14) mediodia++;
      else tarde++;
      if (esHoy && minutoAhora - minutos <= 60) ultimaHora++;
    });

    let ultimaInteraccionMin = null;
    if (esHoy && visitas.length > 0) {
      let ult = visitas[visitas.length - 1].hora;
      let h = parseInt(ult.substring(0, 2), 10);
      let m = parseInt(ult.substring(3, 5), 10);
      ultimaInteraccionMin = Math.max(0, minutoAhora - (h * 60 + m));
    }

    return {
      exito: true,
      visitas: visitas,
      total: Object.keys(codigosUnicos).length,
      porFranja: { manana: manana, mediodia: mediodia, tarde: tarde, ultimaHora: ultimaHora },
      ultimaInteraccionMin: ultimaInteraccionMin,
      fecha: fechaObjetivo,
      esHoy: esHoy
    };
  } catch (e) {
    return { exito: false, mensaje: e.message, visitas: [] };
  }
}

function obtenerTimelinesEquipo(fechaStrOpcional) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
    const hojaAjustes = ss.getSheetByName('USUARIOS_AJUSTES');
    if (!hojaAjustes) return { exito: false, mensaje: "No se encontró USUARIOS_AJUSTES", asesores: [] };

    const datosUsr = hojaAjustes.getDataRange().getDisplayValues();
    const asesoresMap = {};
    const asesoresOrden = [];
    for (let i = 1; i < datosUsr.length; i++) {
      let rol = String(datosUsr[i][1]).trim();
      let estado = String(datosUsr[i][3]).trim();
      if (estado !== 'Activo' || rol === 'Admin') continue;
      let email = String(datosUsr[i][0]).trim().toLowerCase();
      let alias = String(datosUsr[i][4]).trim() || email.split('@')[0];
      let meta = parseInt(String(datosUsr[i][7] || "").trim(), 10);
      if (isNaN(meta) || meta <= 0) meta = 10;
      asesoresMap[email] = { email: email, alias: alias, meta: meta, visitas: [], total: 0, codigosUnicos: {} };
      asesoresOrden.push(email);
    }

    const fechaObjetivo = fechaStrOpcional || Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy");
    const hojaVisitas = ss.getSheetByName('VISITAS');
    if (hojaVisitas && hojaVisitas.getLastRow() > 1) {
      const vData = hojaVisitas.getDataRange().getValues();
      for (let i = 1; i < vData.length; i++) {
        let fVal = vData[i][0];
        let fStr = (fVal instanceof Date)
          ? Utilities.formatDate(fVal, "GMT-6", "dd/MM/yyyy HH:mm")
          : String(fVal).trim();
        if (fStr.substring(0, 10) !== fechaObjetivo) continue;

        let emailFila = String(vData[i][1]).trim().toLowerCase();
        if (!asesoresMap[emailFila]) continue;

        let hora = fStr.substring(11, 16);
        let cod = String(vData[i][2]).trim().replace(/'/g, "");
        asesoresMap[emailFila].visitas.push(hora);
        if (cod) asesoresMap[emailFila].codigosUnicos[cod] = true;
      }
    }

    const asesores = asesoresOrden.map(function(email) {
      const a = asesoresMap[email];
      a.visitas.sort();
      a.total = Object.keys(a.codigosUnicos).length;
      delete a.codigosUnicos;
      return a;
    });

    return { exito: true, asesores: asesores, hoyStr: fechaObjetivo };
  } catch (e) {
    return { exito: false, mensaje: e.message, asesores: [] };
  }
}

function generarInformeRangoPDF(fechaIniYYYYMMDD, fechaFinYYYYMMDD, vendedorEmailOpcional) {
  try {
    if (!fechaIniYYYYMMDD || !/^\d{4}-\d{2}-\d{2}$/.test(fechaIniYYYYMMDD)) {
      return { exito: false, mensaje: "Fecha inicial inválida. Formato esperado: YYYY-MM-DD" };
    }
    if (!fechaFinYYYYMMDD || !/^\d{4}-\d{2}-\d{2}$/.test(fechaFinYYYYMMDD)) {
      return { exito: false, mensaje: "Fecha final inválida. Formato esperado: YYYY-MM-DD" };
    }
    const ini = new Date(fechaIniYYYYMMDD + 'T00:00:00');
    const fin = new Date(fechaFinYYYYMMDD + 'T23:59:59');
    if (ini > fin) return { exito: false, mensaje: "La fecha inicial es posterior a la final." };

    const vendedorFiltro = vendedorEmailOpcional ? String(vendedorEmailOpcional).trim().toLowerCase() : null;
    const ddmmIni = formatearDDMMYYYY(ini);
    const ddmmFin = formatearDDMMYYYY(fin);

    const datos = procesarVisitasRango(ini, fin, vendedorFiltro);
    if (datos.totalGeneral === 0) {
      return { exito: false, mensaje: "No hay interacciones en ese rango de fechas." };
    }

    const aliasMap = getAliasMap();
    const tituloMes = ddmmIni + ' al ' + ddmmFin;
    const html = construirHtmlInforme(tituloMes, datos.filas, datos.porVendedor, datos.tiposCanon, datos.tiposCortos, datos.totalGeneral, vendedorFiltro, datos.detallePorVendedor);
    const pdfBlob = Utilities.newBlob(html, 'text/html', 'informe.html').getAs('application/pdf');
    const nombreArchivo = 'Informe CRM ' + fechaIniYYYYMMDD + ' al ' + fechaFinYYYYMMDD + (vendedorFiltro ? ' - ' + (aliasMap[vendedorFiltro] || vendedorFiltro) : ' - Equipo Completo') + '.pdf';
    pdfBlob.setName(nombreArchivo);

    const carpeta = obtenerCarpetaInformes();
    const archivo = carpeta.createFile(pdfBlob);
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return { exito: true, url: archivo.getUrl(), nombre: nombreArchivo, totalInteracciones: datos.totalGeneral };
  } catch (e) {
    return { exito: false, mensaje: e.message };
  }
}

function formatearDDMMYYYY(d) {
  return Utilities.formatDate(d, "GMT-6", "dd/MM/yyyy");
}

function procesarVisitasRango(fechaIni, fechaFin, vendedorFiltro) {
  const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
  const hojaVisitas = ss.getSheetByName('VISITAS');
  if (!hojaVisitas || hojaVisitas.getLastRow() <= 1) {
    return { totalGeneral: 0, filas: [], porVendedor: {}, tiposCanon: [], tiposCortos: {}, detallePorVendedor: {}, diasOrdenados: [] };
  }

  const aliasMap = getAliasMap();
  const vData = hojaVisitas.getDataRange().getValues();
  const tiposCanon = ['Visita en Persona', 'Llamada Telefónica', 'Contacto WhatsApp', 'Vino a Sala de Ventas', 'No se obtuvo respuesta por llamada'];
  const tiposCortos = { 'Visita en Persona': 'Visita', 'Llamada Telefónica': 'Llamada', 'Contacto WhatsApp': 'WhatsApp', 'Vino a Sala de Ventas': 'Sala', 'No se obtuvo respuesta por llamada': 'NoResp' };

  const porVendedor = {};
  const detallePorVendedor = {};
  let totalGeneral = 0;

  for (let i = 1; i < vData.length; i++) {
    let fVal = vData[i][0];
    let fechaFila;
    let horaFila = 12;
    if (fVal instanceof Date) {
      fechaFila = fVal;
      horaFila = fVal.getHours();
    } else {
      const s = String(fVal).trim();
      if (s.length < 10) continue;
      const dd = parseInt(s.substring(0, 2), 10);
      const mm = parseInt(s.substring(3, 5), 10);
      const yyyy = parseInt(s.substring(6, 10), 10);
      fechaFila = new Date(yyyy, mm - 1, dd);
      if (s.length >= 16) horaFila = parseInt(s.substring(11, 13), 10);
    }
    if (fechaFila < fechaIni || fechaFila > fechaFin) continue;

    let emailFila = String(vData[i][1]).trim().toLowerCase();
    if (vendedorFiltro && emailFila !== vendedorFiltro) continue;

    let tipo = String(vData[i][4]).trim();
    let tipoCanon = tiposCanon.indexOf(tipo) >= 0 ? tipo : 'Otros';
    const diaStr = Utilities.formatDate(fechaFila, "GMT-6", "dd/MM/yyyy");

    if (!porVendedor[emailFila]) {
      porVendedor[emailFila] = { alias: aliasMap[emailFila] || emailFila.split('@')[0], total: 0 };
      tiposCanon.forEach(function(t) { porVendedor[emailFila][t] = 0; });
      porVendedor[emailFila]['Otros'] = 0;
      detallePorVendedor[emailFila] = { porDia: {}, diasOrdenados: [] };
    }
    porVendedor[emailFila][tipoCanon] = (porVendedor[emailFila][tipoCanon] || 0) + 1;
    porVendedor[emailFila].total += 1;
    totalGeneral += 1;

    const det = detallePorVendedor[emailFila];
    if (!det.porDia[diaStr]) {
      det.porDia[diaStr] = { total: 0, porTipo: {}, porHora: {} };
      tiposCanon.forEach(function(t) { det.porDia[diaStr].porTipo[t] = 0; });
      det.porDia[diaStr].porTipo['Otros'] = 0;
    }
    det.porDia[diaStr].total += 1;
    det.porDia[diaStr].porTipo[tipoCanon] = (det.porDia[diaStr].porTipo[tipoCanon] || 0) + 1;
    det.porDia[diaStr].porHora[horaFila] = (det.porDia[diaStr].porHora[horaFila] || 0) + 1;
  }

  const diasOrdenados = [];
  let cursor = new Date(fechaIni.getFullYear(), fechaIni.getMonth(), fechaIni.getDate());
  const finDay = new Date(fechaFin.getFullYear(), fechaFin.getMonth(), fechaFin.getDate());
  while (cursor <= finDay) {
    diasOrdenados.push(Utilities.formatDate(cursor, "GMT-6", "dd/MM/yyyy"));
    cursor.setDate(cursor.getDate() + 1);
  }

  Object.keys(detallePorVendedor).forEach(function(email) {
    detallePorVendedor[email].diasOrdenados = diasOrdenados.slice();
  });

  const filas = Object.keys(porVendedor).sort(function(a, b) {
    return porVendedor[b].total - porVendedor[a].total;
  });

  return { totalGeneral: totalGeneral, filas: filas, porVendedor: porVendedor, tiposCanon: tiposCanon, tiposCortos: tiposCortos, detallePorVendedor: detallePorVendedor, diasOrdenados: diasOrdenados };
}

function generarInformeMensualPDF(mesYYYYMM, vendedorEmailOpcional) {
  try {
    if (!mesYYYYMM || !/^\d{4}-\d{2}$/.test(mesYYYYMM)) {
      return { exito: false, mensaje: "Mes inválido. Formato esperado: YYYY-MM" };
    }
    const partes = mesYYYYMM.split('-');
    const anioFiltro = parseInt(partes[0], 10);
    const mesFiltro = parseInt(partes[1], 10);
    const vendedorFiltro = vendedorEmailOpcional ? String(vendedorEmailOpcional).trim().toLowerCase() : null;

    const ini = new Date(anioFiltro, mesFiltro - 1, 1, 0, 0, 0);
    const fin = new Date(anioFiltro, mesFiltro, 0, 23, 59, 59);

    const datos = procesarVisitasRango(ini, fin, vendedorFiltro);
    if (datos.totalGeneral === 0) {
      return { exito: false, mensaje: "No hay interacciones registradas en ese mes." };
    }

    const mesesEs = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const tituloMes = mesesEs[mesFiltro - 1] + ' ' + anioFiltro;
    const aliasMap = getAliasMap();

    const html = construirHtmlInforme(tituloMes, datos.filas, datos.porVendedor, datos.tiposCanon, datos.tiposCortos, datos.totalGeneral, vendedorFiltro, datos.detallePorVendedor);
    const pdfBlob = Utilities.newBlob(html, 'text/html', 'informe.html').getAs('application/pdf');
    const nombreArchivo = 'Informe CRM ' + partes[0] + '-' + partes[1] + (vendedorFiltro ? ' - ' + (aliasMap[vendedorFiltro] || vendedorFiltro) : ' - Equipo Completo') + '.pdf';
    pdfBlob.setName(nombreArchivo);

    const carpeta = obtenerCarpetaInformes();
    const archivo = carpeta.createFile(pdfBlob);
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return { exito: true, url: archivo.getUrl(), nombre: nombreArchivo, totalInteracciones: datos.totalGeneral };
  } catch (e) {
    return { exito: false, mensaje: e.message };
  }
}

function obtenerCarpetaInformes() {
  const nombre = 'Informes CRM CDES';
  const iter = DriveApp.getFoldersByName(nombre);
  if (iter.hasNext()) return iter.next();
  return DriveApp.createFolder(nombre);
}

function construirHtmlInforme(tituloMes, filas, porVendedor, tiposCanon, tiposCortos, totalGeneral, vendedorFiltro, detallePorVendedor) {
  const headersTipos = tiposCanon.map(function(t) { return '<th>' + tiposCortos[t] + '</th>'; }).join('');
  const filasHtml = filas.map(function(email) {
    const v = porVendedor[email];
    const celdas = tiposCanon.map(function(t) {
      const n = v[t] || 0;
      return '<td style="text-align:center;">' + (n > 0 ? n : '<span style="color:#cbd5e1">·</span>') + '</td>';
    }).join('');
    return '<tr>' +
      '<td style="font-weight:700;">' + v.alias + '</td>' +
      celdas +
      '<td style="text-align:center;color:#cbd5e1;">' + (v['Otros'] || 0) + '</td>' +
      '<td style="text-align:center;font-weight:900;background:#eff6ff;color:#1d4ed8;">' + v.total + '</td>' +
    '</tr>';
  }).join('');

  const totalesPorTipo = tiposCanon.map(function(t) {
    let sum = 0;
    filas.forEach(function(email) { sum += porVendedor[email][t] || 0; });
    return '<td style="text-align:center;font-weight:900;background:#f1f5f9;">' + sum + '</td>';
  }).join('');
  let totalOtros = 0;
  filas.forEach(function(email) { totalOtros += porVendedor[email]['Otros'] || 0; });

  const subtitulo = vendedorFiltro
    ? 'Asesor: ' + (porVendedor[vendedorFiltro] ? porVendedor[vendedorFiltro].alias : vendedorFiltro)
    : 'Todos los asesores del equipo';

  const seccionesDetalle = construirSeccionesDetalleVendedor(filas, porVendedor, tiposCanon, tiposCortos, detallePorVendedor);

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    '@page { margin: 18mm 14mm; }' +
    'body{font-family:Arial,sans-serif;color:#0f172a;padding:0;}' +
    'h1{font-size:24px;margin:0 0 4px 0;letter-spacing:-0.5px;}' +
    'h2{font-size:18px;margin:0 0 6px 0;letter-spacing:-0.3px;color:#0f172a;}' +
    'h3{font-size:12px;margin:18px 0 6px 0;text-transform:uppercase;letter-spacing:2px;color:#475569;}' +
    '.subtitulo{color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin-bottom:24px;}' +
    '.kpi{background:#0f172a;color:white;padding:16px;border-radius:16px;display:inline-block;margin-bottom:24px;}' +
    '.kpi b{font-size:28px;display:block;}' +
    '.kpi span{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;}' +
    'table{width:100%;border-collapse:collapse;font-size:11px;margin-top:8px;}' +
    'th{background:#1e293b;color:white;padding:10px 8px;text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:1px;}' +
    'th:first-child{text-align:left;}' +
    'td{padding:8px 6px;border-bottom:1px solid #e2e8f0;font-size:11px;}' +
    'tr.totales td{background:#f8fafc;border-top:2px solid #0f172a;font-weight:900;}' +
    '.footer{margin-top:24px;font-size:9px;color:#94a3b8;text-align:center;text-transform:uppercase;letter-spacing:2px;}' +
    '.page-break{page-break-before:always;}' +
    '.vend-header{background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);color:white;padding:18px 20px;border-radius:14px;margin-bottom:14px;}' +
    '.vend-header h2{color:white;margin:0;}' +
    '.vend-header .sub{color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin-top:4px;}' +
    '.mini-kpis{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;}' +
    '.mini-kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;flex:1;min-width:100px;}' +
    '.mini-kpi b{display:block;font-size:18px;color:#0f172a;}' +
    '.mini-kpi span{font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;}' +
    '.heatmap{width:100%;border-collapse:collapse;font-size:9px;margin-top:6px;}' +
    '.heatmap th{background:#f1f5f9;color:#475569;padding:4px 2px;font-size:8px;font-weight:700;}' +
    '.heatmap th:first-child{text-align:left;padding-left:6px;background:#e2e8f0;}' +
    '.heatmap td{padding:0;border:1px solid white;text-align:center;font-weight:700;font-size:9px;height:18px;}' +
    '.heatmap td.dia{background:#f8fafc;color:#475569;text-align:left;padding-left:6px;font-size:8px;font-weight:700;border-right:2px solid #e2e8f0;}' +
    '.heatmap td.total{background:#0f172a;color:white;font-weight:900;}' +
    '</style></head><body>' +
    '<h1>Informe de Interacciones</h1>' +
    '<p class="subtitulo">CRM CDES &middot; ' + tituloMes + ' &middot; ' + subtitulo + '</p>' +
    '<div class="kpi"><b>' + totalGeneral + '</b><span>Interacciones totales</span></div>' +
    '<h3>Resumen por Asesor</h3>' +
    '<table>' +
      '<thead><tr><th>Asesor</th>' + headersTipos + '<th>Otros</th><th>Total</th></tr></thead>' +
      '<tbody>' + filasHtml + '</tbody>' +
      '<tfoot><tr class="totales"><td>TOTALES</td>' + totalesPorTipo + '<td style="text-align:center;">' + totalOtros + '</td><td style="text-align:center;background:#1e293b;color:white;">' + totalGeneral + '</td></tr></tfoot>' +
    '</table>' +
    '<p class="footer">Generado el ' + Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy HH:mm") + ' &middot; CRM CDES</p>' +
    seccionesDetalle +
    '</body></html>';
}

function construirSeccionesDetalleVendedor(filas, porVendedor, tiposCanon, tiposCortos, detallePorVendedor) {
  if (!detallePorVendedor) return '';

  return filas.map(function(email) {
    const v = porVendedor[email];
    const det = detallePorVendedor[email];
    if (!det) return '';

    const dias = det.diasOrdenados || [];
    const diasActivos = dias.filter(function(d) { return det.porDia[d] && det.porDia[d].total > 0; });
    const cantDiasActivos = diasActivos.length;
    const promedioDiario = cantDiasActivos > 0 ? Math.round((v.total / cantDiasActivos) * 10) / 10 : 0;
    let mejorDia = '-', mejorN = 0;
    diasActivos.forEach(function(d) {
      if (det.porDia[d].total > mejorN) { mejorN = det.porDia[d].total; mejorDia = d; }
    });

    const headersHeatmap = '<th>Día</th>' +
      [8,9,10,11,12,13,14,15,16,17,18].map(function(h) {
        let h12 = h % 12; if (h12 === 0) h12 = 12;
        return '<th>' + h12 + (h < 12 ? 'a' : 'p') + '</th>';
      }).join('') + '<th>Tot</th>';

    const filasHeatmap = dias.map(function(d) {
      const dia = det.porDia[d];
      const total = dia ? dia.total : 0;
      const celdas = [8,9,10,11,12,13,14,15,16,17,18].map(function(h) {
        const n = (dia && dia.porHora && dia.porHora[h]) ? dia.porHora[h] : 0;
        let bg = '#ffffff', col = '#cbd5e1';
        if (n >= 8) { bg = '#1d4ed8'; col = 'white'; }
        else if (n >= 5) { bg = '#3b82f6'; col = 'white'; }
        else if (n >= 3) { bg = '#93c5fd'; col = '#0f172a'; }
        else if (n >= 1) { bg = '#dbeafe'; col = '#1e40af'; }
        return '<td style="background:' + bg + ';color:' + col + ';">' + (n > 0 ? n : '·') + '</td>';
      }).join('');
      const ddmm = d.substring(0, 5);
      return '<tr><td class="dia">' + ddmm + '</td>' + celdas + '<td class="total">' + (total > 0 ? total : '·') + '</td></tr>';
    }).join('');

    const headersTiposCortos = tiposCanon.map(function(t) { return '<th>' + tiposCortos[t] + '</th>'; }).join('');
    const filasDiaPorDia = dias.map(function(d) {
      const dia = det.porDia[d];
      const total = dia ? dia.total : 0;
      const celdasTipos = tiposCanon.map(function(t) {
        const n = (dia && dia.porTipo) ? (dia.porTipo[t] || 0) : 0;
        return '<td style="text-align:center;">' + (n > 0 ? n : '<span style="color:#cbd5e1">·</span>') + '</td>';
      }).join('');
      const ddmm = d.substring(0, 5);
      const colorFila = total === 0 ? 'color:#cbd5e1;' : '';
      return '<tr style="' + colorFila + '">' +
        '<td style="font-weight:700;' + colorFila + '">' + ddmm + '</td>' +
        celdasTipos +
        '<td style="text-align:center;font-weight:900;color:' + (total > 0 ? '#1d4ed8' : '#cbd5e1') + ';background:' + (total > 0 ? '#eff6ff' : 'transparent') + ';">' + total + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="page-break">' +
      '<div class="vend-header">' +
        '<h2>' + v.alias + '</h2>' +
        '<div class="sub">Detalle del período</div>' +
      '</div>' +
      '<div class="mini-kpis">' +
        '<div class="mini-kpi"><b>' + v.total + '</b><span>Total interacciones</span></div>' +
        '<div class="mini-kpi"><b>' + cantDiasActivos + '</b><span>Días activos</span></div>' +
        '<div class="mini-kpi"><b>' + promedioDiario + '</b><span>Promedio/día activo</span></div>' +
        '<div class="mini-kpi"><b>' + mejorN + '</b><span>Mejor día (' + (mejorDia !== '-' ? mejorDia.substring(0, 5) : '-') + ')</span></div>' +
      '</div>' +
      '<h3>Heatmap (días × horas)</h3>' +
      '<table class="heatmap"><thead><tr>' + headersHeatmap + '</tr></thead><tbody>' + filasHeatmap + '</tbody></table>' +
      '<h3>Detalle día por día (por tipo)</h3>' +
      '<table><thead><tr><th>Día</th>' + headersTiposCortos + '<th>Total</th></tr></thead><tbody>' + filasDiaPorDia + '</tbody></table>' +
    '</div>';
  }).join('');
}

function obtenerEstadoUsuarios() {
  try {
    const hojaAjustes = SpreadsheetApp.openById(SHEET_ID_CRM).getSheetByName('USUARIOS_AJUSTES');
    if (!hojaAjustes) return { exito: true, usuarios: [] };
    let data = hojaAjustes.getDataRange().getDisplayValues();
    let usrs = [];
    for(let i = 1; i < data.length; i++) {
      if(data[i][0] && data[i][3] === 'Activo') {
         usrs.push({
            email: String(data[i][0]).trim(),
            alias: String(data[i][4]).trim() || String(data[i][0]).trim().split('@')[0],
            rol: String(data[i][1]).trim(),
            ultimoAcceso: String(data[i][6] || "Nunca").trim()
         });
      }
    }
    return { exito: true, usuarios: usrs };
  } catch(e) { return {exito: false, mensaje: e.message}; }
}

function procesarLoteVentas(lote, esPrimerLote) {
  const hojaVentas = SpreadsheetApp.openById(SHEET_ID_VENTAS).getSheets()[0];
  if (esPrimerLote) {
    const ultimaFila = hojaVentas.getLastRow();
    if (ultimaFila > 1) {
      hojaVentas.getRange(2, 1, ultimaFila - 1, hojaVentas.getMaxColumns()).clearContent();
    }
  }
  if (lote && lote.length > 0) {
    let maxCols = 0;
    lote.forEach(f => { if (f.length > maxCols) maxCols = f.length; });
    let loteProcesado = lote.map(f => {
       while(f.length < maxCols) f.push("");
       return f;
    });
    const filaInicio = esPrimerLote ? 2 : (hojaVentas.getLastRow() + 1);
    hojaVentas.getRange(filaInicio, 1, loteProcesado.length, maxCols).setValues(loteProcesado);
    SpreadsheetApp.flush();
  }
  return { exito: true };
}

function procesarLoteClientes(lote, esPrimerLote) {
  const hojaClientes = SpreadsheetApp.openById(SHEET_ID_CRM).getSheets()[0];
  if (esPrimerLote) {
    const ultimaFila = hojaClientes.getLastRow();
    if (ultimaFila > 1) {
      hojaClientes.getRange(2, 1, ultimaFila - 1, hojaClientes.getMaxColumns()).clearContent();
    }
  }
  if (lote && lote.length > 0) {
    let maxCols = 0;
    lote.forEach(f => { if (f.length > maxCols) maxCols = f.length; });
    let loteProcesado = lote.map(f => {
       while(f.length < maxCols) f.push("");
       return f;
    });
    const filaInicio = esPrimerLote ? 2 : (hojaClientes.getLastRow() + 1);
    hojaClientes.getRange(filaInicio, 1, loteProcesado.length, maxCols).setValues(loteProcesado);
    SpreadsheetApp.flush();
  }
  return { exito: true };
}

function finalizarCargaCSV(tipo) {
  const hojaMeta = SpreadsheetApp.openById(SHEET_ID_CRM).getSheetByName('METADATA_SISTEMA') || SpreadsheetApp.openById(SHEET_ID_CRM).insertSheet('METADATA_SISTEMA');
  const fechaHoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
  const parametro = (tipo === 'Ventas') ? 'Fecha_Ventas' : 'Fecha_Clientes';
  const datosMeta = hojaMeta.getDataRange().getValues();
  let encontrado = false;
  for (let i = 0; i < datosMeta.length; i++) {
    if (datosMeta[i][0] === parametro) {
      hojaMeta.getRange(i + 1, 2).setValue(fechaHoy);
      encontrado = true; break;
    }
  }
  if (!encontrado) hojaMeta.appendRow([parametro, fechaHoy]);
  return { exito: true, fecha: fechaHoy };
}

function obtenerDatosKPIs() {
  try {
    const ssVentas = SpreadsheetApp.openById(SHEET_ID_VENTAS);
    let totalVentas = ssVentas.getSheets()[0].getLastRow() - 1;
    const ssCRM = SpreadsheetApp.openById(SHEET_ID_CRM);
    let totalClientes = ssCRM.getSheets()[0].getLastRow() - 1;
    let fechaVentas = "Sin datos", fechaClientes = "Sin datos";
    const hojaMeta = ssCRM.getSheetByName('METADATA_SISTEMA');
    if (hojaMeta) {
      const datosMeta = hojaMeta.getDataRange().getValues();
      for (let i = 0; i < datosMeta.length; i++) {
        if (datosMeta[i][0] === 'Fecha_Ventas') fechaVentas = String(datosMeta[i][1]);
        if (datosMeta[i][0] === 'Fecha_Clientes') fechaClientes = String(datosMeta[i][1]);
      }
    }
    return {
      ventas: String(totalVentas > 0 ? totalVentas : 0),
      clientes: String(totalClientes > 0 ? totalClientes : 0),
      fechaVentas: fechaVentas,
      fechaClientes: fechaClientes
    };
  } catch(e) { return { error: e.toString() }; }
}

function obtenerMisClientes() {
  try {
    const ssCRM = SpreadsheetApp.openById(SHEET_ID_CRM);
    const hojaCRM = ssCRM.getSheets()[0];
    const datos = hojaCRM.getDataRange().getValues();
    if (!datos || datos.length <= 1) return { exito: true, clientes: [] };

    let contactados = {};
    let noRespuestaCount = {}; 

    let hojaVisitas = ssCRM.getSheetByName('VISITAS');
    if (hojaVisitas) {
      let visitas = hojaVisitas.getDataRange().getValues();
      const mesActual = new Date().getMonth() + 1;
      const anioActual = new Date().getFullYear();
      
      for (let i = 1; i < visitas.length; i++) {
        if(!visitas[i] || !visitas[i][0]) continue; // Blindaje anti celdas vacías

        let fVal = visitas[i][0];
        let cod = String(visitas[i][2] || "").trim().replace(/'/g, "");
        let tipoInt = String(visitas[i][4] || "").trim();
        let resInt = String(visitas[i][7] || "").trim(); // col H = Resultado (Fase 1)

        if(!cod) continue;

        // "No contacto" se reconoce por el tipo viejo O por el Resultado nuevo (C1 opción 2).
        let esNoContacto = (tipoInt === 'No se obtuvo respuesta por llamada') || (resInt === 'No se obtuvo contacto');
        // La fila de bono por corregir teléfono es NEUTRAL: solo aporta puntos, no cuenta
        // como contacto ni como intento sin respuesta.
        if (resInt === RESULTADO_CORRECCION) continue;

        if (esNoContacto) {
            noRespuestaCount[cod] = (noRespuestaCount[cod] || 0) + 1;
        } else {
            let mesVisita = -1, anioVisita = -1;
            if (fVal instanceof Date) {
                mesVisita = fVal.getMonth() + 1;
                anioVisita = fVal.getFullYear();
            } else {
                let p = String(fVal).trim().split(' ')[0].split('/');
                if (p.length >= 3) {
                    mesVisita = parseInt(p[1], 10);
                    anioVisita = parseInt(p[2].substring(0,4), 10);
                }
            }
            if (mesVisita === mesActual && anioVisita === anioActual) {
                contactados[cod] = true;
            }
        }
      }
    }

    let clientVendorMap = {};
    for(let i = 1; i < datos.length; i++) {
       let cod = String(datos[i][1] || "").trim().replace(/'/g, "");
       let vend = String(datos[i][8] || "SIN VENDEDOR ASIGNADO").trim().toUpperCase();
       if(cod) clientVendorMap[cod] = vend;
    }

    const anioActual = new Date().getFullYear();
    const anioPasado = anioActual - 1; 
    const ssVentas = SpreadsheetApp.openById(SHEET_ID_VENTAS);
    let ventas = ssVentas.getSheets()[0].getDataRange().getValues();
    if(!ventas || ventas.length === 0) ventas = [[]]; // Blindaje
    let headers = ventas[0].map(h => String(h).toLowerCase().trim());
    
    let iCodCli = headers.findIndex(x => x === 'código cliente' || x.includes('código clien') || x.includes('codigo'));
    let iTot = headers.findIndex(x => x === 'total línea s/iva' || x.includes('total línea') || x.includes('total linea') || x.includes('total'));
    let iFec = headers.findIndex(x => x === 'fecha contab.' || x.includes('fecha'));
    let iCan = headers.findIndex(x => x === 'cancelada' || x === 'estado doc.');

    let ventasPorVendedor = {}; 
    let ventasAnioActual = {}; 
    let totalVentasEmpresa = 0;

    if (iCodCli !== -1 && iTot !== -1) {
      for(let i = 1; i < ventas.length; i++) {
        if(!ventas[i]) continue;

        if (iCan !== -1) {
          let estado = String(ventas[i][iCan] || "").trim().toUpperCase();
          if (estado === 'CANCELADA' || estado === 'C' || estado === 'CANCELADO') continue; 
        }
        
        let esAnioPasado = false;
        let esAnioActual = false;

        if (iFec !== -1) {
            let f = ventas[i][iFec];
            if (f instanceof Date) {
              if (f.getFullYear() === anioPasado) esAnioPasado = true;
              if (f.getFullYear() === anioActual) esAnioActual = true;
            } else if (f) {
              let fStr = String(f);
              if (fStr.includes(String(anioPasado)) || fStr.includes('/' + String(anioPasado).substring(2))) esAnioPasado = true;
              if (fStr.includes(String(anioActual)) || fStr.includes('/' + String(anioActual).substring(2))) esAnioActual = true;
            }
        } else {
            esAnioPasado = true; 
        }

        let cod = String(ventas[i][iCodCli] || "").trim().replace(/'/g, "");
        if(!cod) continue;

        let m = parseFloat(String(ventas[i][iTot] || "0").replace(/,/g, '').replace(/[^0-9.-]+/g, "")) || 0;
        let vend = clientVendorMap[cod] || "SIN VENDEDOR ASIGNADO";

        if (esAnioPasado) {
          if(!ventasPorVendedor[vend]) ventasPorVendedor[vend] = { total: 0, clientes: {} };
          if(!ventasPorVendedor[vend].clientes[cod]) ventasPorVendedor[vend].clientes[cod] = 0;
          ventasPorVendedor[vend].clientes[cod] += m;
          ventasPorVendedor[vend].total += m;
          totalVentasEmpresa += m;
        }

        if (esAnioActual) {
          if(!ventasAnioActual[cod]) ventasAnioActual[cod] = 0;
          ventasAnioActual[cod] += m;
        }
      }
    }

    if (totalVentasEmpresa === 0 && iCodCli !== -1 && iTot !== -1) {
        for(let i = 1; i < ventas.length; i++) {
            if(!ventas[i]) continue;
            if (iCan !== -1) {
              let estado = String(ventas[i][iCan] || "").trim().toUpperCase();
              if (estado === 'CANCELADA' || estado === 'C' || estado === 'CANCELADO') continue; 
            }
            let cod = String(ventas[i][iCodCli] || "").trim().replace(/'/g, "");
            if(!cod) continue;
            let m = parseFloat(String(ventas[i][iTot] || "0").replace(/,/g, '').replace(/[^0-9.-]+/g, "")) || 0;
            let vend = clientVendorMap[cod] || "SIN VENDEDOR ASIGNADO";

            if(!ventasPorVendedor[vend]) ventasPorVendedor[vend] = { total: 0, clientes: {} };
            if(!ventasPorVendedor[vend].clientes[cod]) ventasPorVendedor[vend].clientes[cod] = 0;

            ventasPorVendedor[vend].clientes[cod] += m;
            ventasPorVendedor[vend].total += m;
        }
    }

    let clasificacionABC = {};
    let ventasHistoricas = {}; 
    
    for (let vend in ventasPorVendedor) {
        let vData = ventasPorVendedor[vend];
        let sortedClients = Object.keys(vData.clientes).map(k => ({cod: k, val: vData.clientes[k]})).sort((a,b) => b.val - a.val);
        let accum = 0;
        for (let sc of sortedClients) {
            accum += sc.val;
            ventasHistoricas[sc.cod] = (ventasHistoricas[sc.cod] || 0) + sc.val;
            
            let pct = accum / vData.total;
            if (pct <= 0.80) clasificacionABC[sc.cod] = 'A';
            else if (pct <= 0.95) clasificacionABC[sc.cod] = 'B';
            else clasificacionABC[sc.cod] = 'C';
        }
    }

    const headsCRM = datos[0] ? datos[0].map(h => String(h).toLowerCase().trim()) : [];
    const iTipoCli = headsCRM.findIndex(h => h.includes('tipo cli') || h === 'tipo de cliente');

    const lista = datos.slice(1).map(f => {
      if(!f) return null;
      let cod = String(f[1] || "").trim().replace(/'/g, "");
      let nom = String(f[2] || "").trim();
      let dir = String(f[3] || "Sin dirección registrada").trim();
      let mun = String(f[4] || "SIN MUNICIPIO").trim().toUpperCase();
      let dep = String(f[5] || "SIN DEPARTAMENTO").trim().toUpperCase();
      let tel = String(f[6] || "").trim();
      let vend = String(f[8] || "SIN VENDEDOR ASIGNADO").trim().toUpperCase();
      let tipoCli = (iTipoCli !== -1 && f[iTipoCli]) ? String(f[iTipoCli]).trim() : "";

      if(nom === "" || nom === "Sin Nombre") return null;

      let claseFinal = clasificacionABC[cod] || 'C';
      let mActual = ventasAnioActual[cod] || 0;
      let riesgo = (claseFinal === 'A' && mActual === 0) ? true : false;

      return {
        codigo: cod,
        nombre: nom,
        dir: dir, mun: mun, dep: dep, tel: tel, vend: vend,
        tipoCli: tipoCli,
        clase: claseFinal,
        contactado: contactados[cod] ? true : false,
        montoHistorico: ventasHistoricas[cod] || 0,
        enRiesgo: riesgo,
        noRespuestaCount: noRespuestaCount[cod] || 0,
        alertContacto: (noRespuestaCount[cod] >= 3)
      };
    }).filter(x => x !== null);

    return { exito: true, clientes: lista };
  } catch(e) { 
    // AQUÍ ESTÁ EL RASTREADOR: Te dirá la línea exacta del código si algo falla
    return { exito: false, mensaje: e.toString() + " (Línea: " + e.lineNumber + ")" }; 
  }
}

function getColumnLetter(colIndex) {
  let temp, letter = '';
  let col = colIndex + 1;
  while (col > 0) {
    temp = (col - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    col = (col - temp - 1) / 26;
  }
  return letter;
}

function obtenerDetalleCliente(cod) {
  try {
    const codLimpio = String(cod).trim().replace(/'/g, "");
    const ssCRM = SpreadsheetApp.openById(SHEET_ID_CRM);
    const dCRM = ssCRM.getSheets()[0].getDataRange().getValues();
    let contacto = { dir: "N/A", mun: "N/A", dep: "N/A", tel1: "N/A", tel2: "N/A", vend: "N/A" };
    
    for (let j = 1; j < dCRM.length; j++) {
      if (String(dCRM[j][1]).trim().replace(/'/g, "") === codLimpio) { 
        contacto = {
          dir: dCRM[j][3] || "N/A",  
          mun: dCRM[j][4] || "N/A",  
          dep: dCRM[j][5] || "N/A",  
          tel1: dCRM[j][6] || "N/A", 
          tel2: dCRM[j][7] || "N/A", 
          vend: dCRM[j][8] || "N/A"  
        };
        break;
      }
    }

    let aliasMap = getAliasMap();
    let historialCRM = [];
    let hojaVisitas = ssCRM.getSheetByName('VISITAS');
    if (hojaVisitas) {
        let visData = hojaVisitas.getDataRange().getDisplayValues();
        for(let v = 1; v < visData.length; v++) {
            if(String(visData[v][2]).trim().replace(/'/g, "") === codLimpio) {
                let fVal = visData[v][0];
                let fStr = (fVal instanceof Date) ? Utilities.formatDate(fVal, "GMT-6", "dd/MM/yyyy HH:mm") : String(fVal).trim();
                let emailUsr = String(visData[v][1]).trim().toLowerCase();

                historialCRM.push({
                    fec: fStr,
                    usr: aliasMap[emailUsr] || emailUsr.split('@')[0],
                    tip: String(visData[v][4]).trim(),
                    not: String(visData[v][5]).trim()
                });
            }
        }
        historialCRM.reverse(); 
    }

    const ssVentas = SpreadsheetApp.openById(SHEET_ID_VENTAS);
    const hojaVentas = ssVentas.getSheets()[0];
    const sheetName = hojaVentas.getName();
    
    const headers = hojaVentas.getRange(1, 1, 1, hojaVentas.getLastColumn()).getValues()[0];
    const h = headers.map(i => String(i).toLowerCase().trim());
    
    const iCod = h.findIndex(x => x === 'código cliente' || x.includes('código clien'));
    const iTot = h.findIndex(x => x === 'total línea s/iva' || x.includes('total línea') || x.includes('total linea') || x.includes('total'));
    const iDes = h.findIndex(x => x === 'descripción' || x === 'descripcion');
    const iCan = h.findIndex(x => x === 'cancelada' || x === 'estado doc.');
    const iFec = h.findIndex(x => x === 'fecha contab.' || x.includes('fecha'));
    const iCor = h.findIndex(x => x === 'correlativo' || x.includes('correlativo')); 

    if (iCod === -1 || iTot === -1) return { errorMsg: "No se encontraron las columnas clave" };

    const letCod = getColumnLetter(iCod);
    const maxLet = getColumnLetter(headers.length - 1);
    
    let calcSheet = ssVentas.getSheetByName('CALC_TEMP_CRM');
    if (!calcSheet) {
      calcSheet = ssVentas.insertSheet('CALC_TEMP_CRM');
      calcSheet.hideSheet();
    }
    calcSheet.clear();

    const codStr = codLimpio.replace(/"/g, '""'); 
    const formula = `=IFERROR(FILTER('${sheetName}'!A:${maxLet}, '${sheetName}'!${letCod}:${letCod} = "${codStr}"), "VACIO")`;
    
    calcSheet.getRange('A1').setFormula(formula);
    SpreadsheetApp.flush();

    const valA1 = calcSheet.getRange('A1').getValue();
    if (valA1 === "VACIO") {
       return { contacto: contacto, top10: [], anios: [], meses: [], log: [], historialCRM: historialCRM };
    }

    const dVentas = calcSheet.getDataRange().getValues();

    let ps = {}, as = {}, ms = {}, facturas = {};
    const mesesNombres = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

    for (let i = 0; i < dVentas.length; i++) {
      const fila = dVentas[i];
      
      if (iCan !== -1) {
        const estado = String(fila[iCan]).trim().toUpperCase();
        if (estado === 'CANCELADA' || estado === 'C' || estado === 'CANCELADO') continue; 
      }

      let valCelda = fila[iTot];
      let m = (typeof valCelda === 'number') ? valCelda : (parseFloat(String(valCelda).replace(/,/g, '').replace(/[^0-9.-]+/g, "")) || 0);

      if (iDes !== -1) {
        const desc = String(fila[iDes]).trim();
        if (desc) ps[desc] = (ps[desc] || 0) + m;
      }

      let fechaRaw = (iFec !== -1) ? fila[iFec] : null;
      let anio = "N/A";
      let mesSort = 0;
      let mesStr = "N/A";
      let fechaFormat = "Sin Fecha";
      let fechaTick = 0;

      if (fechaRaw) {
          let fObj = null;
          if (fechaRaw instanceof Date) {
              fObj = fechaRaw;
          } else {
              let str = String(fechaRaw).trim();
              if (str.includes('/')) {
                  let p = str.split('/');
                  if (p.length >= 3) {
                      let d = parseInt(p[0], 10);
                      let mes = parseInt(p[1], 10) - 1;
                      let y = parseInt(p[2].substring(0,4), 10);
                      fObj = new Date(y, mes, d);
                  }
              } else if (str.includes('-')) {
                  fObj = new Date(str);
              } else if (!isNaN(fechaRaw) && fechaRaw > 20000) {
                  fObj = new Date(Math.round((fechaRaw - 25569) * 86400 * 1000));
              }
          }

          if (fObj && !isNaN(fObj.getTime())) {
              anio = fObj.getFullYear();
              let mNum = fObj.getMonth();
              mesSort = anio * 100 + mNum; 
              mesStr = mesesNombres[mNum] + " " + anio;
              fechaFormat = Utilities.formatDate(fObj, "GMT-6", "dd/MM/yyyy");
              fechaTick = fObj.getTime();
          } else {
              fechaFormat = String(fechaRaw).substring(0, 10); 
          }
      }

      let corr = (iCor !== -1 && fila[iCor]) ? String(fila[iCor]).trim() : "N/A";
      if (!corr || corr === "") corr = "Sin Correlativo";

      if (anio !== "N/A") {
          as[anio] = (as[anio] || 0) + m;
          if(!ms[mesSort]) ms[mesSort] = { n: mesStr, v: 0 };
          ms[mesSort].v += m;
      }

      if(!facturas[corr]) {
          facturas[corr] = { fObj: fechaTick, fStr: fechaFormat, tot: 0 };
      }
      facturas[corr].tot += m;
    }

    let top10 = Object.keys(ps).map(k => ({ n: k, v: ps[k] })).sort((a,b) => b.v - a.v).slice(0, 10);
    let anios = Object.keys(as).map(k => ({ a: k, v: as[k] })).sort((a,b) => b.a - a.a);
    let meses = Object.keys(ms).sort((a,b) => b - a).map(k => ms[k]);
    let log = Object.keys(facturas).map(k => ({ cor: k, fec: facturas[k].fStr, fObj: facturas[k].fObj, mon: facturas[k].tot }))
                .sort((a,b) => b.fObj - a.fObj).slice(0, 15);
    
    return { 
      contacto: contacto, top10: top10, anios: anios, meses: meses, log: log, historialCRM: historialCRM
    };

  } catch(e) {
    return { errorMsg: e.message };
  }
}

function obtenerColumnaArticulo(headers) {
    let index = headers.findIndex(x => x === 'cód. art.' || x === 'cod. art.' || x.includes('cód. art') || x.includes('cod. art'));
    if (index === -1) index = headers.findIndex(x => ['nº artículo', 'n° artículo', 'artículo', 'articulo', 'código artículo', 'codigo articulo', 'itemcode', 'item code'].includes(x));
    if (index === -1) index = headers.findIndex(x => x.includes('artículo') || x.includes('articulo') || x.includes('item'));
    return index;
}

function buscarListaProductos(termino) {
  try {
    const ssVentas = SpreadsheetApp.openById(SHEET_ID_VENTAS);
    const hojaVentas = ssVentas.getSheets()[0];
    const sheetName = hojaVentas.getName();
    const lastRow = hojaVentas.getLastRow();
    
    if (lastRow <= 1) return { exito: true, productos: [] };

    const headers = hojaVentas.getRange(1, 1, 1, hojaVentas.getLastColumn()).getValues()[0].map(i => String(i).toLowerCase().trim());
    
    const iCodArt = obtenerColumnaArticulo(headers);
    const iDes = headers.findIndex(x => x === 'descripción' || x === 'descripcion' || x.includes('descrip'));

    if (iCodArt === -1 || iDes === -1) {
        return { exito: false, mensaje: `No encontré las columnas de producto.` };
    }

    const letCodArt = getColumnLetter(iCodArt);
    const letDes = getColumnLetter(iDes);
    const maxLet = getColumnLetter(headers.length - 1);
    
    let calcSheet = ssVentas.getSheetByName('CALC_TEMP_CRM');
    if (!calcSheet) {
      calcSheet = ssVentas.insertSheet('CALC_TEMP_CRM');
      calcSheet.hideSheet();
    }
    calcSheet.clear();

    const t = String(termino).trim().toUpperCase().replace(/'/g, "''");
    
    const formula = `=IFERROR(UNIQUE(QUERY('${sheetName}'!A:${maxLet}, "select ${letCodArt}, ${letDes} where upper(${letCodArt}) contains '${t}' or upper(${letDes}) contains '${t}' limit 100", 0)), "VACIO")`;
    
    calcSheet.getRange('A1').setFormula(formula);
    SpreadsheetApp.flush();

    const valA1 = calcSheet.getRange('A1').getValue();
    if (valA1 === "VACIO" || valA1 === "") return { exito: true, productos: [] };

    const data = calcSheet.getDataRange().getDisplayValues();
    
    let lista = [];
    let checkUnicos = {};
    for(let i = 0; i < data.length; i++) {
        let cod = data[i][0].trim().replace(/'/g, ""); 
        let des = data[i][1] ? data[i][1].trim() : "Sin descripción";
        if(cod && cod !== "VACIO") {
            if(!checkUnicos[cod]) {
                checkUnicos[cod] = true;
                lista.push({ cod: cod, des: des });
                if(lista.length >= 50) break;
            }
        }
    }

    return { exito: true, productos: lista };

  } catch(e) { return { exito: false, mensaje: e.message }; }
}

function analizarTopClientesProd(codArticuloTarget) {
  try {
    const ssVentas = SpreadsheetApp.openById(SHEET_ID_VENTAS);
    const hojaVentas = ssVentas.getSheets()[0];
    const sheetName = hojaVentas.getName();
    const lastRow = hojaVentas.getLastRow();
    if (lastRow <= 1) return { exito: true, resultados: [] };

    const headers = hojaVentas.getRange(1, 1, 1, hojaVentas.getLastColumn()).getValues()[0].map(i => String(i).toLowerCase().trim());
    
    const iCodArt = obtenerColumnaArticulo(headers);
    const iCodCli = headers.findIndex(x => x === 'código cliente' || x.includes('código clien'));
    const iTot = headers.findIndex(x => x === 'total línea s/iva' || x.includes('total línea') || x.includes('total linea') || x.includes('total'));
    const iCan = headers.findIndex(x => x === 'cancelada' || x === 'estado doc.');
    const iFec = headers.findIndex(x => x === 'fecha contab.' || x.includes('fecha'));
    const iNomCli = headers.findIndex(x => x === 'nombre cliente' || x.includes('nombre clien') || x === 'nombre' || x === 'cliente');

    if (iCodCli === -1 || iTot === -1 || iCodArt === -1) {
        return { exito: false, mensaje: `Error de columnas en SAP.` };
    }

    const letCodArt = getColumnLetter(iCodArt);
    const letCodCli = getColumnLetter(iCodCli);
    const letTot = getColumnLetter(iTot);
    const letCan = iCan !== -1 ? getColumnLetter(iCan) : null;
    const letFec = iFec !== -1 ? getColumnLetter(iFec) : null;
    const letNomCli = iNomCli !== -1 ? getColumnLetter(iNomCli) : null;
    const maxLet = getColumnLetter(headers.length - 1);

    let calcSheet = ssVentas.getSheetByName('CALC_TEMP_CRM');
    if (!calcSheet) {
      calcSheet = ssVentas.insertSheet('CALC_TEMP_CRM');
      calcSheet.hideSheet();
    }
    calcSheet.clear();

    const codExacto = String(codArticuloTarget).trim().toUpperCase().replace(/'/g, "''");
    
    let selectColsArr = [letCodCli, letTot];
    let idxFec = -1, idxNom = -1;

    if (letFec) { selectColsArr.push(letFec); idxFec = selectColsArr.length - 1; }
    if (letNomCli) { selectColsArr.push(letNomCli); idxNom = selectColsArr.length - 1; }

    let selectCols = selectColsArr.join(', ');
    
    let queryWhere = `upper(${letCodArt}) like '%${codExacto}%'`;
    if (letCan) queryWhere += ` and upper(${letCan}) != 'CANCELADA' and upper(${letCan}) != 'C' and upper(${letCan}) != 'CANCELADO'`;

    const formula = `=IFERROR(QUERY('${sheetName}'!A:${maxLet}, "select ${selectCols} where ${queryWhere} limit 20000", 0), "VACIO")`;
    
    calcSheet.getRange('A1').setFormula(formula);
    SpreadsheetApp.flush();

    const valA1 = calcSheet.getRange('A1').getValue();
    if (valA1 === "VACIO" || valA1 === "") return { exito: true, resultados: [] };

    const data = calcSheet.getDataRange().getValues();
    const displayData = calcSheet.getDataRange().getDisplayValues();

    let comprasPorCliente = {};

    for(let i = 0; i < data.length; i++) {
        let codCL = displayData[i][0].trim().toUpperCase().replace(/'/g, ""); 
        if(codCL === "VACIO" || !codCL) continue;
        
        let monto = parseFloat(data[i][1]) || 0;
        
        let anio = "N/A";
        if (idxFec !== -1 && displayData[i][idxFec]) {
            let fechaStr = String(displayData[i][idxFec]).trim();
            if(fechaStr.includes('/')) {
                let p = fechaStr.split('/');
                if(p.length >= 3) anio = p[2].substring(0,4);
            } else if(fechaStr.includes('-')) {
                let p = fechaStr.split('-');
                if(p[0].length === 4) anio = p[0];
            } else if(fechaStr.includes('2025')) { anio = '2025'; } 
              else if(fechaStr.includes('2026')) { anio = '2026'; }
            if(anio.length !== 4) anio = "Varios";
        }

        let nombreVentas = "Cliente sin registrar";
        if (idxNom !== -1 && displayData[i][idxNom]) {
            nombreVentas = String(displayData[i][idxNom]).trim();
        }

        if(!comprasPorCliente[codCL]) {
            comprasPorCliente[codCL] = { total: 0, anios: {}, nombre: nombreVentas };
        }
        
        comprasPorCliente[codCL].total += monto;
        comprasPorCliente[codCL].anios[anio] = (comprasPorCliente[codCL].anios[anio] || 0) + monto;
    }

    let topCodigos = Object.keys(comprasPorCliente).sort((a, b) => comprasPorCliente[b].total - comprasPorCliente[a].total);

    if (topCodigos.length === 0) return { exito: true, resultados: [] };

    let resultadosFinales = topCodigos.map(cod => {
        return { 
            codigo: cod, 
            nombre: comprasPorCliente[cod].nombre, 
            total: comprasPorCliente[cod].total,
            anios: comprasPorCliente[cod].anios
        };
    });

    return { exito: true, resultados: resultadosFinales };

  } catch(e) {
    return { exito: false, mensaje: e.message };
  }
}

function guardarVisita(d, correoVendedor) {
  const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
  let h = ss.getSheetByName('VISITAS') || ss.insertSheet('VISITAS');
  if(h.getLastRow() === 0) h.appendRow(['Fecha','Vendedor','Código','Cliente','Tipo de Interacción','Nota', 'Ubicación GPS','Resultado','Puntos','Origen_Puntaje']);

  const resultado = String(d.resultado || '').trim();
  const puntos = calcularPuntos(resultado);

  h.appendRow([
    Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy HH:mm"),
    correoVendedor || 'Desconocido',
    d.codigo, d.nombre, d.tipoInteraccion, d.comentario, d.gps || "N/A",
    resultado, puntos, 'manual'
  ]);

  // Fase 4: si el resultado es producto no disponible, registra la demanda no cubierta.
  if (resultado === 'Producto no disponible (sin stock)' && d.demanda && String(d.demanda.producto || '').trim()) {
    guardarDemanda(d, correoVendedor);
  }
  // Fase 3: si no hubo contacto y el vendedor aportó datos de teléfono, registra la corrección.
  // Si aportó un teléfono nuevo válido, guardarCorreccionContacto otorga +1 punto (fila aparte).
  let puntoCorreccion = 0;
  if (resultado === 'No se obtuvo contacto' && d.correccion && _correccionTieneDatos(d.correccion)) {
    const corr = guardarCorreccionContacto({
      codigo: d.codigo, nombre: d.nombre,
      telActual: d.correccion.telActual,
      telAlternativo: d.correccion.telAlternativo,
      validado: d.correccion.validado,
      estadoCliente: d.correccion.estadoCliente,
      notas: d.comentario
    }, correoVendedor);
    if (corr && corr.puntoCorreccion) puntoCorreccion = corr.puntoCorreccion;
  }
  // Reincidencia: el cliente ya tenía 3+ intentos sin respuesta y el vendedor vuelve a marcar
  // "sin contacto". Registra/actualiza una alerta para que el admin se entere automáticamente.
  if (resultado === 'No se obtuvo contacto' && (parseInt(d.intentosPrevios, 10) || 0) >= 3) {
    registrarAlertaReincidencia({
      codigo: d.codigo,
      nombre: d.nombre,
      intentos: (parseInt(d.intentosPrevios, 10) || 0) + 1
    }, correoVendedor);
  }

  const atendidosHoy = contarClientesUnicosHoy(correoVendedor);
  const puntosHoy = contarPuntosHoy(correoVendedor);
  return { exito: true, atendidosHoy: atendidosHoy, puntosHoy: puntosHoy, puntosRegistro: puntos, puntoCorreccion: puntoCorreccion };
}

// ============================================================
// FASE 3 - CORRECCIÓN DE CONTACTO (staging para SAP / OCRD)
// ============================================================
const CORRECCIONES_HEADERS = ['Fecha', 'Vendedor', 'Código cliente', 'Cliente', 'Teléfono registrado actual', 'Teléfono alternativo propuesto', '¿Validado correcto?', 'Estado del cliente', 'Notas', 'Estado de sincronización'];

function obtenerHojaCorrecciones() {
  const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
  let h = ss.getSheetByName('CORRECCIONES_CONTACTO');
  if (!h) {
    h = ss.insertSheet('CORRECCIONES_CONTACTO');
    h.appendRow(CORRECCIONES_HEADERS);
    h.setFrozenRows(1);
    h.getRange(1, 1, 1, CORRECCIONES_HEADERS.length).setFontWeight('bold');
    h.setColumnWidth(3, 120); h.setColumnWidth(4, 220);
  }
  return h;
}

function _correccionTieneDatos(c) {
  if (!c) return false;
  const tel = String(c.telAlternativo || '').trim();
  const val = String(c.validado || '').trim();
  const est = String(c.estadoCliente || '').trim();
  return !!(tel || val || est);
}

// Valida teléfono de El Salvador: 8 dígitos (acepta +503 opcional). Devuelve "" si inválido.
function _normalizarTelefonoSV(tel) {
  let s = String(tel || '').replace(/[^0-9]/g, '');
  if (s.length === 11 && s.indexOf('503') === 0) s = s.substring(3);
  return (s.length === 8) ? s : '';
}

// Registra/actualiza una corrección de contacto. Sirve tanto desde el formulario
// de interacción ("No se obtuvo contacto") como desde el botón de la ficha (cualquier momento).
function guardarCorreccionContacto(d, correoVendedor) {
  try {
    const h = obtenerHojaCorrecciones();
    const telAlt = String(d.telAlternativo || '').trim();
    let telAltNorm = '';
    if (telAlt) {
      telAltNorm = _normalizarTelefonoSV(telAlt);
      if (!telAltNorm) return { exito: false, mensaje: 'El teléfono alternativo debe tener 8 dígitos (El Salvador).' };
    }
    h.appendRow([
      Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy HH:mm"),
      correoVendedor || 'Desconocido',
      String(d.codigo || '').trim(),
      String(d.nombre || '').trim(),
      String(d.telActual || '').trim(),
      telAltNorm,
      String(d.validado || '').trim(),
      String(d.estadoCliente || '').trim(),
      String(d.notas || '').trim(),
      'Pendiente revisión'
    ]);
    // Premio: si aportó un teléfono nuevo válido, otorga +1 punto al asesor.
    // Se registra como una fila NEUTRAL en VISITAS (suma puntos, pero no marca al
    // cliente como contactado ni como sin-contacto; ver obtenerMisClientes).
    let puntoCorreccion = 0;
    if (telAltNorm) {
      puntoCorreccion = otorgarPuntoCorreccion(d.codigo, d.nombre, telAltNorm, correoVendedor);
    }
    return { exito: true, puntoCorreccion: puntoCorreccion };
  } catch (e) {
    return { exito: false, mensaje: e.message };
  }
}

// Escribe la fila de bono por corrección de teléfono en VISITAS. Devuelve los puntos otorgados.
function otorgarPuntoCorreccion(codigo, nombre, telNuevo, correoVendedor) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
    let h = ss.getSheetByName('VISITAS') || ss.insertSheet('VISITAS');
    if (h.getLastRow() === 0) h.appendRow(['Fecha','Vendedor','Código','Cliente','Tipo de Interacción','Nota', 'Ubicación GPS','Resultado','Puntos','Origen_Puntaje']);
    h.appendRow([
      Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy HH:mm"),
      correoVendedor || 'Desconocido',
      String(codigo || '').trim(),
      String(nombre || '').trim(),
      RESULTADO_CORRECCION,
      'Tel. corregido: ' + telNuevo,
      'N/A',
      RESULTADO_CORRECCION,
      PUNTO_CORRECCION_CONTACTO,
      'correccion'
    ]);
    return PUNTO_CORRECCION_CONTACTO;
  } catch (e) {
    return 0;
  }
}

// Lista de tareas para SAP: correcciones pendientes de revisión (para gerencia).
function obtenerTareasSAP() {
  try {
    const h = obtenerHojaCorrecciones();
    if (h.getLastRow() <= 1) return { exito: true, tareas: [], totalHoy: 0 };
    const data = h.getDataRange().getValues();
    const hoyStr = Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy");
    const tareas = [];
    let totalHoy = 0;
    for (let i = 1; i < data.length; i++) {
      let estadoSync = String(data[i][9] || '').trim();
      if (estadoSync && estadoSync !== 'Pendiente revisión') continue;
      let fechaRaw = data[i][0];
      let fechaFmt = (fechaRaw instanceof Date) ? Utilities.formatDate(fechaRaw, "GMT-6", "dd/MM/yyyy HH:mm") : String(fechaRaw);
      let esHoy = fechaFmt.substring(0, 10) === hoyStr;
      if (esHoy) totalHoy++;
      tareas.push({
        fila: i + 1,
        fecha: fechaFmt,
        esHoy: esHoy,
        vendedor: String(data[i][1] || ''),
        codigo: String(data[i][2] || ''),
        cliente: String(data[i][3] || ''),
        telActual: String(data[i][4] || ''),
        telNuevo: String(data[i][5] || ''),
        validado: String(data[i][6] || ''),
        estadoCliente: String(data[i][7] || ''),
        notas: String(data[i][8] || '')
      });
    }
    tareas.sort(function(a, b) { return (b.esHoy ? 1 : 0) - (a.esHoy ? 1 : 0); });
    return { exito: true, tareas: tareas, totalHoy: totalHoy };
  } catch (e) {
    return { exito: false, mensaje: e.message, tareas: [], totalHoy: 0 };
  }
}

// ---- Alertas de reincidencia: vendedor que intenta marcar otro "sin contacto"
//      en un cliente con 3+ intentos sin corregir el teléfono. Una fila por cliente (upsert). ----
const ALERTAS_HEADERS = ['Código cliente', 'Cliente', 'Intentos sin respuesta', 'Veces bloqueado', 'Último vendedor', 'Última vez', 'Estado'];

function obtenerHojaAlertas() {
  const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
  let h = ss.getSheetByName('ALERTAS_CONTACTO');
  if (!h) {
    h = ss.insertSheet('ALERTAS_CONTACTO');
    h.appendRow(ALERTAS_HEADERS);
    h.setFrozenRows(1);
    h.getRange(1, 1, 1, ALERTAS_HEADERS.length).setFontWeight('bold');
    h.setColumnWidth(2, 220);
  }
  return h;
}

function registrarAlertaReincidencia(d, correoVendedor) {
  try {
    const h = obtenerHojaAlertas();
    const cod = String(d.codigo || '').trim().replace(/'/g, '');
    if (!cod) return { exito: false };
    const alias = getAliasMap();
    const vend = alias[String(correoVendedor || '').trim().toLowerCase()] || String(correoVendedor || '').split('@')[0];
    const ahora = Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy HH:mm");
    const intentos = parseInt(d.intentos, 10) || 0;
    const data = h.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().replace(/'/g, '') === cod && String(data[i][6] || '').trim() !== 'Resuelto') {
        let veces = (parseInt(data[i][3], 10) || 0) + 1;
        h.getRange(i + 1, 3, 1, 5).setValues([[intentos, veces, vend, ahora, 'Pendiente']]);
        return { exito: true, veces: veces };
      }
    }
    h.appendRow([cod, String(d.nombre || '').trim(), intentos, 1, vend, ahora, 'Pendiente']);
    return { exito: true, veces: 1 };
  } catch (e) {
    return { exito: false, mensaje: e.message };
  }
}

function obtenerAlertasReincidencia() {
  try {
    const h = obtenerHojaAlertas();
    if (h.getLastRow() <= 1) return { exito: true, alertas: [] };
    const data = h.getDataRange().getValues();
    const alertas = [];
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][6] || '').trim() === 'Resuelto') continue;
      if (!String(data[i][0]).trim()) continue;
      alertas.push({
        codigo: String(data[i][0]).trim().replace(/'/g, ''),
        cliente: String(data[i][1] || ''),
        intentos: parseInt(data[i][2], 10) || 0,
        veces: parseInt(data[i][3], 10) || 0,
        vendedor: String(data[i][4] || ''),
        ultima: (data[i][5] instanceof Date) ? Utilities.formatDate(data[i][5], "GMT-6", "dd/MM/yyyy HH:mm") : String(data[i][5] || '')
      });
    }
    alertas.sort(function(a, b){ return b.veces - a.veces; });
    return { exito: true, alertas: alertas };
  } catch (e) {
    return { exito: false, mensaje: e.message, alertas: [] };
  }
}

// ============================================================
// FASE 4 - DEMANDA NO CUBIERTA (producto que el cliente pidió y no teníamos)
// ============================================================
const DEMANDA_HEADERS = ['Fecha', 'Vendedor', 'Código cliente', 'Cliente', 'Producto solicitado', 'Marca', 'Cantidad estimada', 'Nota'];

function obtenerHojaDemanda() {
  const ss = SpreadsheetApp.openById(SHEET_ID_CRM);
  let h = ss.getSheetByName('DEMANDA_NO_CUBIERTA');
  if (!h) {
    h = ss.insertSheet('DEMANDA_NO_CUBIERTA');
    h.appendRow(DEMANDA_HEADERS);
    h.setFrozenRows(1);
    h.getRange(1, 1, 1, DEMANDA_HEADERS.length).setFontWeight('bold');
    h.setColumnWidth(5, 240);
  }
  return h;
}

function guardarDemanda(d, correoVendedor) {
  try {
    const dem = d.demanda || {};
    const producto = String(dem.producto || '').trim();
    if (!producto) return { exito: false, mensaje: 'Falta el nombre del producto solicitado.' };
    const h = obtenerHojaDemanda();
    h.appendRow([
      Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy HH:mm"),
      correoVendedor || 'Desconocido',
      String(d.codigo || '').trim(),
      String(d.nombre || '').trim(),
      producto,
      String(dem.marca || '').trim(),
      String(dem.cantidad || '').trim(),
      String(d.comentario || '').trim()
    ]);
    return { exito: true };
  } catch (e) {
    return { exito: false, mensaje: e.message };
  }
}

// Resumen para compras: productos más solicitados que no teníamos (conteo).
function obtenerResumenDemanda() {
  try {
    const h = obtenerHojaDemanda();
    if (h.getLastRow() <= 1) return { exito: true, productos: [], totalRegistros: 0 };
    const data = h.getDataRange().getValues();
    const conteo = {};
    let total = 0;
    for (let i = 1; i < data.length; i++) {
      let prod = String(data[i][4] || '').trim();
      if (!prod) continue;
      let clave = prod.toLowerCase();
      if (!conteo[clave]) conteo[clave] = { producto: prod, veces: 0, clientes: {} };
      conteo[clave].veces++;
      let cod = String(data[i][2] || '').trim();
      if (cod) conteo[clave].clientes[cod] = true;
      total++;
    }
    const productos = Object.keys(conteo).map(function(k) {
      return { producto: conteo[k].producto, veces: conteo[k].veces, clientesUnicos: Object.keys(conteo[k].clientes).length };
    }).sort(function(a, b) { return b.veces - a.veces; });
    return { exito: true, productos: productos, totalRegistros: total };
  } catch (e) {
    return { exito: false, mensaje: e.message, productos: [] };
  }
}

// Detalle de la demanda no cubierta CON el vendedor que la documentó (más reciente primero).
function obtenerDemandaDetalle() {
  try {
    const h = obtenerHojaDemanda();
    if (h.getLastRow() <= 1) return { exito: true, items: [] };
    const aliasMap = getAliasMap();
    const data = h.getDataRange().getValues();
    const items = [];
    for (let i = 1; i < data.length; i++) {
      let producto = String(data[i][4] || '').trim();
      if (!producto) continue;
      let email = String(data[i][1] || '').trim().toLowerCase();
      items.push({
        fecha: (data[i][0] instanceof Date) ? Utilities.formatDate(data[i][0], "GMT-6", "dd/MM/yyyy") : String(data[i][0]).substring(0, 10),
        vendedor: aliasMap[email] || (email ? email.split('@')[0] : 'Desconocido'),
        codigo: String(data[i][2] || ''),
        cliente: String(data[i][3] || ''),
        producto: producto,
        marca: String(data[i][5] || ''),
        cantidad: String(data[i][6] || '')
      });
    }
    items.reverse();
    return { exito: true, items: items };
  } catch (e) {
    return { exito: false, mensaje: e.message, items: [] };
  }
}

// Tres listados de gestión para el admin, en UNA sola pasada (reusa obtenerMisClientes):
//  - sinContacto: clientes con >=3 intentos sin respuesta (teléfono sospechoso)
//  - enRiesgo: Clase A que compró el año pasado pero $0 este año
//  - abandonada: clientes sin ninguna interacción efectiva este mes
function obtenerListadosAdmin() {
  try {
    const base = obtenerMisClientes();
    if (!base.exito) return { exito: false, mensaje: base.mensaje };
    const clientes = base.clientes || [];
    const sinContacto = [], enRiesgo = [], abandonada = [];
    clientes.forEach(function(c) {
      if ((c.noRespuestaCount || 0) >= 3) {
        sinContacto.push({ codigo: c.codigo, nombre: c.nombre, vend: c.vend, tel: c.tel, intentos: c.noRespuestaCount });
      }
      if (c.enRiesgo) {
        enRiesgo.push({ codigo: c.codigo, nombre: c.nombre, vend: c.vend, tel: c.tel, monto: Math.round(c.montoHistorico || 0), clase: c.clase });
      }
      if (!c.contactado) {
        abandonada.push({ codigo: c.codigo, nombre: c.nombre, vend: c.vend, tel: c.tel, monto: Math.round(c.montoHistorico || 0), clase: c.clase });
      }
    });
    sinContacto.sort(function(a, b) { return b.intentos - a.intentos; });
    enRiesgo.sort(function(a, b) { return b.monto - a.monto; });
    abandonada.sort(function(a, b) { return b.monto - a.monto; });
    return {
      exito: true,
      sinContacto: sinContacto,
      enRiesgo: enRiesgo,
      abandonada: abandonada.slice(0, 300),
      conteos: { sinContacto: sinContacto.length, enRiesgo: enRiesgo.length, abandonada: abandonada.length }
    };
  } catch (e) {
    return { exito: false, mensaje: e.message };
  }
}

// Setup Fases 3 y 4: crea las hojas. Correr UNA vez (admin) o se crean solas al primer uso.
function inicializarFase34() {
  obtenerHojaCorrecciones();
  obtenerHojaDemanda();
  return { exito: true };
}

function obtenerReportesAdmin() {
  try {
    const ssCRM = SpreadsheetApp.openById(SHEET_ID_CRM);
    let hojaVisitas = ssCRM.getSheetByName('VISITAS');
    let aliasMap = getAliasMap();

    if (!hojaVisitas) return { exito: true, visitas: [], hoyStr: Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy") };
    
    let vData = hojaVisitas.getDataRange().getValues();
    if (vData.length <= 1) return { exito: true, visitas: [], hoyStr: Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy") };

    let listaVisitas = [];
    for(let i=1; i<vData.length; i++) {
        let fVal = vData[i][0];
        let fStr = "";
        
        if (fVal instanceof Date) {
            fStr = Utilities.formatDate(fVal, "GMT-6", "dd/MM/yyyy HH:mm");
        } else {
            fStr = String(fVal).trim();
        }

        let emailUsr = String(vData[i][1]).trim().toLowerCase();

        listaVisitas.push({
            fecha: fStr,
            usuario: aliasMap[emailUsr] || emailUsr.split('@')[0], 
            cod: String(vData[i][2]).trim().replace(/'/g, ""),
            nom: String(vData[i][3]).trim(),
            tipo: String(vData[i][4]).trim(),
            nota: String(vData[i][5]).trim(),
            gps: String(vData[i][6] || "").trim()
        });
    }
    
    let hoyServer = Utilities.formatDate(new Date(), "GMT-6", "dd/MM/yyyy");
    return { exito: true, visitas: listaVisitas.reverse(), hoyStr: hoyServer };
  } catch(e) {
    return { exito: false, mensaje: e.message };
  }
}