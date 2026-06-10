import { useEffect, useCallback } from "react";
import { useScene } from "./hooks/useScene";
import { Scene } from "./components/Scene";
import type { PresentationConfig } from "./types";

/**
 * Presentation shell.
 * Handles keyboard navigation (ArrowLeft/Right, Space) and renders the
 * navigation bar (dots + arrows) around the active scene.
 *
 * To add scenes, edit the `config` object below.
 */

const config: PresentationConfig = {
  title: "Interactive Presentation",
  scenes: [
    {
      id: "intro",
      type: "slide",
      title: "Welcome",
      subtitle: "Use arrow keys or click to navigate",
      content: `
        <div class="flex flex-col items-center justify-center h-full gap-6">
          <h1 class="text-5xl font-bold text-scene-text">Interactive Presentation</h1>
          <p class="text-xl text-scene-muted">Press <kbd class="px-2 py-1 rounded bg-scene-surface border border-scene-border font-mono text-sm">&rarr;</kbd> to begin</p>
        </div>
      `,
    },
  ],
};

export default function App() {
  const { currentIndex, currentScene, total, isFirst, isLast, next, prev, goTo } =
    useScene(config.scenes);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight":
        case " ":
          e.preventDefault();
          next();
          break;
        case "ArrowLeft":
          e.preventDefault();
          prev();
          break;
      }
    },
    [next, prev],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-scene-border/50">
        <span className="text-sm font-medium text-scene-muted">{config.title}</span>
        <span className="text-xs text-scene-muted font-mono">
          {currentIndex + 1} / {total}
        </span>
      </header>

      {/* Scene area */}
      <main className="flex-1 relative overflow-hidden">
        <div key={currentScene.id} className="scene-enter w-full h-full">
          <Scene scene={currentScene} />
        </div>
      </main>

      {/* Navigation bar */}
      <nav className="flex items-center justify-center gap-4 px-6 py-4 border-t border-scene-border/50">
        <button
          onClick={prev}
          disabled={isFirst}
          className="p-2 rounded-lg text-scene-muted hover:text-scene-text hover:bg-scene-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous scene"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 4L6 10L12 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          {config.scenes.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`nav-dot ${i === currentIndex ? "active" : ""}`}
              aria-label={`Go to scene ${i + 1}`}
            />
          ))}
        </div>

        <button
          onClick={next}
          disabled={isLast}
          className="p-2 rounded-lg text-scene-muted hover:text-scene-text hover:bg-scene-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Next scene"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M8 4L14 10L8 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </nav>
    </div>
  );
}
