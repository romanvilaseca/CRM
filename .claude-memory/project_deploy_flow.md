---
name: project-deploy-flow
description: Flujo para desplegar cambios del CRM CDES a producción — push + create-version + update-deployment (sintaxis clasp 3.x). Producción actual = v115
metadata: 
  node_type: memory
  type: project
  originSessionId: 2c2cd3d6-236d-4a49-9dbb-9a46a7d2f7bd
---

El CRM está embebido como **iframe** en https://www.corpodent.net/crm/. El src del iframe apunta a un deployment **fijo** de Apps Script: `AKfycbzHuce-FNFVOD0Yq2vbyHbokzAELgsDRIp7zwwPbRVZWtGwBV0adgpsGas9KlaTXGwEVw` (última versión publicada **@123** al 2026-06-18).

Hay 2 deployments en el proyecto Apps Script (scriptId `1Xda83WzSYGx0fWnZbJPnsgUSgCSj7L4c85EtRlV3gVLXpHvSEX2jp7d9`):

- `AKfycby_YSlZF2UKH8fkKSjmhFaLxzmSeYQ_8SLHyUbvqGzz` → `@HEAD` (dev/preview, refleja `clasp push` al instante, URL termina en `/dev`)
- `AKfycbzHuce-FNFVOD0Yq2vbyHbokzAELgsDRIp7zwwPbRVZWtGwBV0adgpsGas9KlaTXGwEVw` → **producción** (el que está en el iframe). Apunta a una versión congelada — `clasp push` solo NO actualiza esto.

**Why:** El usuario reportó "no cambió nada" tras un `clasp push`. Causa: el iframe apunta al deployment de producción que está en versión congelada, no a @HEAD. El push actualiza el código pero los usuarios no lo ven hasta promover una nueva versión a ese deployment ID.

**How to apply:** Para que los cambios lleguen a los usuarios reales, hacer los 3 pasos con **sintaxis clasp 3.x**:

```
clasp push                                                                              # si cambias appsscript.json: clasp push --force
clasp create-version "descripción del cambio"                                          # devuelve el número N
clasp update-deployment AKfycbzHuce-FNFVOD0Yq2vbyHbokzAELgsDRIp7zwwPbRVZWtGwBV0adgpsGas9KlaTXGwEVw --versionNumber N
```

Nota: en clasp <3 era `clasp version` + `clasp deploy --deploymentId X --versionNumber N`. En clasp 3.3.x cambió a `clasp create-version` + `clasp update-deployment <ID> --versionNumber N`.

Después de promover, el usuario debe hacer `Ctrl+Shift+R` en su web para saltar caché del iframe. Verificar en vivo con `curl https://script.google.com/macros/s/<ID>/exec?cb=<random>` (cache-buster — el borde de Google cachea unos segundos tras redeploy).

## Probar antes de promover

Para probar `@HEAD` SIN romper a los usuarios: abrir el URL `/dev` del deployment de preview directamente (`https://script.google.com/macros/s/AKfycby_YSlZF2UKH8fkKSjmhFaLxzmSeYQ_8SLHyUbvqGzz/dev`). No funciona si lo abrís a través del iframe de corpodent.net — el iframe carga el de producción.

## Casos especiales

**Cambio en `appsscript.json` (oauthScopes, runtime, etc):** `clasp push` falla con "Skipping push" — hay que usar `clasp push --force`. Esto es por diseño para evitar romper el manifest sin querer.

**Agregar un OAuth scope nuevo:** Después de promover la versión, el dueño del script DEBE abrir el editor (https://script.google.com/home/projects/.../edit), ejecutar manualmente una función que use el scope nuevo (ej. la primera vez que se agregó `drive`, ejecutar `generarInformeMensualPDF` desde el dropdown del editor), y aceptar los permisos en el popup. Sin esto, la función falla en producción con "Los permisos especificados no son suficientes para llamar a X". Pasó al agregar `https://www.googleapis.com/auth/drive` para los PDFs.

Ver también [[reference-clasp-scriptid]] para los IDs y URLs, [[reference-clasp-run-no-funciona]] para validar datos sin clasp run, y [[reference-github-repo]] para el flujo git.
