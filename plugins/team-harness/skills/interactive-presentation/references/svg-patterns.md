# SVG Patterns for React Presentations

Reference for inline SVG composition in React. SVGs render natively in the browser, support GSAP animation, and produce crisp visuals at any resolution.

---

## SVG in React — Basics

```tsx
function Diagram() {
  return (
    <svg viewBox="0 0 800 600" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      {/* Groups for logical sections */}
      <g className="layer-background">
        <rect width="800" height="600" fill="#0f172a" />
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
  fill="#1e293b" stroke="#334155" strokeWidth={1.5} />
<text x={200} y={95} textAnchor="middle" fill="#f1f5f9" fontSize={14} fontFamily="Inter">
  API Gateway
</text>
```

### Circle (State/Event Node)

```tsx
<circle cx={400} cy={300} r={30}
  fill="#1e293b" stroke="#3b82f6" strokeWidth={2} />
<text x={400} y={305} textAnchor="middle" fill="#f1f5f9" fontSize={12}>
  Start
</text>
```

### Diamond (Decision)

```tsx
<g transform="translate(300, 200)">
  <polygon points="0,-35 40,0 0,35 -40,0"
    fill="#1e293b" stroke="#f59e0b" strokeWidth={2} />
  <text y={4} textAnchor="middle" fill="#f1f5f9" fontSize={11}>
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
      <rect x={-30} y={-10} width={60} height={50} rx={2} fill="#1e293b" stroke="#334155" strokeWidth={1.5} />
      {/* Top ellipse */}
      <ellipse cx={0} cy={-10} rx={30} ry={10} fill="#1e293b" stroke="#334155" strokeWidth={1.5} />
      {/* Bottom ellipse (visible part) */}
      <path d="M -30 40 Q 0 60 30 40" fill="none" stroke="#334155" strokeWidth={1.5} />
      {/* Label */}
      <text y={25} textAnchor="middle" fill="#f1f5f9" fontSize={11}>{label}</text>
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
    <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
  </marker>
</defs>
<line x1={200} y1={100} x2={400} y2={100}
  stroke="#64748b" strokeWidth={2} markerEnd="url(#arrowhead)" />
```

### Curved Connection (Bezier)

```tsx
<path
  d="M 200 100 C 300 100, 300 200, 400 200"
  fill="none" stroke="#64748b" strokeWidth={2}
  markerEnd="url(#arrowhead)"
/>
```

### Animated Data Flow (Dots Moving Along Path)

```tsx
<defs>
  <circle id="flow-dot" r="4" fill="#3b82f6" />
</defs>
<path id="data-path" d="M 100 300 C 200 200, 400 400, 500 300" fill="none" stroke="#334155" strokeWidth={1.5} />
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
      <rect width={size} height={size * 0.3} rx={2} fill="#334155" stroke="#64748b" />
      <rect y={size * 0.35} width={size} height={size * 0.3} rx={2} fill="#334155" stroke="#64748b" />
      <rect y={size * 0.7} width={size} height={size * 0.3} rx={2} fill="#334155" stroke="#64748b" />
      <circle cx={size * 0.8} cy={size * 0.15} r={2} fill="#22c55e" />
      <circle cx={size * 0.8} cy={size * 0.5} r={2} fill="#22c55e" />
      <circle cx={size * 0.8} cy={size * 0.85} r={2} fill="#22c55e" />
    </g>
  );
}

function CloudIcon({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <path d="M-20 0 C-20-15 -5-20 5-15 C10-25 25-20 25-10 C35-10 35 5 25 5 L-15 5 C-25 5 -25-5 -20 0Z"
        fill="#1e293b" stroke="#64748b" strokeWidth={1.5} />
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
          <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
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
        <circle cx="20" cy="20" r="0.5" fill="#334155" />
      </pattern>
      <rect width="1000" height="600" fill="url(#grid)" />

      {/* Zone labels */}
      <text x={50} y={30} fill="#64748b" fontSize={11} fontFamily="monospace">FRONTEND</text>
      <text x={50} y={230} fill="#64748b" fontSize={11} fontFamily="monospace">BACKEND</text>
      <text x={50} y={430} fill="#64748b" fontSize={11} fontFamily="monospace">DATA LAYER</text>

      {/* Dashed zone separators */}
      <line x1={0} y1={200} x2={1000} y2={200} stroke="#334155" strokeDasharray="8 4" />
      <line x1={0} y1={400} x2={1000} y2={400} stroke="#334155" strokeDasharray="8 4" />

      {/* Nodes and connections would be rendered here */}
    </svg>
  );
}
```

---

## Animation-Ready SVG Tips

1. **Add class names to animatable groups.** GSAP targets elements by selector.
2. **Use `transform` for positioning.** Animating `transform` is GPU-accelerated.
3. **Set initial states with `opacity: 0`** on elements that should animate in.
4. **Keep path IDs unique.** MotionPathPlugin references paths by ID.
5. **Use `viewBox` without fixed width/height** — let CSS handle sizing for responsiveness.
6. **Layer order matters.** SVG renders in document order (later = on top).
