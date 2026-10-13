# SVG Patterns for React Presentations

Reference for scene-specific SVG geometry. Use the presentation's semantic theme variables; size and arrange labels for the actual meeting viewport. Small icon examples do not establish readable slide typography. Test meaningful label bounds and animation states inside the shared safe area.

---

## SVG in React — Basics

```tsx
function Diagram() {
  return (
    <svg viewBox="0 0 800 600" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      {/* Groups for logical sections */}
      <g className="layer-background">
        <rect width="800" height="600" fill="var(--scene-bg)" />
      </g>
      <g className="layer-connections">
        {/* Paths between elements */}
      </g>
      <g className="layer-nodes">
        {/* Primary visual elements */}
      </g>
      <g className="layer-labels">
        {/* Text labels */}
      </g>
    </svg>
  );
}
```

---

## Common Shapes

### Rounded Rectangle (Service/Component Box)

```tsx
<rect x={100} y={50} width={200} height={80} rx={12} ry={12}
  fill="var(--scene-surface)" stroke="var(--scene-border)" strokeWidth={1.5} />
<text x={200} y={95} textAnchor="middle" fill="var(--scene-text)" fontSize={14} fontFamily="var(--scene-font)">
  API Gateway
</text>
```

### Circle (State/Event Node)

```tsx
<circle cx={400} cy={300} r={30}
  fill="var(--scene-surface)" stroke="var(--scene-accent)" strokeWidth={2} />
<text x={400} y={305} textAnchor="middle" fill="var(--scene-text)" fontSize={12}>
  Start
</text>
```

### Diamond (Decision)

```tsx
<g transform="translate(300, 200)">
  <polygon points="0,-35 40,0 0,35 -40,0"
    fill="var(--scene-surface)" stroke="var(--scene-accent)" strokeWidth={2} />
  <text y={4} textAnchor="middle" fill="var(--scene-text)" fontSize={11}>
    Auth?
  </text>
</g>
```

### Cylinder (Database)

```tsx
function DatabaseIcon({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Body */}
      <rect x={-30} y={-10} width={60} height={50} rx={2} fill="var(--scene-surface)" stroke="var(--scene-border)" strokeWidth={1.5} />
      {/* Top ellipse */}
      <ellipse cx={0} cy={-10} rx={30} ry={10} fill="var(--scene-surface)" stroke="var(--scene-border)" strokeWidth={1.5} />
      {/* Bottom ellipse (visible part) */}
      <path d="M -30 40 Q 0 60 30 40" fill="none" stroke="var(--scene-border)" strokeWidth={1.5} />
      {/* Label */}
      <text y={25} textAnchor="middle" fill="var(--scene-text)" fontSize={11}>{label}</text>
    </g>
  );
}
```

---

## Connections and Arrows

### Straight Arrow

```tsx
<defs>
  <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
    <polygon points="0 0, 10 3.5, 0 7" fill="var(--scene-muted)" />
  </marker>
</defs>
<line x1={200} y1={100} x2={400} y2={100}
  stroke="var(--scene-muted)" strokeWidth={2} markerEnd="url(#arrowhead)" />
```

### Curved Connection (Bezier)

```tsx
<path
  d="M 200 100 C 300 100, 300 200, 400 200"
  fill="none" stroke="var(--scene-muted)" strokeWidth={2}
  markerEnd="url(#arrowhead)"
/>
```

### Animated Data Flow (Dots Moving Along Path)

```tsx
<defs>
  <circle id="flow-dot" r="4" fill="var(--scene-accent)" />
</defs>
<path id="data-path" d="M 100 300 C 200 200, 400 400, 500 300" fill="none" stroke="var(--scene-border)" strokeWidth={1.5} />
{/* GSAP animates this along #data-path via MotionPathPlugin */}
<use href="#flow-dot" className="flow-particle" />
```

---

## Icons as SVG Components

Keep icons as small functional components for reuse:

```tsx
function ServerIcon({ x, y, size = 24 }: { x: number; y: number; size?: number }) {
  return (
    <g transform={`translate(${x - size/2}, ${y - size/2})`}>
      <rect width={size} height={size * 0.3} rx={2} fill="var(--scene-border)" stroke="var(--scene-muted)" />
      <rect y={size * 0.35} width={size} height={size * 0.3} rx={2} fill="var(--scene-border)" stroke="var(--scene-muted)" />
      <rect y={size * 0.7} width={size} height={size * 0.3} rx={2} fill="var(--scene-border)" stroke="var(--scene-muted)" />
      <circle cx={size * 0.8} cy={size * 0.15} r={2} fill="var(--scene-accent)" />
      <circle cx={size * 0.8} cy={size * 0.5} r={2} fill="var(--scene-accent)" />
      <circle cx={size * 0.8} cy={size * 0.85} r={2} fill="var(--scene-accent)" />
    </g>
  );
}

function CloudIcon({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <path d="M-20 0 C-20-15 -5-20 5-15 C10-25 25-20 25-10 C35-10 35 5 25 5 L-15 5 C-25 5 -25-5 -20 0Z"
        fill="var(--scene-surface)" stroke="var(--scene-muted)" strokeWidth={1.5} />
    </g>
  );
}
```

---

## Composition: Full Architecture SVG

```tsx
function ArchitectureDiagram() {
  return (
    <svg viewBox="0 0 1000 600" className="w-full h-full">
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="var(--scene-muted)" />
        </marker>
        {/* Glow filter for highlighted elements */}
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background grid */}
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <circle cx="20" cy="20" r="0.5" fill="var(--scene-border)" />
      </pattern>
      <rect width="1000" height="600" fill="url(#grid)" />

      {/* Zone labels */}
      <text x={50} y={30} fill="var(--scene-muted)" fontSize={11} fontFamily="var(--scene-mono)">FRONTEND</text>
      <text x={50} y={230} fill="var(--scene-muted)" fontSize={11} fontFamily="var(--scene-mono)">BACKEND</text>
      <text x={50} y={430} fill="var(--scene-muted)" fontSize={11} fontFamily="var(--scene-mono)">DATA LAYER</text>

      {/* Dashed zone separators */}
      <line x1={0} y1={200} x2={1000} y2={200} stroke="var(--scene-border)" strokeDasharray="8 4" />
      <line x1={0} y1={400} x2={1000} y2={400} stroke="var(--scene-border)" strokeDasharray="8 4" />

      {/* Nodes and connections would be rendered here */}
    </svg>
  );
}
```

---

## Animation-Ready SVG Tips

1. **Add class names to animatable groups.** GSAP targets elements by selector.
2. **Use `transform` for positioning.** Animating `transform` is GPU-accelerated.
3. **Use the registered animation controller** for initial, intermediate and final states; reduced motion must retain the explanation without invisible essential content.
4. **Keep path IDs unique.** MotionPathPlugin references paths by ID.
5. **Use `viewBox` without fixed width/height** — let CSS handle sizing for responsiveness.
6. **Layer order matters.** SVG renders in document order (later = on top).
