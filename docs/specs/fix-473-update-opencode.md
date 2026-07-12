**Status:** DELIVERED | **Date:** 2026-07-12

## Review Summary

**Problema.** El issue #473 reporta dos defectos en `bin/update-opencode.sh`: (1) el bit de ejecución no está trackeado en git (modo `100644`), por lo que la invocación documentada `./bin/update-opencode.sh` falla con "Permission denied"; (2) el guard de TTY en la línea 186 verifica solo existencia (`[ -e /dev/tty ]`) antes de redirigir `</dev/tty` en la línea 187 — en shells sin terminal de control (Bash agéntico, CI, cron) el nodo `/dev/tty` puede existir pero no ser abrible, y la redirección falla con "No such device or address" DESPUÉS de completar la descarga y la verificación de checksum.

**Alcance verificado (re-confirmado contra `main` @ 33764bc, 2026-07-12).**
- `git ls-files -s bin/install.sh bin/install-opencode.sh bin/update-opencode.sh` → los tres en modo `100644`.
- `bin/update-opencode.sh:186-190` — `if [ -e /dev/tty ]; then ... </dev/tty; else ...; fi` (la rama sin-redirect YA EXISTE como fallback).
- `bin/install.sh:72-75` — mismo patrón exacto.
- `bin/install-opencode.sh:144-148` y `:151-156` — mismo patrón, dos sitios.
- Los 4 sitios corren bajo `#!/bin/sh`, que en Debian/Ubuntu (target primario de estos scripts) resuelve a dash.
- SEC-001 (falta de verificación SHA256 en bootstrap scripts) es hallazgo preexistente, trackeado en KG, explícitamente fuera de alcance.

**Fix propuesto (validado contra el árbol, adoptado del issue + patrón KG existente `bubbletea-tui-piped-stdin-paste-fix-pattern`).**
1. `git update-index --chmod=+x bin/install.sh bin/install-opencode.sh bin/update-opencode.sh`.
2. Reemplazar el guard `[ -e /dev/tty ]` (existencia) por un test de aperturabilidad en los 4 sitios, usando `(exec < /dev/tty) 2>/dev/null` — verificado empíricamente que la forma `{ : < /dev/tty; }` (special builtin POSIX) es fatal bajo dash sin terminal de control.

**Confidence:** 9/10.

### Decisions for human review
No hay decisiones de juicio humano pendientes — el fix es mecánico y sigue un patrón ya establecido en el repo, sin trade-offs de diseño.
