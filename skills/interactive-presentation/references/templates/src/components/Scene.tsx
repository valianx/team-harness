import type { SceneData } from "../types";
import { FlowScene } from "./FlowScene";
import { AnimatedScene } from "./AnimatedScene";
import { SlideScene } from "./SlideScene";

interface SceneProps {
  scene: SceneData;
}

/**
 * Scene router. Renders the correct scene component based on `scene.type`.
 * Each scene type has its own wrapper that handles the specific rendering
 * logic (React Flow, GSAP timeline, or static HTML).
 */
export function Scene({ scene }: SceneProps) {
  switch (scene.type) {
    case "flow":
      return <FlowScene scene={scene} />;
    case "animated":
      return <AnimatedScene scene={scene} />;
    case "slide":
      return <SlideScene scene={scene} />;
    default:
      return (
        <div className="flex items-center justify-center h-full text-scene-muted">
          Unknown scene type
        </div>
      );
  }
}
