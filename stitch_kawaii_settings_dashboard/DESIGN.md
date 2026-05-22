---
name: Functional Kawaii
colors:
  surface: '#1E1E1E'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#d5c2c6'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#9d8c90'
  outline-variant: '#514347'
  surface-tint: '#fab3ca'
  primary: '#ffdfe7'
  on-primary: '#502033'
  primary-container: '#ffb7ce'
  on-primary-container: '#7b4458'
  inverse-primary: '#864d61'
  secondary: '#dcb8ff'
  on-secondary: '#44186d'
  secondary-container: '#5e3588'
  on-secondary-container: '#d2a5ff'
  tertiary: '#e7e7e7'
  on-tertiary: '#2f3131'
  tertiary-container: '#cacbcb'
  on-tertiary-container: '#545656'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffd9e3'
  primary-fixed-dim: '#fab3ca'
  on-primary-fixed: '#360b1e'
  on-primary-fixed-variant: '#6a364a'
  secondary-fixed: '#f0dbff'
  secondary-fixed-dim: '#dcb8ff'
  on-secondary-fixed: '#2c0051'
  on-secondary-fixed-variant: '#5b3285'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c7'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#454747'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
  text-secondary: '#B0B0B0'
  divider: '#333333'
  accent-pink-muted: '#FFD1DF'
  accent-purple-deep: '#9D50BB'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-margin: 1rem
  stack-gap-lg: 1.5rem
  stack-gap-md: 1rem
  stack-gap-sm: 0.5rem
  inline-gutter: 0.75rem
---

## Brand & Style

The brand identity strikes a balance between professional utility and playful creativity. Designed for creators and enthusiasts using AI to generate high-aesthetic wallpapers, the personality is approachable yet precise.

The design style follows a **Modern Professional** movement with **Vibrant Accents**. It utilizes a deep dark-mode foundation to make high-resolution wallpapers pop, while "Kawaii-themed" soft pinks and purples provide an energetic, friendly emotional response. The interface avoids unnecessary clutter, focusing on high readability and functional efficiency to ensure the AI generation process feels magical but grounded.

## Colors

The palette is anchored in a true dark-mode experience. The primary background (`#121212`) and surface color (`#1E1E1E`) create a tiered hierarchy that minimizes eye strain. 

Chromatic accents are used sparingly but effectively:
- **Primary Pink:** Used for high-priority actions and active states.
- **Secondary Purple:** Used for supplementary AI-related features and secondary interactive elements.
- **Typography:** Pure white is reserved for high-level information, while a muted grey (`#B0B0B0`) handles metadata and secondary headers to maintain a clear visual hierarchy.
- **Dividers:** Subtle `#333333` lines provide structure without breaking the flow of the dark canvas.

## Typography

The design system uses **Plus Jakarta Sans** for its contemporary, friendly feel that complements the "Kawaii" aesthetic without sacrificing the professional utility required for a SaaS-lite application.

Headers are bold and tight to ensure they command attention, while body text uses a standard weight for maximum legibility against the dark background. A specialized "label-caps" style is used for grey headers and metadata to provide clear section delineation. Mobile-specific sizing ensures that the 22px titles remain the dominant anchor point for each view.

## Layout & Spacing

The layout is optimized for a mobile-first, vertical scrolling experience. It uses a **fluid grid** model where content containers typically span the full width of the safe area, minus a 16px (1rem) margin.

The spacing rhythm is built on an 8px base unit. Larger gaps (24px) are used to separate logical sections (e.g., the AI prompt area from the wallpaper gallery), while smaller gaps (8-12px) are used for internal card elements and label-input pairings. This ensures the UI feels breathable despite the dense information typical of generator apps.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** rather than heavy shadows. 
- **Level 0 (Base):** The `#121212` canvas.
- **Level 1 (Cards):** Surfaces use `#1E1E1E`.
- **Level 2 (Modals/Popups):** Higher-elevated elements use `#2A2A2A` with an extremely subtle, low-opacity (10%) pink-tinted shadow to reinforce the brand's Kawaii accent.

Interactive elements like sliders and toggles use high-contrast color shifts (from grey to pink/purple) rather than depth changes to signify active states.

## Shapes

The shape language is defined by **Rounded (16px/1rem)** corners for all primary containers and cards. This large radius softens the technical nature of AI generation and aligns with the Kawaii aesthetic.

Smaller elements like chips or specific input fields use a slightly reduced radius (8px) for internal consistency, while primary call-to-action buttons may use a full pill-shape (32px+) to differentiate them from static card elements.

## Components

- **Buttons:** Primary buttons use a solid gradient from Soft Pink to Soft Purple with white text. Secondary buttons use a `#333333` border with white text.
- **Cards:** Wallpaper thumbnails and AI setting blocks use the `#1E1E1E` surface with 16px corners. No border is needed; the contrast between the surface and background provides sufficient separation.
- **Inputs:** Text fields use a dark stroke (`#333333`) that turns into a Soft Pink stroke on focus.
- **Toggles & Sliders:** Use the Primary Pink for the active track and thumb. Sliders should have a slightly larger "squishy" tactile feel to match the Kawaii influence.
- **Chips:** Used for AI tags (e.g., "Anime," "Cyberpunk"). These should have a subtle purple background with 10% opacity and a solid purple label.
- **AI Progress Bar:** A thin, animated gradient bar (Pink to Purple) that sits at the top of the card during image generation.