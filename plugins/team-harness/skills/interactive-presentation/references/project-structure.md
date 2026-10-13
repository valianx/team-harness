# Component presentation structure

Use this scaffold for a new deck that needs application components. Existing decks keep their engine and working structure. Straightforward new HTML decks follow the [frontend-slides integration](frontend-slides.md).

## Files and ownership

```text
package.json / package-lock.json  Selected dependencies and reproducible installation
vite.config.ts / tsconfig.json    Build and strict TypeScript settings
tailwind.config.ts                Utilities backed by semantic CSS variables
index.html                       Local entry; no mandatory external font fetch
src/main.tsx                     React mount and presentation inputs
src/App.tsx                      Reveal Deck, engine-backed controls and active scene adapter
src/types.ts                     SceneData, PresentationConfig and animation registration
src/hooks/useScene.ts            Observe Reveal's active index; no parallel navigation authority
src/hooks/useReducedMotion.ts    Current motion preference
src/styles/globals.css          Shared stage, content layouts and reserved control area
src/components/SceneFrame.tsx    One headline, shared content root and local fragment links
src/components/Scene.tsx         Route the mounted active variant
src/components/SlideScene.tsx    Authored text, split or image composition
src/components/FlowScene.tsx     Graph viewport, gestures and explicit highlight steps
src/components/AnimatedScene.tsx Actual component registration and transport
src/components/scenes/           Authored animation components, when needed
src/data/presentation.ts         Authored configuration, when separated from main
src/assets/slides/               Imported deck assets, when needed
```

The official `@revealjs/react` wrapper initializes, syncs and disposes the engine. Keep slide index, sizing and supported presenter features in Reveal; do not add a global keyboard listener, another index store or custom presenter-window synchronization. The optional `notes` scene field uses Reveal's built-in speaker view.

## Configure the presentation

Pass `config` and the named animation registry to App. `scenes` retains `slide`, `flow` and `animated` variants. An animation component named by data must exist in the registry and use the [GSAP registration contract](gsap-patterns.md).

```tsx
import App from "./App";
import type { PresentationConfig } from "./types";
import { Signal } from "./components/scenes/Signal";

const config: PresentationConfig = {
  title: "Service decision",
  stage: { width: 1280, height: 720 },
  theme: { accent: "#555244", fontFamily: "system-ui, sans-serif" },
  scenes: [
    { id: "context", type: "slide", title: "The evidence behind this decision",
      layout: "text", content: "<p>Use the application's actual facts and useful visuals.</p>" },
    { id: "signal", type: "animated", title: "From observation to decision", component: "Signal" },
  ],
};

export function Presentation() { return <App config={config} animations={{ Signal }} />; }
```

Stage dimensions default to 1280×720 (16:9); retain another project format through `stage`. Theme overrides supply `background`, `surface`, `text`, `muted`, `border`, `accent`, `accentLight`, `fontFamily` and `monoFamily`. Their CSS variables are `--scene-bg`, `--scene-surface`, `--scene-text`, `--scene-muted`, `--scene-border`, `--scene-accent`, `--scene-accent-light`, `--scene-font` and `--scene-mono`. Resolve values through the presentation's contextual visual direction.

Slide `layout` is `text`, `split` (two semantic child columns), or `image` (a figure with contained image and caption). Use body headings below the scene headline. Set `showHeading: false` when an embedded original slide or authored content already owns its headline; metadata title remains its identity. Keep the default for photographs needing a shell headline. Supply meaningful `alt`; import assets through Vite or put served assets in `public/`. Imported from-ppt image names preserve deck order as `slide-1.png`, `slide-2.jpg`, etc. Trusted authored HTML goes in `content`; do not inject untrusted remote markup.

All scene content uses an open ShadowRoot at `[data-scene-content]`; React portals preserve component context, events and cleanup. Semantic sections remain authored content when Reveal syncs. One root stylesheet combines processed canonical CSS with actual React Flow styles; `.presentation-content` scopes internal rules and inherits presentation tokens. Page-specific styles must enter the canonical stylesheet. Page DOM queries traverse `host.shadowRoot`, and event handlers use `composedPath()` for the authored target. Same-document links to current-root IDs retain URL history, target focus and back/forward behavior through the local fragment adapter; other links stay native. Root IDs remain outside document lookup and native `:target` matching. Mark custom interactive hosts with `data-presentation-interactive` when their internals are inaccessible. Browser measurements traverse the open root and inspect actual content.

Graph node explanations replace the persistent caption on pointer hover or keyboard focus. The graph describes itself through that caption; its reserved body row keeps required explanation text away from presentation controls.

The graph canvas derives Reveal's scale through the official wrapper context. Its physical size and inverse transform keep native React Flow handle/pointer measurements consistent; React Flow owns fit, pan and zoom. Canvas size changes invoke its public `fitView` after native measurement, with observer and engine-listener cleanup. Preserve this adapter when changing scene composition.

## Add, run and verify

Add a SceneData record in intentional order. Create/register an animation only when needed; retain incumbent graph components and interactions when improving a deck. Source layouts expose `data-stage-safe-area` and `data-scene-content` for rendered inspection; these are measurable bounds, not clipping masks. Split or recompose dense content before shrinking it below meeting readability.

Use `npm ci`, `npm run dev`, `npm run build` and `npm run preview`. Serve `dist/` over HTTP; deployment/export follows the requested endpoint. Build success is only compilation evidence. Inspect actual content at 1280×720 and another meeting viewport, including labels, image meaning, steps, focus-owned keys, idle/revealed/focused controls, actual transport, fullscreen and reduced motion. Retain captures, meaningful bounds and remaining gaps in the selected workspace.
