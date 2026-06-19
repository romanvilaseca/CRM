# Memorias de Claude Code

Estas son las memorias de **Claude Code** para el proyecto CRM CDES. Viven aquí (en el repo) como **espejo** de las memorias reales que Claude Code lee desde el filesystem local.

## Ruta real donde Claude Code las lee

```
%USERPROFILE%\.claude\projects\c--Users-CDES-Documents-CRM-CDES-CODE\memory\
```

Ejemplo en esta máquina: `C:\Users\CDES\.claude\projects\c--Users-CDES-Documents-CRM-CDES-CODE\memory\`

## Cómo sincronizar entre máquinas

### En otra máquina (oficina), después de `git pull`:

```powershell
# PowerShell
$src = ".claude-memory\*"
$dst = "$env:USERPROFILE\.claude\projects\c--Users-CDES-Documents-CRM-CDES-CODE\memory"
New-Item -ItemType Directory -Force -Path $dst
Copy-Item -Path $src -Destination $dst -Force
```

```bash
# Git Bash
mkdir -p "$HOME/.claude/projects/c--Users-CDES-Documents-CRM-CDES-CODE/memory"
cp -v .claude-memory/*.md "$HOME/.claude/projects/c--Users-CDES-Documents-CRM-CDES-CODE/memory/"
```

### Antes de cerrar sesión / hacer commit, copiar memorias actualizadas de vuelta al repo:

```powershell
# PowerShell
$src = "$env:USERPROFILE\.claude\projects\c--Users-CDES-Documents-CRM-CDES-CODE\memory\*.md"
Copy-Item -Path $src -Destination ".claude-memory\" -Force
git add .claude-memory && git commit -m "Sync memorias Claude Code"
```

## Por qué este flujo (y no symlink)

- **Symlink** sería más limpio pero requiere `mklink /D` con admin o Developer Mode en Windows. Friction alta.
- **Copy manual** es portable, no requiere permisos especiales, y el git diff te muestra qué cambió entre sesiones.

## Tipos de memoria

Ver `MEMORY.md` para el índice. Hay 4 tipos: `user`, `feedback`, `project`, `reference`. Cada archivo tiene frontmatter con `name`, `description`, `metadata.type`.

## ¿Repo público o privado?

Estas memorias contienen IDs de Apps Script, sheet IDs y rutas internas — **no compartir si el repo se vuelve público**. El repo `github.com/romanvilaseca/CRM` está marcado privado a 2026-06-18.
