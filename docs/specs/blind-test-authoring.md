**Status:** DELIVERED | **Date:** 2026-07-12

## Review Summary

> Se añade un **carril independiente de autoría de tests** al feature-flow: un `tester` en modo `author-from-ac` que deriva los tests desde los AC (`01-plan.md § Task List`) y los sketches de interfaz de Stage 1, **ciego a la implementación**, corriendo en paralelo con Phase 2. Phase 3 ejecuta la implementación contra esa suite intención-derivada, y ese resultado es la señal de aceptación que consume el veredicto de cobertura-AC de `qa`. Phase 2.7 se convierte de re-autoría a **gap-check + integración**: verifica que la suite ciega cubra cada AC, la integra a la rama, y añade solo los edges revelados por la implementación — nunca re-autora tests de AC. La ceguera es aislamiento de insumos (worktree físico separado en el caso paralelo), no de ubicación final. El riesgo principal es multi-site false-green — un carril declarado en un sitio pero stale en otro deshace el contrato en silencio; se mitiga reconciliando todos los sitios en el mismo PR y fijándolos con una suite estructural (Suite 151) de aserciones positivas y negativas.

**Tasks:** 5 | **Services:** team-harness (plugin distribution) | **Estimated complexity:** complex

### Decisions for human review
- **Ceguera física vs por-prompt (caso `parallel-blind`)** — para correr genuinamente en paralelo con el implementer, el tester ciego se despacha en un **worktree separado cortado del base ref del task** (la implementación literalmente no existe en ese árbol), no en el worktree del implementer. Coste: +1 worktree por task-en-vuelo en una ronda paralela. Alternativa descartada: mismo worktree + solo exclusión-por-prompt (dependiente de cumplimiento de prompt, clase de fiabilidad ~40% que el KG advierte). → decided as worktree físico
- **Diseño del fallback de 3 vías (AC-4)** — el predicado no es binario: `parallel-blind` (hay sketch de interfaz), `serial-blind` (sin sketch pero AC de superficie pública derivable → test-first serial) e `impl-aware` (AC estructural/interno → autoría post-implementación como hoy). Las dos últimas son los dos fallbacks que el operador nombró en Discover, ahora con un predicado que decide cuál. → decided as 3-way
- **Namespace de la suite ciega (dedup por capa)** — la suite ciega vive en un namespace de aceptación (convención del repo; por defecto `tests/acceptance/` o `*.acceptance.test.*`), separado de los unit tests internos del implementer, para evitar colisión de rutas en la integración de Phase 2.7. → decided as namespace-separado
- **Alcance solo feature-flow** — el bug-flow ya tiene separación generador/evaluador (Phase 2.0 fails-first); el carril ciego y la conversión de 2.7 son **solo** feature-flow. Phase 2.0 y la 2.7 del bug-flow quedan intactas. → decided as feature-only

### Proposed Approach
Nuevo carril `tester` modo `author-from-ac` despachado en paralelo con Phase 2, ciego a la implementación (insumos: solo AC + sketches de Stage 1 + convenciones de test del repo). Un predicado por-task declarado por el architect en el plan (`Blind-authorable: parallel-blind | serial-blind | impl-aware`) decide el modo; la orquestación registra el modo elegido en `00-state.md` + eventos (nunca skip silencioso). Phase 2.7 se convierte a gap-check + integración de la suite ciega; Phase 3 corre la implementación contra la suite ciega integrada como señal de aceptación. Alternativa material considerada y descartada: ceguera solo-por-prompt en el árbol compartido (más barata pero no estructuralmente verificable). El operador ya confirmó la forma funcional en Discover; las decisiones internas se listan arriba para revisión en STAGE-GATE-1, no como bifurcación de enfoque.

### Confidence Score
**Confidence:** 7/10 (single-pass)
- Spec clarity: los 10 AC son específicos y el operador confirmó las tres direcciones de diseño en Discover — alta claridad.
- Prior art: existen precedentes fuertes a imitar (Phase 2.0 generador/evaluador del bug-flow; el gate de decomposición intra-task para despacho paralelo; el patrón `Lane-decomposable` declarado por el architect) — reduce la incertidumbre.
- Blast radius: 8 archivos de prompt/docs + 1 suite estructural, todos con contrato multi-site que debe coincidir token-a-token — este es el factor que baja el número: el riesgo real es la reconciliación multi-site, no la lógica de ningún sitio individual.

### Patterns to Mirror
- `agents/orchestrator.md:1934` — `### Intra-task execution-lane decomposition` — patrón de despacho paralelo de subagentes en un mismo mensaje Task + gate declarado por el architect + fallback nunca-silencioso; el carril ciego reutiliza exactamente esta forma.
- `agents/tester.md:43` — `## Pre-Fix Regression Test Mode` — precedente de separación generador/evaluador (test autorado antes de que el implementer corra); `author-from-ac` es su análogo feature-flow.
- `agents/tester.md:164` — `## Mode: authoring` — el modo que se convierte a gap-check; espejo de dónde y cómo declarar un modo de tester.
- `docs/testing.md:73` (Suite 38) y `docs/testing.md:667` (Suite 144) — forma canónica de una suite estructural anchor-scoped con guard auto-referencial; Suite 151 la imita.

### Risks
| Risk | Severity | Mitigation |
|------|----------|------------|
| Multi-site false-green: un sitio del contrato queda stale y deshace la ceguera/señal en silencio | high | Todos los sitios se reconcilian en el mismo PR; Suite 151 fija cada sitio con aserciones positivas Y negativas (anchor-scoped, `_slice_section`) |
| Ceguera dependiente de prompt (el tester lee el source aunque se le diga que no) | medium | Caso `parallel-blind` corre en worktree físico separado del base ref — la implementación no está en ese árbol; Suite 151 asserta la exclusión en el payload de despacho |
| Incoherencia del verification-packet: hoy el packet embebe el artefacto de 2.7 (AC→test map) | medium | La conversión de 2.7 mantiene el output `03-testing.md` y sigue corriendo+registrando la suite; el packet se construye en el cierre de 2.7 y captura la suite integrada; se actualiza `docs/verification-packet.md § 2` |
| Desync en `parallel-blind` sin sketch (tester e implementer derivan superficies distintas) | medium | El predicado enruta ese caso a `serial-blind` (test-first): el implementer conforma a los tests ya autorados, eliminando el desync |
| Coste: +1 tester sonnet por task-en-vuelo | low | Bounded por ronda (1 carril ciego por task, determinista, no un fan-out); gap-check de 2.7 suele ser más barato que autoría completa |

### Trade-offs
- Se eligió **worktree físico** para `parallel-blind` sobre exclusión-solo-por-prompt: paga overhead de worktree a cambio de ceguera estructuralmente verificable (testeable), que es el punto entero de la feature.
- Se eligió **parametrizar el modo `authoring` existente** (`blind_suite: present|absent`) sobre crear un tercer modo nuevo: menos superficie de agente, y la 2.7 del bug-flow / del fallback `impl-aware` reutiliza el comportamiento de hoy sin bifurcarse.
- Se eligió **alcance solo feature-flow** sobre unificar bug+feature: el bug-flow ya resuelve la independencia con Phase 2.0; tocar su 2.7 sería regresión de alcance sin beneficio.
- Se dejó `acceptance-checker` (Phase 3.6) **sin tocar**: valida drift plan-vs-implementación, no la procedencia de la señal de test; incluirlo sería scope-creep.

### Classification block
- touches_http_api: false
- touches_ui: false
- touches_data_model: false
- touches_cli: false
- touches_public_lib_api: false
- touches_async_messaging: false
- destructive: false
- spans_multiple_services: false

*(Cambio solo de prompts/docs del propio team-harness — ningún booleano de superficie runtime dispara. No se genera ningún `sketches/*` condicional. Esto es, reflexivamente, evidencia del caso mainstream sin-sketch que el predicado AC-4 debe manejar como primera clase: esta misma feature, corrida por el nuevo pipeline, sería `serial-blind` — la suite estructural Suite 151 es la "acceptance test autorada desde los AC VERIFY".)*

### Multi-site invariants

| Invariant | Site | File | Anchor / field |
|-----------|------|------|----------------|
| Contrato de ceguera (exclusiones de insumos) | dispatch payload | `agents/orchestrator.md` | `## Phase 2.3 — Blind Test Authoring` |
| Contrato de ceguera (exclusiones de insumos) | inputs del modo | `agents/tester.md` | `## Mode: author-from-ac` |
| Contrato de ceguera (exclusiones de insumos) | aserción estructural | `tests/test_agent_structure.py` | Suite 151 |
| Señal de aceptación = suite ciega intención-derivada | definición | `agents/orchestrator.md` | `## Phase 3 — Verify` |
| Señal de aceptación = suite ciega intención-derivada | declaración del modo | `agents/tester.md` | `## Mode: author-from-ac` |
| Señal de aceptación = suite ciega intención-derivada | unit-tests-no-son-señal | `agents/implementer.md` | `### Unit tests are not the acceptance signal` |
| Señal de aceptación = suite ciega intención-derivada | nota de consumo | `agents/qa.md` | `### Validate Mode` (Immutable artifact invariant) |
| Phase 2.7 = gap-check (feature-flow, blind-suite-present) | sección de fase | `agents/orchestrator.md` | `## Phase 2.7 — Test Authoring` |
| Phase 2.7 = gap-check (feature-flow, blind-suite-present) | comportamiento del modo | `agents/tester.md` | `## Mode: authoring` |
| Phase 2.7 = gap-check — bug-flow 2.0/2.7 **MUST NOT change** | tabla de fases fix | `agents/ref-special-flows.md` | `### Phase structure (type: fix)` rows 2.0 / 2.7 |
| Phase 2.7 = gap-check (coherencia del packet) | Test Artifact | `docs/verification-packet.md` | `## 2. Packet content contract` (Test Artifact row) |
| Identidad de Phase 2.3 | Phase Dispatch Reference | `agents/orchestrator.md` | `## Phase Dispatch Reference` |
| Identidad de Phase 2.3 | Phase Checklist template | `agents/orchestrator.md` | `## Phase Checklist` |
| Identidad de Phase 2.3 | `phase` enum + campos de estado | `agents/orchestrator.md` | `## Current State` (`phase:`, `blind_test_mode`, `blind_worktree*`) |
| Identidad de Phase 2.3 | phase-id de observabilidad | `docs/observability.md` | state-phase enum reference |
| Registro de suite estructural | one-liner canónico | `docs/testing.md` | `### Suite 151 — blind-test-authoring` |

**Por qué existe este bloque:** delivery Step 9.4a lee esta tabla y verifica que cada sitio listado contenga un valor consistente. Las filas del bug-flow (`ref-special-flows.md` rows 2.0/2.7) están fenceadas como **MUST NOT change** — la conversión de 2.7 es feature-flow only; delivery verifica que la 2.0/2.7 del bug-flow queden intactas.
