import { useCallback, useRef, useState } from "react";
import type { RevealApi } from "reveal.js";
import type { SceneData } from "../types";

/** Observe the engine's active index; all slide changes remain Reveal API calls. */
export function useScene(scenes: SceneData[]) {
  const deck = useRef<RevealApi | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const sync = useCallback(() => {
    if (deck.current) setCurrentIndex(deck.current.getIndices().h);
  }, []);
  const onReady = useCallback((instance: RevealApi) => {
    deck.current = instance;
    setCurrentIndex(instance.getIndices().h);
    setReady(true);
  }, []);

  return {
    deck,
    ready,
    currentIndex,
    currentScene: scenes[currentIndex],
    total: scenes.length,
    onReady,
    sync,
  };
}
