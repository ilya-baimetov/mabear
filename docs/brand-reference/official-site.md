# Official-site visual direction

User direction, 2026-11-06: the game's visual presentation should follow https://mashabear.com/en-us/. This concerns the visual treatment of the existing creation workflow.

Browsed the actual [homepage](https://mashabear.com/en-us/), [Masha page](https://mashabear.com/en-us/characters/masha), [cartoons](https://mashabear.com/en-us/cartoons) and [apps](https://mashabear.com/en-us/apps/). Source inspection also covered News. Browser observations used the current narrow viewport; desktop layout behavior was not visually audited in this reference pass.

## Verified visual vocabulary

The [official CSS](https://mashabear.com/template/css/index.min.css) defines a golden-yellow/orange base (`#FAB31A`, `#ED732E`), magenta (`#C4296C`) and purple (`#702C7E`, `#54295E`) accents, white cards and gray body copy (`#767679`). Display headings/buttons use Phosphate; body/UI uses Nunito. Media/cards commonly have 20px corners; custom SVG masks give buttons and heading plaques softly irregular silhouettes. Character cutouts, large episode imagery, forest silhouettes and tangible shadows make the pages feel playful.

## Application to the studio

| Priority | Area | Proposed visual treatment |
|---|---|---|
| 1 | Overall palette | Warm yellow surrounding the workspace; white writing surfaces; purple structure and magenta emphasis. Select exact text/background pairings for readability. |
| 1 | Typography | Chunky display lettering for identity and major headings; readable Nunito for scripts, timing and dense controls. Verify Russian glyph coverage. |
| 1 | Player and primary controls | A confident purple frame, prominent play control and clear white icons. Keep time and transport labels easy to scan. |
| 2 | Storyboard | Bright media-led cards, rounded corners, a strong magenta selected state and deliberate depth. |
| 2 | Branded shapes | Use irregular plaques and buttons selectively, especially major actions and section headings. Writing fields need stable, quiet boundaries. |
| 3 | Character/environment decoration | Place expressive character artwork and faint forest silhouettes around suitable margins and empty states. Keep the movie and script legible. |

Recommendation: make the studio feel like a creative tool belonging to this cartoon. Palette alone is insufficient; typography, silhouette and imagery are equally important. The official site's promotional carousels, popups and mobile login bar are not requirements for the editor. Preserve visible keyboard focus and restrained motion rather than inheriting the website's outline removal and large hover scaling.

This reference pass preceded implementation. The applied theme, adversarial update round and deployment are now recorded in [README.md](README.md).
