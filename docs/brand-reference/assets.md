# Local brand assets

Prepared 2026-11-06 for the official-site visual restyle. No paid generation used.

## Typography

The official [stylesheet](https://mashabear.com/template/css/index.min.css) declares `Phosphate` (400) for display text and `Nunito` (500, 700, 800, 900) for body/UI text. Its exact display font is served at `https://mashabear.com/template/fonts/Phosphate-Regular.woff2`. The site does not supply a redistribution license for that file, so it is not copied into this project.

| Local asset | Role | Source and license | Verified coverage |
|---|---|---|---|
| `public/assets/brand/RubikOne-Regular.woff2` | Heavy display headings; use weight 400 because this design is intrinsically heavy | [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/rubikone), SIL Open Font License 1.1; local `RubikOne-OFL.txt` | Complete Latin A–Z/a–z, Russian alphabet including Ё/ё, and digits 0–9 |
| `public/assets/brand/Nunito-Variable.woff2` | Body copy and functional UI, weights 200–1000 | [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/nunito), SIL Open Font License 1.1; local `Nunito-OFL.txt` | Complete Latin A–Z/a–z, Russian alphabet including Ё/ё, and digits 0–9 |
| `public/assets/brand/forest-silhouette.svg` | Subtle yellow forest at workspace margins | Original hand-authored vector; no third-party image source | Decorative, no text |

Rubik One follows the official site's chunky display character; it is an adaptation, not the exact Phosphate face. Self-hosting Nunito removes the runtime Google Fonts request and ensures both language alphabets are available. Fonts were downloaded from the `google/fonts` repository and converted to WOFF2 with FontTools/Brotli. Unicode coverage was verified from their `cmap` tables before and after conversion; outlines and code-point mappings are unchanged. Both contain all 128 tested Latin/Russian letters and digits. Rubik One has 559 mapped code points; Nunito has 938.

Recommended declarations:

```css
@font-face {
  font-family: "Rubik One";
  src: url("/assets/brand/RubikOne-Regular.woff2") format("woff2");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: "Nunito";
  src: url("/assets/brand/Nunito-Variable.woff2") format("woff2");
  font-style: normal;
  font-weight: 200 1000;
  font-display: swap;
}
```

Use Rubik One sparingly for identity and section headings. Long story text, timecodes, small buttons, and Russian editor labels need Nunito's open letterforms. Uppercase via CSS works for Russian as well as English. Avoid synthetic bold on Rubik One.

SHA-256 provenance:

```text
fced18ce7220d7504aba15adebd58f63d29eca554180aa74ea7545c9e07e6548  RubikOne-Regular.ttf
bb55a5ca5c2042335b3991af27c4d0705d0ef41cac6164ac737fd8f2a1e85207  Nunito-Variable.ttf
```

Production WOFF2 sizes: 40,836 bytes (Rubik One) and 101,136 bytes (Nunito). Source TTF SHA-256 hashes above identify the upstream files; compressed SHA-256 hashes are `3849d55df131c7956fc47248ec42d9ceb290c928090e1c194435b6c67ede7f48` and `e951c345e395174e3348dae912c22d008225a5051bd556985b4ec0432ee6810b` respectively. The forest SVG intentionally uses low-opacity warm silhouettes, leaving the central workspace quiet. It is suitable as a fixed bottom-aligned background; it should not overlay the animation canvas or receive pointer events.
