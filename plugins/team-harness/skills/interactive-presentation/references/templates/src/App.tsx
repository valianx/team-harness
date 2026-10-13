import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Deck, Slide } from "@revealjs/react";
import type { RevealConfig } from "reveal.js";
import RevealNotes from "reveal.js/plugin/notes";
import "reveal.js/reveal.css";
import { useScene } from "./hooks/useScene";
import { useReducedMotion } from "./hooks/useReducedMotion";
import { Scene } from "./components/Scene";
import type { AnimationRegistry, PresentationConfig, SceneControls } from "./types";

const defaultConfig: PresentationConfig = {
  title: "Interactive Presentation",
  scenes: [{
    id: "intro",
    type: "slide",
    title: "A clear idea, room to explain it",
    subtitle: "Replace this scene with the meeting's actual content.",
    content: "<p>Use the arrow keys on the stage, or reveal the compact presentation controls.</p>",
  }],
};

const interactiveSelector = "input, textarea, select, button, summary, a[href], audio, video, iframe, [contenteditable]:not([contenteditable='false']), [role='button'], [role='slider'], [role='combobox'], [role='textbox'], [role='listbox'], [role='menu'], [role='tab'], [role='tree'], [role='grid'], [role='spinbutton'], [data-presentation-interactive]";
function hasInteractiveOwner(event: Event) {
  return event.composedPath().some((target) => target instanceof Element && target.closest(interactiveSelector));
}
function activeElement() {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}
const themeVariables = {
  background: "--scene-bg", surface: "--scene-surface", text: "--scene-text",
  muted: "--scene-muted", border: "--scene-border", accent: "--scene-accent",
  accentLight: "--scene-accent-light", fontFamily: "--scene-font", monoFamily: "--scene-mono",
};

/** The maintained engine owns slides; the mounted scene can consume an explicit step first. */
export default function App({ config = defaultConfig, animations = {} }: {
  config?: PresentationConfig;
  animations?: AnimationRegistry;
}) {
  const { deck, ready, currentIndex, currentScene, total, onReady, sync } = useScene(config.scenes);
  const reducedMotion = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const controlArea = useRef<HTMLDivElement>(null);
  const sceneControls = useRef<SceneControls | null>(null);
  const hideTimer = useRef<number>();
  const [controls, setControls] = useState<SceneControls | null>(null);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");

  const publishControls = useCallback((value: SceneControls | null) => {
    sceneControls.current = value;
    setControls(value);
  }, []);
  const hideLater = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!controlArea.current?.contains(document.activeElement)) setControlsVisible(false);
    }, 2400);
  }, []);
  const showControls = useCallback(() => {
    setControlsVisible(true);
    hideLater();
  }, [hideLater]);

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    const failure = () => setFullscreenError("Fullscreen is unavailable. The presentation remains usable in this window.");
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("fullscreenerror", failure);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("fullscreenerror", failure);
    };
  }, []);

  const navigate = useCallback((direction: "next" | "previous") => {
    showControls();
    if (sceneControls.current?.[direction]()) return;
    if (direction === "next") deck.current?.next();
    else deck.current?.prev();
  }, [deck, showControls]);
  const keyboardCondition = useCallback((event: KeyboardEvent) => {
    // Reveal's fullscreen button uses its native programmatic F binding.
    if (!event.target && event.keyCode === 70) return true;
    if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false;
    const owner = activeElement();
    if (owner instanceof Element && owner.closest(interactiveSelector)) return false;
    if (hasInteractiveOwner(event) || window.getSelection()?.isCollapsed === false) return false;
    const focusedRoot = document.activeElement;
    if (focusedRoot !== document.body && focusedRoot !== document.documentElement && !stage.current?.contains(focusedRoot)) return false;
    showControls();
    return true;
  }, [showControls]);

  const engineConfig = useMemo<RevealConfig>(() => ({
    width: config.stage?.width ?? 1280,
    height: config.stage?.height ?? 720,
    margin: 0,
    minScale: 0.1,
    maxScale: 4,
    center: false,
    controls: false,
    progress: false,
    slideNumber: false,
    autoSlide: false,
    autoAnimate: !reducedMotion,
    transition: reducedMotion ? "none" : "fade",
    backgroundTransition: "none",
    touch: false,
    mouseWheel: false,
    loop: false,
    hash: false,
    respondToHashChanges: false,
    overview: false,
    scrollActivationWidth: 0,
    keyboardCondition,
    keyboard: {
      32: (event) => navigate(event.shiftKey ? "previous" : "next"),
      33: () => navigate("previous"), 34: () => navigate("next"),
      37: () => navigate("previous"), 38: () => navigate("previous"),
      39: () => navigate("next"), 40: () => navigate("next"),
      72: () => navigate("previous"), 74: () => navigate("next"),
      76: () => navigate("next"), 78: () => navigate("next"), 80: () => navigate("previous"),
    },
  }), [config.stage?.width, config.stage?.height, reducedMotion, keyboardCondition, navigate]);

  const themeStyle = Object.fromEntries(Object.entries(config.theme ?? {}).map(([key, value]) =>
    [themeVariables[key as keyof typeof themeVariables], value],
  )) as CSSProperties;
  const changeScene = useCallback(() => {
    publishControls(null);
    sync();
  }, [publishControls, sync]);
  const toggleFullscreen = () => {
    setFullscreenError("");
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => setFullscreenError("Fullscreen could not be closed."));
    } else deck.current?.triggerKey(70);
    showControls();
  };

  if (!currentScene) return <main className="presentation-empty">Add presentation content before presenting this deck.</main>;

  return (
    <div ref={stage} className="presentation-stage" style={themeStyle} role="region" aria-label={config.title}
      tabIndex={-1} data-active-scene={currentScene.id} data-engine-ready={ready}
      data-reduced-motion={reducedMotion}
      onPointerMove={(event) => {
        if (event.clientY >= event.currentTarget.getBoundingClientRect().bottom - 112) showControls();
      }}
      onPointerDown={(event) => {
        if (!hasInteractiveOwner(event.nativeEvent)) stage.current?.focus();
      }}>
      <Deck deckRef={deck} config={engineConfig} plugins={[RevealNotes]} onReady={onReady} onSlideChange={changeScene}>
        {config.scenes.map((scene, index) => (
          <Slide key={scene.id} data-scene-id={scene.id} notes={scene.notes}>
            {ready && index === currentIndex && <Scene scene={scene} animations={animations}
              reducedMotion={reducedMotion} registerControls={publishControls} />}
          </Slide>
        ))}
      <div ref={controlArea} className="presentation-control-area" data-controls-state={controlsVisible ? "visible" : "hidden"}
        onFocusCapture={showControls} onBlurCapture={hideLater}>
        <button className="controls-trigger" aria-label="Show presentation controls" onClick={showControls}>···</button>
        <nav className="presentation-controls" aria-label="Presentation controls" hidden={!controlsVisible}>
          {currentScene.type === "animated" && <>
            <button aria-label={controls?.animation?.playing ? "Pause animation" : "Play animation"}
              disabled={!controls?.animation?.ready || reducedMotion} onClick={controls?.animation?.togglePlayback}>
              {controls?.animation?.playing ? "Ⅱ" : "▷"}
            </button>
            <button aria-label="Restart animation" disabled={!controls?.animation?.ready} onClick={controls?.animation?.restart}>↺</button>
          </>}
          <button aria-label="Previous scene or step" disabled={currentIndex === 0 && !controls?.canPrevious}
            onClick={() => navigate("previous")}>←</button>
          <output aria-label="Scene position">{currentIndex + 1} / {total}</output>
          {Boolean(controls?.totalSteps) && <output aria-label="Scene step">Step {controls!.step + 1} / {controls!.totalSteps}</output>}
          <button aria-label="Next scene or step" disabled={currentIndex === total - 1 && !controls?.canNext}
            onClick={() => navigate("next")}>→</button>
          <button aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} onClick={toggleFullscreen}>⛶</button>
        </nav>
      </div>
      </Deck>
      {fullscreenError && <p className="fullscreen-error" role="status">{fullscreenError}</p>}
    </div>
  );
}
