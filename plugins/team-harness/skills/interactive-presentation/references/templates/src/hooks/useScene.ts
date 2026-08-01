import { useState, useCallback } from "react";
import type { SceneData } from "../types";

interface UseSceneReturn {
  /** Index of the currently active scene. */
  currentIndex: number;
  /** The current scene data object. */
  currentScene: SceneData;
  /** Total number of scenes. */
  total: number;
  /** Whether the current scene is the first one. */
  isFirst: boolean;
  /** Whether the current scene is the last one. */
  isLast: boolean;
  /** Navigate to the next scene. No-op if already at the last scene. */
  next: () => void;
  /** Navigate to the previous scene. No-op if already at the first scene. */
  prev: () => void;
  /** Navigate to a specific scene by index. */
  goTo: (index: number) => void;
}

/**
 * Scene navigation state manager.
 * Handles forward/backward navigation and direct jumps.
 */
export function useScene(scenes: SceneData[]): UseSceneReturn {
  const [currentIndex, setCurrentIndex] = useState(0);

  const next = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, scenes.length - 1));
  }, [scenes.length]);

  const prev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const goTo = useCallback(
    (index: number) => {
      if (index >= 0 && index < scenes.length) {
        setCurrentIndex(index);
      }
    },
    [scenes.length],
  );

  return {
    currentIndex,
    currentScene: scenes[currentIndex],
    total: scenes.length,
    isFirst: currentIndex === 0,
    isLast: currentIndex === scenes.length - 1,
    next,
    prev,
    goTo,
  };
}
