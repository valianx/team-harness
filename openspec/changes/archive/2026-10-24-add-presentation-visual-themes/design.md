## Context

The evaluated examples demonstrate five palettes using the existing kit. Their narrative-specific grids and illustrations belong to their content. The portable scaffold currently selects only a narrative; native Slidev discovers consumer-owned style.css.

## Goals / Non-Goals

Extract visual choices without packaging example stories or adding another theme engine. Keep control structure, geometry tokens and body typography in the existing versioned kit.

## Decisions

- Add optional --visual-theme independently from --template; omission retains current bytes. This preserves compatibility instead of making every deck adopt a new default.
- Copy an allowlisted palette, shared color overrides and local favicon into the consumer. Preserve native theme: default and the addon archive; separate Slidev theme packages would add unnecessary dependency identities.
- Set only the first headmatter colorSchema and favicon for a selected palette. Do not rewrite slide bodies or later metadata.
- Scope styles to harness slides and override surfaces and contrast, preserving controls, regions and font sizes. Editorial headings can use a local system serif; body text remains Inter.
- The maintained catalog inherits the selected native light/dark scheme because it already inherits consumer CSS. Keep contrast assertions and the stock dark fallback.
- Native code blocks use the kit's intended 22px size through Slidev's font variable. Mix syntax hues toward each palette's readable code foreground because the upstream token palette assumes a different background.

## Risks / Trade-offs

- Light palettes expose hardcoded dark code/frame surfaces → color-only shared overrides and actual browser contrast checks.
- Header metrics or backgrounds can alter readability → exercise all six layouts and native reveals at both maintained viewports.
- Installed consumers could depend on previous styling → only new explicit theme selection applies; no upgrade or restyling command.

## Migration Plan

No existing project migration. New decks own copied CSS/assets. Removing the scaffold option restores the previous default workflow; existing consumers retain their files.
