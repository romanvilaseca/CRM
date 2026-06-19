---
name: project-horario-laboral
description: Horario laboral de Corpodent CDES en El Salvador (UTC-6 sin DST) usado por la lógica del banner de urgencia
metadata: 
  node_type: memory
  type: project
  originSessionId: 2c2cd3d6-236d-4a49-9dbb-9a46a7d2f7bd
---

**Equipo**: 8 vendedores en El Salvador, zona horaria `America/El_Salvador` (UTC-6, sin DST).

**Horario laboral:**
- **Lunes a viernes**: 8:00 AM a 5:00 PM (17:00)
- **Sábado**: 8:00 AM a 12:30 PM
- **Domingo**: descanso

## Implementación en `Index.html`

Constantes (al inicio del bloque del banner de urgencia):
```js
var HORA_INICIO_LABORAL = 8;
var HORA_FIN_LV = 17;       // Lun-Vie
var HORA_FIN_SAB = 12;      // Sábado
var MIN_FIN_SAB = 30;
var TZ_SV = 'America/El_Salvador';
```

Helpers:
- `obtenerAhoraSV()` — usa `Intl.DateTimeFormat` con `timeZone: TZ_SV` para devolver `{ anio, mes, dia, hora, minuto, diaSemana }` independiente de la zona horaria del navegador del usuario. Esto importa porque si el navegador está mal configurado o el vendedor viaja, la hora local sería errónea
- `estaEnHorarioLaboral(diaSem, horaH, horaM)` — boolean
- `mensajeFueraHorario(...)` — devuelve el texto a mostrar fuera de horario (distinto para domingo, antes 8 AM, sábado pasado, viernes pasado, otros días pasados)

## Inicio de jornada hoy en SV

Para el contador del banner ("hace X sin un cliente"), si la última interacción fue antes de las 8 AM de hoy, el contador arranca desde las 8 AM en lugar de hacerlo desde el momento real (sería injusto contar las horas de la noche). Cálculo:

```js
// 8 AM en El Salvador = 14:00 UTC. UTC-6 sin DST.
var inicioHoy = Date.UTC(sv.anio, sv.mes, sv.dia, HORA_INICIO_LABORAL + 6, 0, 0);
var tsRef = Math.max(BANNER_TS, inicioHoy);
```

## Por qué importa

El usuario reportó que aparecía "Hace 7 h 36 min sin un cliente" cuando un vendedor llegaba a las 8 AM, porque la última interacción había sido la noche anterior. Esto generaba urgencia injustificada apenas empezaba el día.

**Why:** Documentar para que cualquier nuevo banner/lógica que use horario laboral en el frontend respete estas mismas reglas (y use los helpers existentes en lugar de duplicar lógica). El Salvador no tiene DST, así que el offset UTC-6 es fijo todo el año.

**How to apply:** Si necesito hacer otra lógica time-aware en el cliente (timer de inactividad, recordatorio horario, etc.), usar `obtenerAhoraSV()` y `Date.UTC(...)` con offset +6 para construir timestamps. NUNCA usar `new Date().getHours()` directamente — eso depende de la zona horaria del navegador del usuario, que puede estar mal o ser otra.

El backend (Apps Script) ya está configurado con `timeZone: "America/El_Salvador"` en `appsscript.json`, así que ahí está OK usar `Utilities.formatDate(date, "GMT-6", fmt)` o `new Date()`.

Ver también [[project-features-actuales]] para detalles del banner urgencia.
