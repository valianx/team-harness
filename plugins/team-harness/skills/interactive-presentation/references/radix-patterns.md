# Radix UI Patterns for Presentation Controls

Reference for building accessible, styled controls using Radix UI primitives. These controls are used for interactive elements within scenes (speed selectors, toggles, sliders for timelines, etc.).

Resolve an HTMLElement portal container inside the current scene content root
before opening a portaled control, preserving its inherited theme and stylesheet.
Pass it through the supported [Select](https://www.radix-ui.com/primitives/docs/components/select#portal)
or [Tooltip](https://www.radix-ui.com/primitives/docs/components/tooltip#portal)
`container` prop; their document-body default leaves that context. Verify popup
placement, focus and outside interaction in the actual scaled scene. The template
fixture checks native controls; it does not establish Radix popup behavior.

---

## Select (Dropdown — Scene Parameters)

Use for letting viewers switch between variants, select data sets, or choose visualization modes.

```tsx
import * as Select from "@radix-ui/react-select";

function SceneSelector({ options, value, onChange, portalContainer }: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  portalContainer: HTMLElement;
}) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-scene-surface border border-scene-border text-sm text-scene-text hover:bg-scene-border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-scene-accent">
        <Select.Value />
        <Select.Icon>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal container={portalContainer}>
        <Select.Content className="rounded-lg bg-scene-surface border border-scene-border shadow-xl overflow-hidden z-50">
          <Select.Viewport className="p-1">
            {options.map((opt) => (
              <Select.Item
                key={opt.value}
                value={opt.value}
                className="px-3 py-1.5 text-sm text-scene-text rounded cursor-pointer outline-none data-[highlighted]:bg-scene-accent data-[highlighted]:text-scene-bg"
              >
                <Select.ItemText>{opt.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
```

---

## Toggle (Play/Pause, Show/Hide Layers)

```tsx
import * as Toggle from "@radix-ui/react-toggle";

function LayerToggle({ label, pressed, onToggle }: {
  label: string;
  pressed: boolean;
  onToggle: (pressed: boolean) => void;
}) {
  return (
    <Toggle.Root
      pressed={pressed}
      onPressedChange={onToggle}
      className="px-3 py-1.5 rounded-lg text-sm border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-scene-accent data-[state=on]:bg-scene-accent data-[state=on]:border-scene-accent data-[state=on]:text-scene-bg data-[state=off]:bg-scene-surface data-[state=off]:border-scene-border data-[state=off]:text-scene-muted"
      aria-label={label}
    >
      {label}
    </Toggle.Root>
  );
}
```

---

## Toggle Group (Mutually Exclusive Options)

```tsx
import * as ToggleGroup from "@radix-ui/react-toggle-group";

function ViewModeSelector({ value, onChange }: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v)}
      className="inline-flex rounded-lg border border-scene-border overflow-hidden"
    >
      {[
        { value: "graph", label: "Graph" },
        { value: "timeline", label: "Timeline" },
        { value: "table", label: "Table" },
      ].map((item) => (
        <ToggleGroup.Item
          key={item.value}
          value={item.value}
          className="px-3 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-scene-accent data-[state=on]:bg-scene-accent data-[state=on]:text-scene-bg data-[state=off]:bg-scene-surface data-[state=off]:text-scene-muted hover:text-scene-text"
        >
          {item.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
```

---

## Slider (Timeline Scrubber, Value Control)

```tsx
import * as Slider from "@radix-ui/react-slider";

function TimelineSlider({ value, max, onChange }: {
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <Slider.Root
      value={[value]}
      max={max}
      step={1}
      onValueChange={([v]) => onChange(v)}
      className="relative flex items-center select-none touch-none w-full h-5"
    >
      <Slider.Track className="relative grow rounded-full h-1.5 bg-scene-border">
        <Slider.Range className="absolute h-full rounded-full bg-scene-accent" />
      </Slider.Track>
      <Slider.Thumb aria-label="Timeline position" className="block w-4 h-4 rounded-full bg-scene-accent shadow-md border-2 border-scene-bg hover:bg-scene-accent-light focus:outline-none focus:ring-2 focus:ring-scene-accent transition-colors" />
    </Slider.Root>
  );
}
```

---

## Tooltip (Information on Hover)

```tsx
import * as Tooltip from "@radix-ui/react-tooltip";

function InfoTooltip({ children, content, portalContainer }: {
  children: React.ReactNode;
  content: string;
  portalContainer: HTMLElement;
}) {
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          {children}
        </Tooltip.Trigger>
        <Tooltip.Portal container={portalContainer}>
          <Tooltip.Content
            side="top"
            sideOffset={8}
            className="px-3 py-2 rounded-lg bg-scene-surface border border-scene-border shadow-xl text-sm text-scene-text max-w-xs animate-fade-in z-50"
          >
            {content}
            <Tooltip.Arrow className="fill-scene-surface" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
```

---

## Composition: Control Bar for a Scene

Shared animation transport uses the component's actual registered controller;
see [GSAP wiring](gsap-patterns.md). Add a scene parameter control only when it
changes the visible component. Bind selectors/toggles to that component's real
state and sliders to its actual position/action, rather than a no-op callback
or a parallel timer. Place extra controls in the reserved overlay area without
duplicating transport or consuming another permanent audience row. Verify focused
Arrow/Space behavior and visible focus in the rendered scene.

---

## Accessibility Notes

1. All Radix primitives are WAI-ARIA compliant out of the box.
2. Always provide `aria-label` on icon-only buttons.
3. Keyboard navigation works automatically (Arrow keys in selects, Space on toggles).
4. Focus rings use `focus:ring-2 focus:ring-scene-accent` — ensure visible focus.
5. Color alone should not convey state — pair with text or icon changes.
