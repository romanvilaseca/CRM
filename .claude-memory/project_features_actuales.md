---
name: project-features-actuales
description: "Funcionalidades activas en el CRM CDES y dependencias en planillas (estado al 2026-06-18, v123 en producción)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2c2cd3d6-236d-4a49-9dbb-9a46a7d2f7bd
---

Estado del CRM CDES al 2026-06-18 (deployment publicado **v123**). El backend (`Código.js`) y frontend (`Index.html`) están en `c:\Users\CDES\Documents\CRM CDES CODE\`. Repo: github.com/romanvilaseca/CRM rama `main`.

## Sistema de PUNTOS por resultado

El cockpit mide **PUNTOS**, no clientes. Cada interacción tiene un campo `Resultado` que define los puntos.

**Esquema vigente en hoja `CONFIG_PUNTOS` (editable, último ajuste 2026-06-18 sesión tarde):**
- Pedido/venta cerrada = 3
- Cotización = 1
- Pedido pendiente = 1
- Contacto efectivo = 1
- Cliente completo = 0.5
- Producto no disponible = 0.5
- **Mensaje sin respuesta = 0.25** (era 0)
- **No se obtuvo contacto = 0.10** (era 0)
- **Bonus: Corrección de teléfono = +1 pt** (automático al guardar tel nuevo válido de 8 díg)

**Por qué los puntos pequeños en baja interacción**: incentivar el registro del intento (ayuda a detectar reincidencias y teléfonos mal registrados). El admin puede editar desde modal "⭐ Puntos".

Meta diaria default = **30 puntos** para todos, editable por vendedor en hoja `METAS_USUARIO`.

## Hojas en el spreadsheet CRM (`14WJaC8VkcYAXIiO65Q9DDXh9RXhdUSg8120_L9mG9YY`)

- `CLIENTES_ASIGNADOS` (hoja 0) — cartera
- `USUARIOS_AJUSTES` — `Correo_Gmail[0], Rol[1], Comision[2], Estado[3], Alias/Nombre_SAP[4], PIN[5], ultimoAcceso[6], meta_diaria_clientes[7]`
- `VISITAS` — `Fecha[0], Vendedor email[1], Código[2], Cliente[3], Tipo de Interacción[4], Nota[5], GPS[6], Resultado[7], Puntos[8], Origen_Puntaje[9]`
- `CONFIG_PUNTOS` — Resultado → Puntos (editable por admin desde modal "⭐ Puntos")
- `METAS_USUARIO` — Vendedor (correo), Meta puntos, Meta llamadas, Meta WhatsApp, Meta visitas
- `CORRECCIONES_CONTACTO` — staging de teléfonos a corregir en SAP (panel admin "📋 Tareas para SAP")
- `DEMANDA_NO_CUBIERTA` — productos pedidos sin stock
- `ALERTAS_CONTACTO` — upsert por cliente, levantada cuando hay 3+ "No se obtuvo contacto"
- `METADATA_SISTEMA` — fechas de carga
- `INTERACCIONES`, `METADATA`, `Hoja 2` — legacy/vacías, NO TOCAR

## Funciones backend clave

- `obtenerRendimientoUsuario` / `obtenerRendimientoEquipo` — puntos por vendedor
- `obtenerDesglosePuntosDia` — drill-down día por resultado
- `generarDesglosePuntosPDF` — exporta el desglose. Acepta rango de fechas
- `obtenerCockpitDiario(email, fecha?)` — devuelve `{ meta, atendidos, clientesAtendidos }`. `atendidos` = puntos. `clientesAtendidos` = clientes únicos con interacción positiva (excluye sin contacto, sin respuesta, corrección)
- `obtenerCockpitMes(email, yyyymm?)` — devuelve `{ meta, puntos, metaDiaria, diasHabiles }`. Meta del mes = `metaDiaria × diasHabiles` (lun-sab, excluye domingos). Calculada dinámicamente
- `contarPuntosMes`, `contarDiasHabilesMes`, `contarClientesAtendidosHoy` — helpers
- `obtenerListadosAdmin` — sin contacto + en riesgo + cartera abandonada en una pasada
- `obtenerDemandaDetalle`, `obtenerResumenDemanda`, `obtenerTareasSAP` (con `esHoy` por tarea y `totalHoy` en respuesta)
- `obtenerMetasEquipo`, `guardarMetasUsuario`, `ajustarMetaPuntosTodos` — modal admin para editar metas + ajuste masivo
- `guardarConfigPuntos(lista)` — solo actualiza columna Puntos de CONFIG_PUNTOS (modal admin "⭐ Puntos")
- `otorgarPuntoCorreccion` — bonus +1 pt al corregir teléfono. Fila NEUTRAL en VISITAS (tipo/resultado `Corrección de teléfono`). Constante `PUNTO_CORRECCION_CONTACTO`
- `registrarAlertaReincidencia` / `obtenerAlertasReincidencia` — 3+ "No se obtuvo contacto" → frontend obliga a corregir contacto antes de marcar otro
- `ajustarPuntosBajaInteraccion20260618` — migración one-shot (idempotente) que aplica 0.25/0.10 a CONFIG_PUNTOS

## UI: dashboard (header oscuro)

Header tiene 4 tiles en grid (2 cols mobile, 4 cols desktop):
1. **Ventas Históricas** — KPI texto plano
2. **MIS PUNTOS HOY** — cockpit prominente azul (`bg-blue-500/10`, borde 2px, shadow azul). Anillo `w-20→md:w-24` stroke-4. Badge "👥 X" verde en esquina superior derecha con tooltip al hover (clientes únicos atendidos positivamente). Solo vendedor (admin no ve badge)
3. **PUNTOS DEL MES** — cockpit simétrico al de HOY pero morado (`bg-purple-500/10`). Solo vendedor. Anillo cambia color según %: <25 rojo, 25-49 morado, 50-74 azul, 75-99 verde, 100 verde + "🎯 Meta cumplida"
4. **Total Clientes** — KPI texto plano

Importante: ambos cockpits son SIMÉTRICOS en tamaño/estilo. El usuario detecta inmediatamente la asimetría — si agrego un tile/badge a uno, simetrizar al otro.

## UI: navegación

Tabs: 📋 Tareas (default), 🗺️ Mapa, 📦 Productos, 📊 RESUMEN (Admin lo ve como "📈 AUDITORÍA").

- **Tabs Mapa y Productos tienen tooltip** al hover (globo oscuro arriba): explican qué hace cada uno
- Tab AUDITORÍA del admin tiene **badge rojo pulsante** en esquina superior derecha con cantidad de tareas SAP de HOY (se carga al login)

## UI: vista Tareas (vendedor)

- **Banner "última interacción"** con sistema de urgencia + reloj + horario laboral (ver [[project-horario-laboral]]):
  - Sin urgencia (<5 min, o fuera de horario): blanco/gris
  - Ámbar (5-14 min): pulso lento, "⏰ Vas hace..."
  - Naranja (15-29 min): pulso medio, "⚠️ Atención..."
  - Rojo (30+ min): pulso rápido + shake, "🔴 Hace bastante: X sin un cliente"
  - El reloj `🕐 9:32 AM` está siempre visible al lado, en zona horaria SV forzada con `Intl.DateTimeFormat` + `TZ_SV`
  - Si la última interacción fue antes de hoy 8 AM, el contador arranca desde las 8 AM (no desde ayer)
- **Filtro Rápido de Asesor** — chips con conteo. El chip del propio vendedor se destaca con `ring-2 ring-blue-400 shadow-md` + ⭐. Banner sugerencia "👇 Tocá tu nombre para ver solo TUS clientes" cuando no hay nadie seleccionado (solo para no-Admin)
- **Banner del mapa** con 2 hints en azul/morado: "¿Armando una ruta?" → filtrá por zona / "¿Quién compra un producto?" → botón que cambia a tab Productos
- **Tarjetas de clasificación** A/B/C ahora se llaman **🔥 Prioridad Alta / 🔄 Mantener / 🚀 Activar**. Selección con color temático (rojo/ámbar/verde) + check ✓ + scale 105 + opacity 50 en las no seleccionadas. Banner sugerencia arriba con flecha animada cuando ninguna está seleccionada. `toggleFiltro` preserva `window.scrollY` para que no salte la página
- **Panel "⭐ ¿Cómo se ganan los puntos?"** muestra el listado de CONFIG_PUNTOS + ítem extra hardcoded "📞 Actualizar teléfono del cliente — 1 pt" (no va en el dropdown porque es automático)

## UI: formulario de visita

- Si resultado = "No se obtuvo contacto" O "Mensaje enviado sin respuesta" → aparece sub-formulario `bloque-contacto` con aviso azul "💡 Es posible que este cliente no tenga su número actualizado. Si lo corregís acá ganás +1 punto adicional"
- Si cliente tiene 3+ "No se obtuvo contacto" → `con-alerta` rojo aparece y obliga a corregir contacto

## UI: vista Auditoría (admin)

- Panel **📋 Tareas para SAP**: muestra correcciones pendientes. Las de HOY aparecen primero, con fondo ámbar + borde izquierdo grueso + badge "NUEVA" amarillo. Contador `X · Y hoy` cuando hay nuevas
- Panel **🔁 Reincidencias de contacto**
- Panel SAP (CARGAR VENTAS / CLIENTES)
- Estado de conexión
- Informe PDF mensual o por rango

## Pendientes conocidos

- Interacciones registradas con formulario viejo (pre-Fase 1) quedaron con `Resultado` vacío = 0 pts. Hay `migrarResultadosHistoricos` para reclasificarlas
- Hoja VENTAS: columna "Fecha Contab." tiene formato mezclado (texto vs número serie). No afecta cockpit/puntos
- Pendiente posible: badge "👥 X" también en cockpit del MES (mencionado por el usuario, dejado para después)

**Why:** Documentar para no perder el contexto cuando vuelva a esta máquina o sesión. La capa de puntos es el core; toda métrica gira alrededor del `Resultado` y `CONFIG_PUNTOS`.

**How to apply:** Antes de tocar cockpit, cálculo de meta, formulario de visita o cualquier UI del header → releer esta memoria. Si el usuario reporta "no se está sumando X punto", chequear primero `CONFIG_PUNTOS`, después el `Resultado` que el frontend mandó, después `Puntos[8]` en VISITAS.

Ver también [[project-deploy-flow]] para subir cambios, [[project-horario-laboral]] para reglas de horario, [[reference-clasp-scriptid]] para IDs, y [[feedback-ui-preferences]] para tono/estilo.
