import { useRef, useEffect, useState, useCallback } from "react";
import gsap from "gsap";
import type { AnimatedSceneData } from "../types";

interface AnimatedSceneProps {
  scene: AnimatedSceneData;
}

/**
 * GSAP-animated scene wrapper.
 *
 * Provides a container div with ref for GSAP timeline attachment,
 * plus play/pause/restart controls.
 *
 * Usage pattern for generated scenes:
 * 1. The agent creates a custom component (e.g., `DataFlowAnimation.tsx`)
 *    that accepts a `containerRef` and builds a GSAP timeline on mount.
 * 2. This wrapper renders that component and provides transport controls.
 *
 * The template ships with a placeholder — the agent replaces it with
 * the actual animated content when generating a scene.
 */
export function AnimatedScene({ scene }: AnimatedSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create a master timeline for the scene.
    // Generated scene components append their tweens to this timeline.
    const tl = gsap.timeline({
      paused: false,
      onUpdate: () => {
        setProgress(tl.progress());
      },
      onComplete: () => {
        setIsPlaying(false);
      },
    });

    timelineRef.current = tl;

    return () => {
      tl.kill();
      timelineRef.current = null;
    };
  }, [scene.id]);

  const togglePlay = useCallback(() => {
    const tl = timelineRef.current;
    if (!tl) return;
    if (tl.progress() >= 1) {
      tl.restart();
      setIsPlaying(true);
    } else if (isPlaying) {
      tl.pause();
      setIsPlaying(false);
    } else {
      tl.resume();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const restart = useCallback(() => {
    const tl = timelineRef.current;
    if (!tl) return;
    tl.restart();
    setIsPlaying(true);
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Scene title */}
      <div className="px-6 pt-4">
        <h2 className="text-lg font-semibold text-scene-text">{scene.title}</h2>
        {scene.subtitle && (
          <p className="text-sm text-scene-muted mt-0.5">{scene.subtitle}</p>
        )}
      </div>

      {/* Animation container — generated components render here */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden mx-6 my-4 rounded-xl border border-scene-border bg-scene-surface"
        data-scene-id={scene.id}
      >
        {/* Placeholder content — replaced by generated animation components */}
        <div className="flex items-center justify-center h-full text-scene-muted">
          <p>Animation: {scene.component}</p>
        </div>
      </div>

      {/* Transport controls */}
      <div className="flex items-center gap-4 px-6 pb-4">
        <button
          onClick={togglePlay}
          className="p-2 rounded-lg bg-scene-surface border border-scene-border text-scene-text hover:bg-scene-border transition-colors"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="2" width="4" height="12" rx="1" />
              <rect x="9" y="2" width="4" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2L14 8L4 14V2Z" />
            </svg>
          )}
        </button>

        <button
          onClick={restart}
          className="p-2 rounded-lg bg-scene-surface border border-scene-border text-scene-text hover:bg-scene-border transition-colors"
          aria-label="Restart"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 8a6 6 0 1 1 1.5 4" strokeLinecap="round" />
            <path d="M2 12V8h4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Progress bar */}
        <div className="flex-1 h-1.5 rounded-full bg-scene-border overflow-hidden">
          <div
            className="h-full bg-scene-accent rounded-full transition-all duration-100"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
