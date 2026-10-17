import type { AnimationRegistry, RegisterSceneControls, SceneData } from "../types";
import { FlowScene } from "./FlowScene";
import { AnimatedScene } from "./AnimatedScene";
import { SlideScene } from "./SlideScene";
import { SceneFrame } from "./SceneFrame";

/** All scene variants use the same headline, content bounds and active control registration. */
export function Scene({ scene, animations, reducedMotion, registerControls }: {
  scene: SceneData;
  animations: AnimationRegistry;
  reducedMotion: boolean;
  registerControls: RegisterSceneControls;
}) {
  return <SceneFrame scene={scene}>
    {scene.type === "slide" && <SlideScene scene={scene} />}
    {scene.type === "flow" && <FlowScene scene={scene} reducedMotion={reducedMotion} registerControls={registerControls} />}
    {scene.type === "animated" && <AnimatedScene scene={scene} animations={animations}
      reducedMotion={reducedMotion} registerControls={registerControls} />}
  </SceneFrame>;
}
