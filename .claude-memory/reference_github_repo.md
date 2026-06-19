---
name: reference-github-repo
description: "Repo GitHub del CRM CDES, branch principal y aviso de que el usuario trabaja en 2 máquinas"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 2c2cd3d6-236d-4a49-9dbb-9a46a7d2f7bd
---

**Repo**: https://github.com/romanvilaseca/CRM.git
**Branch principal**: `main` (NO `master`)
**Identidad git**: `Roman Vilaseca <romanvilaseca@gmail.com>`

## Aviso: el usuario trabaja en 2 máquinas

Confirmado el 2026-06-18: hay (al menos) dos máquinas que tocan este repo:
- **Esta máquina** (casa, Documents/CRM CDES CODE) — quedó sin commits desde 2026-06-03
- **Otra máquina** (oficina, sin acceso remoto) — donde hicieron todos los commits de hoy 2026-06-18 (Fase 1/2/3/4 de puntos, reincidencias, modal de ponderación, etc.)

Por eso GitHub `origin/main` puede tener commits que el local nunca vio. Antes de empezar a trabajar:

```
git fetch origin
git status
git log --oneline HEAD..origin/main   # ¿hay commits nuevos en GitHub?
```

Si hay commits nuevos en GitHub, hacer `git pull` antes de tocar nada. Si la máquina quedó en `master` (caso histórico), recordar que la rama buena es `main` — ver el episodio del 2026-06-18 donde local estaba en `master` con historia divergente sin ancestro común. Solución aplicada: backup en `master-backup-2026-06-18` y crear `main` desde `origin/main`.

## Aviso: las memorias de Claude Code son locales por máquina

Las memorias viven en `C:\Users\<usuario>\.claude\projects\c--Users-...\memory\` y NO se sincronizan automáticamente entre las dos máquinas. La otra máquina probablemente tiene un MEMORY.md más completo con memorias sobre el sistema de puntos, reincidencias, etc. Las de esta máquina están reconstruidas a partir de `CLAUDE.md` del repo y los commits.

Si en algún momento accedés a la otra máquina, copiar `C:\Users\CDES\.claude\projects\c--Users-CDES-Documents-CRM-CDES-CODE\memory\` desde allá pisa estas memorias con las más completas. Vale la pena comparar antes de pisar.

## Convenciones de commit observadas en el repo

- Mensaje corto descriptivo, en español, sin prefijos tipo `feat:` / `fix:`
- Ejemplos reales: "Modal de ponderacion de puntos (admin) + bono +1 por corregir telefono", "Forzar correccion de contacto tras 3 intentos sin respuesta antes de marcar otro sin-contacto"
- Sin tildes en los mensajes de commit (probablemente para evitar problemas de encoding)

Ver [[project-deploy-flow]] para subir a producción después de pushear.
