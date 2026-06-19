---
name: reference-clasp-run-no-funciona
description: "clasp run falla en este proyecto — workaround con disparador temporal en doGet + curl, o usar el editor de Apps Script"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 2c2cd3d6-236d-4a49-9dbb-9a46a7d2f7bd
---

**`clasp run <function>` falla con `Script function not found. Please make sure script is deployed as API executable.`**

Causa: para que `clasp run` funcione hay que crear un deployment de tipo "API ejecutable" en el Apps Script, configurar OAuth via consola de Google Cloud y asociar credenciales. No está hecho en este proyecto (usa GCP por defecto, requiere habilitar API en navegador) y no vale la pena hacerlo solo para diagnósticos ocasionales.

## Workaround A: editor de Apps Script (manual, ~30s)

Para ejecutar una función ad-hoc validando datos:

1. Escribir la función en `Código.js` (acepta args o son hardcoded), terminar con `Logger.log(JSON.stringify(resultado, null, 2)); return resultado;`
2. `clasp push`
3. Pedirle al usuario que abra el editor: https://script.google.com/home/projects/1Xda83WzSYGx0fWnZbJPnsgUSgCSj7L4c85EtRlV3gVLXpHvSEX2jp7d9/edit
4. Seleccionar la función del dropdown → ▶ Ejecutar
5. Ver → Registros (o Ctrl+Enter)
6. Copiar el JSON al chat

**Después de usar la función diagnóstica, borrarla** del backend si fue one-off. No dejar funciones colgadas que envejecen mal.

## Workaround B: disparador temporal en doGet + curl (automatizable)

Para correr una función SIN intervención humana del lado del navegador. Documentado en CLAUDE.md del repo. Pasos:

1. Agregar un branch temporal en `doGet(e)` que detecte un query param de "tarea" y ejecute la función ad-hoc, devolviendo el JSON
2. `clasp push`
3. `clasp create-version "diagnóstico tmp"` → N
4. `clasp update-deployment AKfycby_YSlZF2UKH8fkKSjmhFaLxzmSeYQ_8SLHyUbvqGzz --versionNumber N` (preview, NO el de producción)
5. `curl 'https://script.google.com/macros/s/AKfycby_YSlZF2UKH8fkKSjmhFaLxzmSeYQ_8SLHyUbvqGzz/exec?tarea=miFn&cb=<random>'`
6. **BORRAR el branch del doGet, hacer push y promover de nuevo** — no dejar el disparador colgado, es un riesgo de seguridad

Usar el workaround A para una validación rápida, el B solo si necesitás capturar el resultado en un script o iterar muchas veces.

Ver [[project-deploy-flow]] para la sintaxis de clasp create-version + update-deployment.
