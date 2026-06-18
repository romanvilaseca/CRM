# CRM CDES / CORPODENT — Contexto del proyecto

CRM en **Google Apps Script** (clasp) para el equipo de ventas de **Corpodent (CDES)**, El Salvador (insumos dentales). 8 vendedores lo usan a diario. Zona horaria GMT-6.

## Archivos
- `Código.js` — backend Apps Script (servidor).
- `Index.html` — frontend (web app de una sola página, Tailwind por CDN).
- `appsscript.json` — manifiesto. Scopes: userinfo.email, spreadsheets, drive. Web app: `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`.
- `.clasp.json` — scriptId.

## Backends (2 Google Sheets)
- **SHEET_ID_VENTAS** `184yrmB_4BRtVWKAvGYNC3Y3qNsoN0x6DSKLme0kfdXw` — ventas tipo SAP (CSV importado).
- **SHEET_ID_CRM** `14WJaC8VkcYAXIiO65Q9DDXh9RXhdUSg8120_L9mG9YY` — operación. Pestañas:
  - `CLIENTES_ASIGNADOS` (hoja 0) — cartera: `#, Código(CL-XXXX), Cliente, Dirección, Municipio, Departamento, Tel1, Tel2, Vendedor, Tipo Cli`.
  - `USUARIOS_AJUSTES` — `Correo_Gmail[0], Rol[1], Porcentaje_Comision[2], Estado[3], Nombre_SAP/alias[4], PIN_Acceso[5], ultimoAcceso[6], meta_diaria_clientes[7]`.
  - `VISITAS` — interacciones. Columnas (0-idx): `Fecha[0], Vendedor email[1], Código[2], Cliente[3], Tipo de Interacción[4], Nota[5], GPS[6], Resultado[7], Puntos[8], Origen_Puntaje[9]`.
  - `CONFIG_PUNTOS` — editable: Resultado → Puntos.
  - `METAS_USUARIO` — editable: `Vendedor(correo), Meta puntos, Meta llamadas, Meta WhatsApp, Meta visitas`.
  - `CORRECCIONES_CONTACTO` — staging para corregir teléfonos en SAP (cola de tareas).
  - `DEMANDA_NO_CUBIERTA` — productos pedidos sin stock.
  - `METADATA_SISTEMA` — fechas de carga. (`INTERACCIONES`, `METADATA`, `Hoja 2` son legacy/vacías, no tocar.)

## Login e identidad
No usa `Session.getActiveUser()`. Login por **PIN**: `verificarAccesoUsuario(email, pin)` contra USUARIOS_AJUSTES. El email vive en frontend como `usuarioLogueado` y se pasa a las funciones. Mapeo correo→alias: `getAliasMap()`.

## Sistema de puntos (por RESULTADO, no por canal)
Tipo de interacción = canal (Visita/Llamada/WhatsApp/Mostrador). Resultado = desenlace. Esquema vigente en CONFIG_PUNTOS:
Pedido/venta cerrada=3, Cotización=1, Pedido pendiente=1, Contacto efectivo=1, Cliente completo=0.5, Producto no disponible=0.5, Mensaje sin respuesta=0, No se obtuvo contacto=0.
Meta diaria fijada en **30 puntos** para todos (editable por vendedor). El cockpit mide PUNTOS (no clientes únicos).

## Funciones clave nuevas
- `obtenerRendimientoUsuario/Equipo`, `obtenerDesglosePuntosDia`, `generarDesglosePuntosPDF`.
- `obtenerListadosAdmin` (sin contacto / en riesgo / cartera abandonada en una pasada, reusa `obtenerMisClientes`), `obtenerDemandaDetalle`, `obtenerTareasSAP`, `obtenerResumenDemanda`.
- Metas: `obtenerMetasEquipo`, `guardarMetasUsuario`, `ajustarMetaPuntosTodos`.
- Setup idempotente: `inicializarFase1/2/34`, `migrarResultadosHistoricos` (backfill, marca `inferido`).

## Despliegue (IMPORTANTE)
- `clasp run` NO funciona (proyecto usa GCP por defecto; requiere habilitar API en navegador). Ver memoria `crm-deploy-clasp-process`.
- Para correr funciones de servidor una vez: técnica de **disparador temporal en doGet + despliegue web temporal + curl + borrar**.
- Publicar a usuarios: `clasp create-version` → `clasp update-deployment <ID @96> --versionNumber N`. El deployment publicado (la URL que usan los 8) es `AKfycbzHuce-FNFVOD0Yq2vbyHbokzAELgsDRIp7zwwPbRVZWtGwBV0adgpsGas9KlaTXGwEVw`.
- Verificar en vivo: `curl .../exec?cb=<random>` (usar cache-buster; el borde de Google cachea tras redeploy).
- GitHub: `https://github.com/romanvilaseca/CRM.git` (rama `main`). Identidad git: `Roman Vilaseca <romanvilaseca@gmail.com>`.

## Pendiente conocido
Las interacciones registradas con el formulario viejo (antes de publicar Fase 1) quedaron con Resultado vacío = 0 pts. Se puede correr una reclasificación si se desea.
