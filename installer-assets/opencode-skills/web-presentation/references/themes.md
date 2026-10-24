# Visual themes

For agents choosing a visual direction for a new Slidev presentation.

Choose a palette from the content, audience and explicit visual preferences.
The names describe styles, not fixed subject matter. Any palette can accompany
any narrative template.

| Selection | Visual direction |
| --- | --- |
| `technical` | Dark navy, cyan accents, restrained technical emphasis |
| `natural` | Light paper, forest green, calm public or collaborative discussions |
| `cosmic` | Dark indigo, violet accents, exploratory or scientific narratives |
| `editorial` | Warm paper, terracotta, serif headings and editorial storytelling |
| `workshop` | Warm yellow, blue accents, guided exercises and collaborative learning |

```bash
node "$skill_root/references/scripts/create-deck.mjs" --template architecture --visual-theme natural --out /absolute/deck
```

The scaffold copies the selected `style.css`, shared color overrides under
`styles/`, and a local SVG favicon into the consumer. It sets the native
`colorSchema` to light or dark without changing `theme: default`, the narrative
content, package pins or addon archive. Omission keeps the previous default.

Shared layout regions, body typography, navigation and frame controls retain
their sizes and behavior. Palettes adapt colors and decorative backgrounds;
editorial headings use an available system serif while body text remains Inter.
Native code uses the kit's 22px size and readable syntax tones on its palette surface.
Illustrations and narrative-specific compositions belong to the source content,
and are not embedded in these reusable themes.

For a copied project, edit its owned styles instead of installed skill assets.
Preserve its identity and manual changes; a new Team Harness installation does
not restyle existing decks. Theme replacement in an existing presentation needs
an authorized edit and fresh visual validation.

Run the copied catalog and actual consumer checks with the chosen palette.
The catalog follows its native light/dark scheme. Inspect code, diagrams,
frame loading/error/fallback states and meaningful reveals at both maintained
viewports, then verify the production subpath. External image colors and detailed
source fidelity remain separate visual and content assessments.
