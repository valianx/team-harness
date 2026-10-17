import type { SlideSceneData } from "../types";

/** Trusted authored HTML retains its semantic structure inside the shared content root. */
export function SlideScene({ scene }: { scene: SlideSceneData }) {
  return <div className="slide-body" data-slide-html data-layout={scene.layout ?? "text"}
    dangerouslySetInnerHTML={{ __html: scene.content }} />;
}
