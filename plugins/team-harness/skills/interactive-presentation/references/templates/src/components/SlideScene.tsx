import type { SlideSceneData } from "../types";

interface SlideSceneProps {
  scene: SlideSceneData;
}

/**
 * Static narrative slide.
 *
 * Renders HTML content inside a styled container. Use for:
 * - Title/intro slides
 * - Text explanations between interactive scenes
 * - Code examples with syntax highlighting
 * - Image-based slides
 *
 * The `content` field accepts raw HTML. The agent generates this
 * using Tailwind utility classes for layout and typography.
 */
export function SlideScene({ scene }: SlideSceneProps) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8">
      {/* Title area (only if not embedded in content) */}
      {scene.title && (
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-scene-text">{scene.title}</h2>
          {scene.subtitle && (
            <p className="text-lg text-scene-muted mt-2">{scene.subtitle}</p>
          )}
        </div>
      )}

      {/* Content area */}
      <div
        className="prose prose-invert max-w-3xl w-full [&_h1]:text-scene-text [&_h2]:text-scene-text [&_h3]:text-scene-text [&_p]:text-scene-muted [&_a]:text-scene-accent [&_code]:bg-scene-surface [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-scene-accent-light [&_pre]:bg-scene-surface [&_pre]:border [&_pre]:border-scene-border [&_pre]:rounded-xl [&_kbd]:bg-scene-surface [&_kbd]:border [&_kbd]:border-scene-border [&_kbd]:rounded [&_kbd]:px-2 [&_kbd]:py-1 [&_kbd]:font-mono [&_kbd]:text-sm"
        dangerouslySetInnerHTML={{ __html: scene.content }}
      />
    </div>
  );
}
