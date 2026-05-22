# Kawaii Baby Wallpapers HD

Dark-themed Zedge-style wallpaper app for cute AI baby characters. Built with Expo 55 + Expo Router.

## Setup

```bash
npm install
npx expo start
```

Then press `a` for Android emulator, `i` for iOS simulator, or scan the QR with Expo Go.

## Structure

- `app/` — Expo Router file-based routes
  - `(tabs)/` — bottom tab group (Wallpapers, Ringtones, AI Generator, My Zedge)
  - `wallpaper/[id].tsx` — full-screen preview with blur-on-load
- `components/` — `Header`, `TopTabs`, `CategoryIcons`, `FeaturedCarousel`, `CollectionGrid`, `GlassCard`, `SectionTitle`
- `constants/` — `theme.ts` (palette, radius, spacing) and `mockData.ts`

## Theme

| Token | Value |
|-------|-------|
| `bg` | `#0D0D0D` |
| `bgAlt` | `#121212` |
| `lavender` | `#B388FF` |
| `pink` | `#FFB6C1` |
| `cyan` | `#00E5FF` |
| `text` | `#FFFFFF` |
| `textDim` | `#B3B3B3` |

## Image source

Placeholders pulled from `picsum.photos` via deterministic `seed` strings so the same card always renders the same image. Swap the URLs in `constants/mockData.ts` for your AI-generated assets when ready.
