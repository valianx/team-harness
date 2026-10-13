import type { ComponentType } from "react";
import type { Node, Edge } from "@xyflow/react";
import type gsap from "gsap";

/** Supported scene variants in a component presentation. */
export type SceneType = "flow" | "animated" | "slide";

interface SceneBase {
  id: string;
  title: string;
  subtitle?: string;
  notes?: string;
  /** Set false when an embedded original slide or authored content owns its headline. */
  showHeading?: boolean;
}

/** Graph data retains authored styles; ordered groups provide explicit scene steps. */
export interface FlowSceneData extends SceneBase {
  type: "flow";
  nodes: Node[];
  edges: Edge[];
  highlightSteps?: string[][];
}

/** The component name resolves through App's animation registry. */
export interface AnimatedSceneData extends SceneBase {
  type: "animated";
  component: string;
}

/** Authored HTML is trusted project content, never untrusted remote markup. */
export interface SlideSceneData extends SceneBase {
  type: "slide";
  content: string;
  layout?: "text" | "split" | "image";
}

/** The configuration remains compatible with slide, flow and animated scenes. */
export type SceneData = FlowSceneData | AnimatedSceneData | SlideSceneData;

/** Semantic presentation tokens override the neutral scaffold defaults. */
export interface PresentationTheme {
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentLight: string;
  fontFamily: string;
  monoFamily: string;
}

/** Stage dimensions define the authored format; Reveal scales it to the viewport. */
export interface PresentationConfig {
  title: string;
  description?: string;
  scenes: SceneData[];
  stage?: { width: number; height: number };
  theme?: Partial<PresentationTheme>;
}

/** Register the component's paused timeline; return its unregister callback during cleanup. */
export interface AnimationComponentProps {
  reducedMotion: boolean;
  registerTimeline: (timeline: AnimationTimeline, steps?: string[]) => () => void;
  reportError: (message: string) => void;
}

/** The registered value is the actual GSAP timeline returned by the component. */
export type AnimationTimeline = ReturnType<typeof gsap.timeline>;

/** Scene names map to real components, not an independent animation timer. */
export type AnimationRegistry = Record<string, ComponentType<AnimationComponentProps>>;

/** Active scene actions report whether a step consumed navigation before a slide change. */
export interface SceneControls {
  step: number;
  totalSteps: number;
  canNext: boolean;
  canPrevious: boolean;
  next: () => boolean;
  previous: () => boolean;
  animation?: {
    ready: boolean;
    playing: boolean;
    progress: number;
    togglePlayback: () => void;
    restart: () => void;
  };
}

/** Only the mounted active scene publishes controls; cleanup removes its registration. */
export type RegisterSceneControls = (controls: SceneControls | null) => void;
