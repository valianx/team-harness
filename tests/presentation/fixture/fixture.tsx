import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { MarkerType, Position } from "@xyflow/react";
import App from "./App";
import type { AnimationComponentProps, PresentationConfig } from "./types";

interface Lifetime {
  created: number;
  disposed: number;
  registered: number;
  unregistered: number;
  updates: number;
  timeline?: gsap.core.Timeline;
}

declare global {
  interface Window { fixtureLifetimes: Record<string, Lifetime>; }
}

window.fixtureLifetimes = {};

function Signal({ registerTimeline }: AnimationComponentProps) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = "signal";
    const lifetime = window.fixtureLifetimes[id] ??= { created: 0, disposed: 0, registered: 0, unregistered: 0, updates: 0 };
    lifetime.created++;
    let unregister: (() => void) | undefined;
    const context = gsap.context(() => {
      const timeline = gsap.timeline({ paused: true, onUpdate: () => { lifetime.updates++; } });
      timeline.addLabel("initial", 0)
        .to(".signal", { x: 420, duration: 1.4, ease: "none" })
        .addLabel("middle")
        .to(".signal", { x: 840, duration: 1.4, ease: "none" })
        .addLabel("complete");
      lifetime.timeline = timeline;
      const register = () => {
        lifetime.registered++;
        unregister = registerTimeline(timeline, ["initial", "middle", "complete"]);
      };
      register();
    }, container);
    return () => {
      if (unregister) { unregister(); lifetime.unregistered++; }
      context.revert();
      lifetime.disposed++;
    };
  }, [registerTimeline]);

  const Content = new URLSearchParams(location.search).has("semanticAnimation") ? "section" : "div";
  return <Content ref={container} data-fixture-animation="signal">
    <p data-measure="animation-explanation">An evidence signal travels from the observed behavior to the decision. Explicit steps retain the explanation when motion is reduced.</p>
    <svg viewBox="0 0 1000 260" role="img" aria-label="Signal travels from observation through analysis to decision" style={{ width: "100%", height: "auto", maxHeight: "280px" }}>
      <line x1="60" x2="900" y1="105" y2="105" stroke="var(--scene-border)" strokeWidth="4" />
      <g fill="var(--scene-text)" fontSize="27" textAnchor="middle">
        <text data-measure="animation-label-start" x="85" y="190">Observed</text>
        <text data-measure="animation-label-middle" x="480" y="190">Analysed</text>
        <text data-measure="animation-label-end" x="900" y="190">Decided</text>
      </g>
      <rect data-measure="animation-destination" x="864" y="69" width="72" height="72" rx="12" fill="none" stroke="var(--scene-accent)" strokeWidth="4" />
      <circle data-measure="animation-target" className="signal" cx="60" cy="105" r="24" fill="var(--scene-accent)" />
    </svg>
  </Content>;
}

function DelayedSignal(props: AnimationComponentProps) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const lifetime = window.fixtureLifetimes.delayed ??= { created: 0, disposed: 0, registered: 0, unregistered: 0, updates: 0 };
    lifetime.created++;
    let unregister: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const context = gsap.context(() => {
      const timeline = gsap.timeline({ paused: true, onUpdate: () => { lifetime.updates++; } });
      timeline.addLabel("initial", 0).to(".delayed-signal", { x: 220, duration: 1.4 }).addLabel("complete");
      lifetime.timeline = timeline;
      timer = setTimeout(() => { lifetime.registered++; unregister = props.registerTimeline(timeline, ["initial", "complete"]); }, 900);
    }, container);
    return () => {
      if (timer) clearTimeout(timer);
      if (unregister) { unregister(); lifetime.unregistered++; }
      context.revert();
      lifetime.disposed++;
    };
  }, [props.registerTimeline]);
  return <div ref={container} data-fixture-animation="delayed">
    <p data-measure="delayed-explanation">The component registers its real timeline after a deterministic loading interval.</p>
    <svg viewBox="0 0 400 100" role="img" aria-label="Delayed signal"><circle data-measure="delayed-target" className="delayed-signal" cx="60" cy="50" r="20" fill="var(--scene-accent)" /></svg>
  </div>;
}

function FailedSignal({ reportError }: AnimationComponentProps) {
  useEffect(() => { reportError("The synthetic animation asset could not load."); }, [reportError]);
  return <p data-measure="failure-explanation">The available content and meeting navigation remain usable.</p>;
}

const textContent = `<section>
  <p data-measure="dense-introduction">A professional meeting deck makes the decision clear before it reveals detail. This example keeps the full message while dividing supporting evidence into two deliberate columns.</p>
  <ul><li data-measure="dense-one">Context establishes the audience, the problem and the outcome under discussion.</li><li data-measure="dense-two">Evidence uses the application's actual behavior, including limits and unresolved questions.</li></ul>
</section><section>
  <p data-measure="dense-conclusion">Readable content supports the speaker instead of competing with the discussion. The next scenes keep images, graph labels and movement inside the same usable stage.</p>
  <ul><li data-measure="dense-three">Composition groups related facts and leaves space for meaningful visuals.</li><li data-measure="dense-four">Verification examines rendered states before the meeting begins.</li></ul>
</section>`;

const focusContent = `<section>
  <label data-measure="input-label">Native input <input aria-label="Native input" value="" /></label>
  <label data-measure="textarea-label">Native notes <textarea aria-label="Native notes">alpha beta</textarea></label>
  <div data-measure="editable-label" role="textbox" aria-label="Editable note" contenteditable="true">Editable words</div>
  <details><summary>Decision details</summary><p>The native disclosure owns its focused keyboard interaction.</p></details>
</section><section>
  <button data-measure="fixture-action" type="button" id="fixture-action"><span>Record decision</span></button>
  <output data-measure="fixture-action-count" id="fixture-action-count">0</output>
  <label data-measure="select-label">Native selector <select aria-label="Native selector"><option>First</option><option>Second</option><option>Third</option></select></label>
  <a data-measure="fixture-link" id="fixture-link" href="#focus-fragment-target">Meeting note</a>
  <output data-measure="fixture-link-count" id="fixture-link-count">0</output>
  <audio data-measure="fixture-media" aria-label="Native media" src="/focus-tone.wav" controls tabindex="0" style="width:100%"></audio>
  <section data-measure="focus-fragment-target" id="focus-fragment-target" tabindex="-1"><p>The authored fragment target is focusable and keeps its semantic section.</p></section>
</section>`;

const baseConfig: PresentationConfig = {
  title: "Meeting fixture",
  scenes: [
    { id: "context", type: "slide", title: "Design decisions connect the service context to an observable outcome", layout: "split", content: textContent },
    { id: "image", type: "slide", title: "One visual keeps four essential ideas in view", layout: "image", content: `<figure><img data-measure="essential-image" src="/meeting-diagram.svg" alt="Context, evidence, composition and delivery surround a meeting-ready decision" /><figcaption data-measure="image-caption">The four corner markers remain visible; the original image is 4:3.</figcaption></figure>` },
    { id: "focus", type: "slide", title: "Focused controls keep their own keyboard behavior", layout: "split", content: focusContent },
    {
      id: "graph", type: "flow", title: "Connect context, evidence and a decision without losing the labels",
      nodes: [
        { id: "context-node", position: { x: 0, y: 50 }, sourcePosition: Position.Right, targetPosition: Position.Left, data: { label: "Context and audience", tooltip: "The meeting objective gives this evidence a purpose." }, style: { width: 220 } },
        { id: "evidence-node", position: { x: 330, y: 50 }, sourcePosition: Position.Right, targetPosition: Position.Left, data: { label: "Observed evidence", tooltip: "Behavior is examined before a development decision." }, style: { width: 220 } },
        { id: "decision-node", position: { x: 660, y: 50 }, sourcePosition: Position.Right, targetPosition: Position.Left, data: { label: "Development decision", tooltip: "The decision states the next useful change." }, style: { width: 220 } },
      ],
      edges: [
        { id: "context-evidence", source: "context-node", target: "evidence-node", label: "inspect", markerEnd: { type: MarkerType.ArrowClosed, color: "var(--scene-muted)" } },
        { id: "evidence-decision", source: "evidence-node", target: "decision-node", label: "decide", markerEnd: { type: MarkerType.ArrowClosed, color: "var(--scene-muted)" } },
      ],
      highlightSteps: [["context-node"], ["context-node", "evidence-node"], ["evidence-node", "decision-node"]],
    },
    { id: "animation", type: "animated", title: "The animation explains an observable transition", component: "Signal" },
    { id: "delayed", type: "animated", title: "Transport waits for the component's actual readiness", component: "DelayedSignal" },
    { id: "failure", type: "animated", title: "A failed component preserves navigation and useful content", component: "FailedSignal" },
    { id: "closing", type: "slide", title: "The next decision has an evidence trail", content: `<p data-measure="closing-message">This is the final scene. Advancing stays here; reversing returns to the previous scene or its last step.</p>` },
  ],
};

export function Fixture() {
  const [config] = useState(() => {
    const params = new URLSearchParams(location.search);
    return {
      ...baseConfig,
      scenes: baseConfig.scenes.map((scene) => params.has("ownedHeading") && scene.id === "image" ? { ...scene, ...{ showHeading: false } } : scene),
      ...(params.get("format") === "4:3" ? { stage: { width: 1200, height: 900 } } : {}),
      ...(params.has("theme") ? { theme: { background: "#f6f1e5", surface: "#e8e0cc", text: "#302c23", muted: "#5e594d", border: "#b7a788", accent: "#925137", fontFamily: "Georgia, serif", monoFamily: "monospace" } } : {}),
    };
  });
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.composedPath().find((entry): entry is HTMLElement => entry instanceof HTMLElement && entry.matches("button,a"));
      const counter = target?.id === "fixture-action" ? "fixture-action-count" : target?.id === "fixture-link" ? "fixture-link-count" : undefined;
      if (counter) {
        const output = (target!.getRootNode() as Document | ShadowRoot).getElementById(counter)!;
        output.textContent = String(Number(output.textContent) + 1);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);
  return <App config={config} animations={{ Signal, DelayedSignal, FailedSignal }} />;
}
