# GSAP scenes with actual transport

The new React template uses GSAP 3.13.0. The public package includes formerly bonus plugins from 3.13 onward; consult [official installation guidance](https://gsap.com/docs/v3/Installation/) and the selected plugin's API before adding it. Do not assume a private registry or a Club-only restriction.

## Component registration

An `animated` scene's `component` resolves through App's named `animations` registry. The component receives `AnimationComponentProps`, creates its real paused timeline and registers it. Ordered step labels must include time zero and the timeline's end. Without labels, transport uses those two endpoints. An empty timeline or invalid labels produce a visible error and disabled playback controls.

```tsx
import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { AnimationComponentProps } from "../../types";

export function Signal({ registerTimeline }: AnimationComponentProps) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let unregister: (() => void) | undefined;
    const context = gsap.context(() => {
      const timeline = gsap.timeline({ paused: true });
      timeline.addLabel("initial", 0)
        .to(".signal", { x: 420, duration: 1.4, ease: "none" })
        .addLabel("middle")
        .to(".signal", { x: 840, duration: 1.4, ease: "none" })
        .addLabel("complete");
      unregister = registerTimeline(timeline, ["initial", "middle", "complete"]);
    }, container);
    return () => { unregister?.(); context.revert(); };
  }, [registerTimeline]);
  return <div ref={container}>
    <p>A signal connects the observation to the decision.</p>
    <svg viewBox="0 0 1000 260" role="img" aria-label="Signal travels toward the decision">
      <line x1="60" x2="900" y1="105" y2="105" stroke="var(--scene-border)" />
      <rect x="864" y="69" width="72" height="72" fill="none" stroke="var(--scene-accent)" />
      <circle className="signal" cx="60" cy="105" r="24" fill="var(--scene-accent)" />
    </svg>
  </div>;
}
```

App mounts only the active scene. `AnimatedScene` preserves existing timeline callbacks, publishes actual progress/readiness/completion and controls the registered instance. Play resumes or restarts completed playback; Pause stops it; Restart returns to a paused initial state. Next/Previous seek stable step states before crossing slide boundaries. Do not create another master timeline in the wrapper or another global keyboard handler.

Reduced motion pauses an already registered timeline and disables continuous playback while keeping explicit steps and restart. This does not require component re-registration. Create a useful stable initial state; required explanatory content must not depend on an entrance tween completing. Component cleanup unregisters before [`context.revert()`](https://gsap.com/docs/v3/GSAP/gsap.context()/), stopping playback and removing scoped animations. Delayed registration must cancel pending work on unmount; failures call `reportError` and retain useful content.

## Authoring and checks

Scope selectors to the component; animate transforms rather than layout when practical. Use semantic theme variables instead of copied palette literals. Keep targets, labels and all meaningful intermediate/final states within the shared content region. Verify added plugin APIs against the installed package.

The [maintained fixture](https://github.com/valianx/team-harness/blob/main/tests/presentation/fixture/fixture.tsx) uses this registration contract with real timeline updates, loading and failure states. Browser checks must observe movement, pause stability, restart, completion and cleanup, including callback preservation, fullscreen and reduced motion. A changing progress label alone does not prove visible animation.
