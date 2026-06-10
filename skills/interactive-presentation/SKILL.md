---
name: interactive-presentation
description: Generate interactive web presentations with React Flow graphs, GSAP animations, and SVG visuals. Use when the user wants to create a visual, interactive presentation that goes beyond static slides — showing architecture flows, animated processes, or data visualizations.
---

# Interactive Presentation Creator

Generate interactive web presentations that combine React Flow graphs, GSAP animations, and SVG illustrations. Output is a self-contained Vite + React project that runs with `npm run dev` and builds to static HTML.

---

## When To Use This Skill

- User wants to explain a system architecture interactively (nodes you can click through)
- User wants animated visualizations of processes (data flow, deployment pipelines, request lifecycle)
- User provides an image/screenshot and wants it turned into an interactive version
- User wants a technical presentation that is more engaging than static slides
- User wants to combine diagrams, animations, and narrative text in one deliverable

**Do NOT use** for: static slide decks (use markdown/reveal.js), print documents, non-visual documentation.

---

## Modes

### `new` — Scaffold a New Presentation

Invoked when the user has no existing project. Creates the full template and generates the first scene.

**Steps:**

1. Determine the target directory. Ask the user or use the current working directory + a name derived from the topic.
2. Copy the entire `references/templates/` tree into the target directory.
3. Analyze the user's input (image, description, or both) to determine what type of scenes are needed.
4. Generate the first scene(s) based on the input:
   - If the input shows a graph/flow/architecture → generate a `FlowSceneData` with nodes, edges, and highlight steps.
   - If the input describes a process/animation → generate an `AnimatedSceneData` with a custom component.
   - If the input is narrative/textual → generate a `SlideSceneData` with HTML content.
5. Update `src/App.tsx` (or create `src/data/presentation.ts`) with the scene configuration.
6. If custom scene components were generated, place them in `src/components/scenes/`.
7. Run `npm install && npm run build` to validate the project compiles.
8. Report the result with instructions for `npm run dev`.

### `add-scene` — Add a Scene to an Existing Project

Invoked when the user has an existing presentation and wants to add content.

**Steps:**

1. Read the existing project structure — find `src/data/presentation.ts` or the scene config in `App.tsx`.
2. Analyze the user's input for the new scene.
3. Generate the new scene data and any custom components.
4. Append the scene to the existing `scenes` array.
5. Run `npm run build` to validate.
6. Report what was added.

### `from-ppt` — Convert a PPT/Slide Deck into an Interactive Presentation

Invoked when the user has an existing slide deck (exported as images or screenshots) and wants to transform it into an interactive web presentation. Some slides remain static reproductions; others become fully interactive scenes.

**When to use:**

- User provides images of their slides (PNG/JPG exports from PowerPoint, Google Slides, Keynote, or screenshots)
- User wants to upgrade a traditional deck into a web-based interactive experience
- User specifies which slides should be interactive and which should stay as-is

**What the user provides:**

1. **Slide images** — one image per slide (PNG or JPG). Provided as file paths, pasted images, or referenced by slide number.
2. **Interactivity instructions** — which slides to make interactive and what kind of interactivity. Examples:
   - "Slide 3: make it a clickable flow diagram"
   - "Slides 5-7: animate the process step by step"
   - "Slide 10: add a selector that filters the data"
   - No instruction for a slide = treat as static

**Steps:**

1. **Scaffold the project.** Copy the `references/templates/` tree into the target directory (same as `new` mode). Run `npm install`.

2. **Catalog the slides.** For each provided image, classify it:
   - **Static** — no interactivity requested by the user
   - **Interactive** — user explicitly requested interactivity for this slide

3. **Process static slides.** For each static slide, decide the reproduction strategy:

   | Slide content | Strategy | Rationale |
   |---|---|---|
   | Mostly text with simple layout (title + bullets, title + paragraph) | **Recreate in HTML/CSS** — generate a `SlideSceneData` with Tailwind-styled content | Lighter bundle, consistent theming, scales to any resolution |
   | Simple chart or diagram that you can faithfully reproduce in SVG/HTML | **Recreate in HTML/CSS/SVG** | Better quality than a raster image at all screen sizes |
   | Complex graphics, photos, dense charts, screenshots, or branded visuals | **Embed as background image** — save the image to `src/assets/slides/` and render it as a full-viewport background in a `SlideSceneData` | Preserves visual fidelity without attempting error-prone recreation |

   For embedded images, the `SlideSceneData.content` uses:
   ```html
   <div class="w-full h-full flex items-center justify-center">
     <img src="/src/assets/slides/slide-{N}.png" alt="Slide {N}" class="max-w-full max-h-full object-contain" />
   </div>
   ```

4. **Process interactive slides.** For each interactive slide:
   a. Analyze the image to identify the visual structure (same process as §Image Interpretation above).
   b. Determine the scene type based on the user's instructions and the visual content:
      - "clickable diagram / flow / architecture" → `FlowSceneData` with React Flow nodes, edges, and highlight steps
      - "animate / step by step / transition" → `AnimatedSceneData` with a GSAP-powered custom component
      - "selector / filter / toggle / interactive controls" → `AnimatedSceneData` with Radix UI controls
      - Mixed → multiple scenes (split the slide into logical parts)
   c. Generate the full scene implementation — custom component in `src/components/scenes/`, scene data in `presentation.ts`.
   d. Interactive slides are ALWAYS fully recreated as React components. Never use the image as a base with overlays.

5. **Configure navigation.** Build the `scenes` array in `src/data/presentation.ts` preserving the original slide order. Each entry gets:
   - `id`: `slide-{N}` for static slides, descriptive kebab-case for interactive (e.g., `auth-flow`, `deploy-animation`)
   - `title`: extracted from the slide image or provided by user
   - `subtitle`: brief context (optional)

6. **Copy slide assets.** Save static slide images to `src/assets/slides/` with naming convention `slide-{N}.{ext}` (1-indexed, matching original deck order).

7. **Validate.** Run `npm run build` — must succeed with no TypeScript or build errors.

8. **Report.** List which slides became static reproductions (and which strategy was used) vs. which became interactive scenes. Include `npm run dev` instructions.

**Decision criteria for static-slide strategy (detailed):**

- **Text density ≤ 60%** of slide area AND no complex graphics → recreate in HTML
- **Contains charts/diagrams** that are standard shapes (boxes, arrows, circles) → recreate in SVG/HTML
- **Contains photos, complex branded graphics, dense data visualizations, or pixel-level detail** → embed image
- **When in doubt** → embed image (safer; avoids imperfect recreations that look worse than the original)

**Handling edge cases:**

- If a user marks a text-only slide as interactive ("animate the bullets appearing") → treat as `AnimatedSceneData` with GSAP stagger animations, not as static.
- If slide images are low resolution → embed and add `image-rendering: auto` CSS; note the limitation to the user.
- If the user does not provide explicit interactivity instructions → ask which slides should be interactive before proceeding. Do not assume.

---

## Image Interpretation

When the user provides an image (screenshot, whiteboard photo, diagram):

1. **Identify the visual type:**
   - Boxes connected by arrows → `flow` scene (React Flow)
   - Sequential steps with motion/time implied → `animated` scene (GSAP)
   - Static layout with text and visuals → `slide` scene
   - Mixed (some parts are graphs, some are animated) → multiple scenes

2. **Extract structure:**
   - Identify nodes/entities (boxes, circles, labels)
   - Identify connections (arrows, lines, data flow direction)
   - Identify groupings (color zones, dashed borders, labels like "Frontend", "Backend")
   - Identify sequence (numbered steps, arrow directions, implied reading order)

3. **Map to code:**
   - Each identified entity → a React Flow node (for flow scenes) or SVG element (for animated scenes)
   - Each connection → an edge (flow) or a GSAP motion path (animated)
   - Each group → a parent node (flow) or a layer group in SVG (animated)
   - Colors from the image → mapped to the closest `scene-*` theme color

4. **Enhance beyond the image:**
   - Add tooltips with explanatory text on nodes
   - Add highlight steps so the viewer can walk through the diagram
   - Add subtle animations (pulsing active nodes, flowing edges)
   - Add labels that were implied but not written in the original

---

## Reference Selection

Read the appropriate reference files based on what the scene requires:

| Scene needs | Read reference |
|---|---|
| Interactive graph with nodes/edges | `references/react-flow-patterns.md` |
| Timeline animation, transitions, motion | `references/gsap-patterns.md` |
| Custom shapes, icons, visual composition | `references/svg-patterns.md` |
| Interactive controls (selectors, sliders) | `references/radix-patterns.md` |
| File naming, directory layout | `references/project-structure.md` |

**Always read `project-structure.md`** to ensure correct file placement.

For API specifics not covered in the references, use context7 to fetch current documentation for:
- `@xyflow/react` — node types, edge types, hooks, event handlers
- `gsap` — specific plugin APIs, easing functions, timeline methods
- `@radix-ui/*` — component-specific props and patterns
- `tailwindcss` — utility classes and configuration

---

## Scene Generation Guidelines

### Flow Scenes (React Flow)

- Always define `nodes` with explicit `position: { x, y }` — use a grid system (see reference).
- Always define at least one edge between nodes.
- Add `data.tooltip` to nodes for hover information.
- Add `highlightSteps` when the graph has a logical sequence to walk through.
- Use custom node types (`service`, `decision`, `group`) for visual variety.
- Keep nodes ≤ 15 per scene — split into multiple scenes if larger.
- Position the graph to fit in the viewport at default zoom (test with `fitView`).

### Animated Scenes (GSAP)

- Create a dedicated component in `src/components/scenes/` for each animated scene.
- Use `gsap.context()` scoped to a ref for cleanup.
- Build the timeline in a `useEffect` with the scene ID as dependency.
- Animate transforms (x, y, scale, rotation) — never layout properties.
- Keep animations ≤ 8 seconds total (user attention span for auto-play).
- Provide play/pause/restart controls (the `AnimatedScene` wrapper handles this).
- Use stagger for lists and grids appearing sequentially.
- Use MotionPathPlugin for elements traveling along paths.

### Slide Scenes (Static HTML)

- Use Tailwind utilities inside the HTML content string.
- Center content vertically and horizontally.
- Use `<kbd>` for keyboard hints.
- Use `<code>` and `<pre>` for code examples.
- Keep text concise — slides should complement the interactive scenes, not replace them.

### SVG Composition

- Use `viewBox` for responsive scaling (no fixed width/height on the root `<svg>`).
- Layer content in `<g>` groups (background → connections → nodes → labels).
- Define reusable markers and patterns in `<defs>`.
- Add class names to elements that GSAP will animate.
- Use the theme colors from `tailwind.config.ts` (`#0f172a`, `#1e293b`, `#334155`, `#3b82f6`, etc.).

---

## Validation Checklist

After generating or modifying a presentation, verify:

- [ ] `npm install` succeeds without errors
- [ ] `npm run build` produces `dist/` without TypeScript or build errors
- [ ] All scene IDs are unique
- [ ] All React Flow node IDs are unique within their scene
- [ ] No Club-only GSAP plugins are imported (MorphSVG, SplitText, DrawSVG, etc.)
- [ ] Custom components in `scenes/` are properly imported where used
- [ ] The `scenes` array in the config has at least one entry
- [ ] Keyboard navigation works (ArrowLeft, ArrowRight, Space)

---

## Constraints and Limitations

- **GSAP License:** Only core + free plugins. Do NOT use MorphSVGPlugin, SplitText, DrawSVGPlugin, or any plugin marked "Club" on the GSAP website. Document this if the user asks for features that require them.
- **Node version:** The template targets Node 18+. Do not use Node 22+ APIs.
- **Browser support:** Modern evergreen browsers (Chrome, Firefox, Safari, Edge). No IE11.
- **Bundle size:** Keep total JS under 500KB gzipped. React Flow + GSAP + React is ~200KB; leave room for scene code.
- **Accessibility:** All interactive elements must have `aria-label`. Keyboard navigation is mandatory. Color alone must not convey meaning.
- **Cross-platform:** The generated project runs on Windows, macOS, and Linux. Use forward slashes in imports. No OS-specific path handling.

---

## Example Invocations

```
/th:interactive-presentation new
[user provides an architecture diagram image]
→ Generates a React Flow scene with the architecture nodes, edges, tooltips, and highlight steps

/th:interactive-presentation new
"Create a presentation showing how a JWT authentication flow works step by step"
→ Generates: slide (intro) + flow scene (auth flow with highlight steps) + animated scene (token lifecycle)

/th:interactive-presentation add-scene
[user provides a screenshot of a deployment pipeline]
→ Adds a new flow scene to the existing presentation with the pipeline stages

/th:interactive-presentation from-ppt
[user provides 12 slide images]
"Slides 3 and 7 should be interactive flow diagrams, slide 10 animate it step by step"
→ Scaffolds project, embeds/recreates 9 static slides, generates 3 interactive scenes (2 FlowScene + 1 AnimatedScene)
```
