---
name: reference-clasp-scriptid
description: "IDs de Apps Script, deployments, versión actual en prod y URL pública donde está embebido el CRM CDES"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 2c2cd3d6-236d-4a49-9dbb-9a46a7d2f7bd
---

**Proyecto Apps Script**
- scriptId: `1Xda83WzSYGx0fWnZbJPnsgUSgCSj7L4c85EtRlV3gVLXpHvSEX2jp7d9`
- Editor: https://script.google.com/home/projects/1Xda83WzSYGx0fWnZbJPnsgUSgCSj7L4c85EtRlV3gVLXpHvSEX2jp7d9/edit
- Archivos tracked por clasp: `appsscript.json`, `Código.js`, `Index.html`
- clasp local: v3.3.0
- `.clasp.json` con `rootDir` apuntando a `c:\Users\CDES\Documents\CRM CDES CODE`

**Deployments**
- `AKfycby_YSlZF2UKH8fkKSjmhFaLxzmSeYQ_8SLHyUbvqGzz` → `@HEAD` (dev/preview, URL termina en `/dev`)
- `AKfycbzHuce-FNFVOD0Yq2vbyHbokzAELgsDRIp7zwwPbRVZWtGwBV0adgpsGas9KlaTXGwEVw` → **producción** (el del iframe). Última versión publicada: **@123** (2026-06-18)

**Web pública donde está embebido**
- https://www.corpodent.net/crm/ — iframe con src apuntando al deployment de producción
- URL del exec en el iframe: `https://script.google.com/macros/s/AKfycbzHuce-FNFVOD0Yq2vbyHbokzAELgsDRIp7zwwPbRVZWtGwBV0adgpsGas9KlaTXGwEVw/exec`

**Planillas de datos**
- Base Clientes (CRM, operación): `14WJaC8VkcYAXIiO65Q9DDXh9RXhdUSg8120_L9mG9YY` — https://docs.google.com/spreadsheets/d/14WJaC8VkcYAXIiO65Q9DDXh9RXhdUSg8120_L9mG9YY
- Base Ventas (SAP): `184yrmB_4BRtVWKAvGYNC3Y3qNsoN0x6DSKLme0kfdXw` — https://docs.google.com/spreadsheets/d/184yrmB_4BRtVWKAvGYNC3Y3qNsoN0x6DSKLme0kfdXw

**Equipo y usuarios**
- 8 vendedores activos. El Salvador, zona horaria GMT-6.
- Login por PIN contra `USUARIOS_AJUSTES` (no usa `Session.getActiveUser()`)

Para el flujo de promoción de versiones, ver [[project-deploy-flow]]. Para qué hace cada función actual, ver [[project-features-actuales]]. Para git/GitHub, ver [[reference-github-repo]].
