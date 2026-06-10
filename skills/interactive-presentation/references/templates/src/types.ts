import type { Node, Edge } from "@xyflow/react";

/** Discriminated union for scene types. */
export type SceneType = "flow" | "animated" | "slide";

/** Base scene fields shared by all types. */
interface SceneBase {
  id: string;
  title: string;
  subtitle?: string;
}

/** A React Flow graph scene with nodes, edges, and optional highlight steps. */
export interface FlowSceneData extends SceneBase {
  type: "flow";
  nodes: Node[];
  edges: Edge[];
  /** Ordered list of node IDs to highlight in sequence (click/arrow to advance). */
  highlightSteps?: string[][];
}

/** A GSAP-animated scene with a timeline of tweens. */
export interface AnimatedSceneData extends SceneBase {
  type: "animated";
  /** The React component name that renders this scene's SVG/HTML content. */
  component: string;
}

/** A static narrative slide (text, images, code blocks). */
export interface SlideSceneData extends SceneBase {
  type: "slide";
  /** HTML string rendered inside the slide container. */
  content: string;
}

/** Union of all scene data types. */
export type SceneData = FlowSceneData | AnimatedSceneData | SlideSceneData;

/** Presentation configuration. */
export interface PresentationConfig {
  title: string;
  description?: string;
  scenes: SceneData[];
}
