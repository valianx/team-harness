# GSAP Animation Patterns (v3.12+)

Reference for generating animated scenes. Use context7 to verify API details for specific plugins or methods.

**License note:** Only core GSAP and free plugins (ScrollTrigger, Draggable, Flip, Observer, ScrollToPlugin, TextPlugin, MotionPathPlugin, CustomEase) are available. MorphSVGPlugin, SplitText, DrawSVGPlugin, and other Club-only plugins require a paid GSAP license and MUST NOT be used.

---

## Timeline Basics

Every animated scene creates a GSAP timeline attached to the scene's container ref.

```tsx
import { useRef, useEffect } from "react";
import gsap from "gsap";

function MyAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

      tl.from(".box-1", { opacity: 0, y: 40, duration: 0.6 })
        .from(".box-2", { opacity: 0, x: -40, duration: 0.6 }, "-=0.3")
        .from(".arrow", { scaleX: 0, transformOrigin: "left", duration: 0.4 })
        .from(".box-3", { opacity: 0, y: 40, duration: 0.6 }, "-=0.2");

      return tl;
    }, containerRef); // Scope all selectors to container

    return () => ctx.revert(); // Clean up on unmount
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {/* SVG or HTML content here */}
    </div>
  );
}
```

---

## Stagger Animations (Lists, Grids)

```tsx
// Stagger items appearing one by one
tl.from(".item", {
  opacity: 0,
  y: 30,
  duration: 0.4,
  stagger: 0.15,  // 150ms between each
});

// Grid stagger (left-to-right, top-to-bottom)
tl.from(".grid-cell", {
  scale: 0,
  opacity: 0,
  duration: 0.3,
  stagger: {
    grid: [4, 4],
    from: "start",
    amount: 0.8,  // Total spread time
  },
});
```

---

## SVG Path Animation (Draw Effect — CSS only, no DrawSVGPlugin)

Since DrawSVGPlugin is Club-only, use stroke-dasharray/dashoffset animation:

```tsx
// Set up in CSS or inline style first:
// stroke-dasharray: totalLength; stroke-dashoffset: totalLength;

function animateDrawPath(selector: string, tl: gsap.core.Timeline) {
  const path = document.querySelector(selector) as SVGPathElement;
  if (!path) return;

  const length = path.getTotalLength();
  gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });

  tl.to(path, {
    strokeDashoffset: 0,
    duration: 1.5,
    ease: "power2.inOut",
  });
}
```

---

## Motion Path (Free Plugin)

```tsx
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
gsap.registerPlugin(MotionPathPlugin);

// Animate element along an SVG path
tl.to(".dot", {
  motionPath: {
    path: "#flow-path",
    align: "#flow-path",
    alignOrigin: [0.5, 0.5],
  },
  duration: 3,
  ease: "none",
});
```

---

## Text Animation (Character by Character — no SplitText)

Since SplitText is Club-only, wrap characters manually:

```tsx
function splitText(text: string): string {
  return text
    .split("")
    .map((char, i) =>
      char === " "
        ? " "
        : `<span class="char" style="display:inline-block" data-index="${i}">${char}</span>`
    )
    .join("");
}

// In component:
const textRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!textRef.current) return;
  textRef.current.innerHTML = splitText("Hello World");

  const ctx = gsap.context(() => {
    tl.from(".char", {
      opacity: 0,
      y: 20,
      rotationX: -90,
      duration: 0.4,
      stagger: 0.03,
      ease: "back.out(1.7)",
    });
  }, textRef);

  return () => ctx.revert();
}, []);
```

---

## Number Counter Animation

```tsx
const counter = { val: 0 };

tl.to(counter, {
  val: 1500,
  duration: 2,
  ease: "power1.out",
  onUpdate: () => {
    document.querySelector(".counter")!.textContent = Math.round(counter.val).toLocaleString();
  },
});
```

---

## Color and Gradient Transitions

```tsx
// Background color morph
tl.to(".panel", {
  backgroundColor: "#3b82f6",
  duration: 0.8,
  ease: "power2.inOut",
});

// SVG fill transition
tl.to(".shape", {
  fill: "#60a5fa",
  stroke: "#3b82f6",
  duration: 0.6,
});
```

---

## Easing Reference

| Use case | Ease | Character |
|----------|------|-----------|
| Elements entering | `power2.out` | Decelerates naturally |
| Elements exiting | `power2.in` | Accelerates out |
| Emphasis / bounce | `back.out(1.7)` | Overshoots then settles |
| Data flow / constant | `none` | Linear, mechanical |
| Morphing / organic | `power2.inOut` | Smooth acceleration and deceleration |
| Elastic pop | `elastic.out(1, 0.5)` | Spring effect |
| Step reveal | `steps(5)` | Discrete steps |

---

## Timeline Labels and Control

```tsx
const tl = gsap.timeline();

tl.addLabel("intro")
  .from(".title", { opacity: 0, y: -30, duration: 0.6 })
  .addLabel("content")
  .from(".items", { opacity: 0, stagger: 0.2 })
  .addLabel("conclusion")
  .from(".summary", { opacity: 0, scale: 0.9, duration: 0.8 });

// Seek to a label
tl.seek("content");

// Play from a label
tl.play("conclusion");
```

---

## Performance Tips

1. **Animate transforms, not layout properties.** Use `x`, `y`, `scale`, `rotation` — not `width`, `height`, `top`, `left`.
2. **Use `will-change: transform`** on elements that will be animated (GSAP adds this automatically for transform tweens).
3. **Use `gsap.context()` for cleanup.** Always revert on component unmount.
4. **Batch DOM reads before writes.** Use `gsap.set()` for initial states before `.from()` tweens.
5. **Limit simultaneous animations** to ~20 elements for smooth 60fps.
