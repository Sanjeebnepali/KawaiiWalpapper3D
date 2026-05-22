# Kawaii Baby Wallpapers - Development Brief (Phase 2)

**Status:** PRODUCTION-READY IMPLEMENTATION  
**Priority Level:** CRITICAL  
**Target:** Ship-ready code (all 7 tasks)  
**Date:** 2026-05-15

## Production-Ready Specifications

**Answers to Clarification Questions:**

1. **Scope Priority:** ALL 7 TASKS implemented in order
   - Priority: 1→7 as listed below
   - All fully functional, no stubs or demos
   
2. **Image Assets:** Use Imagefree.org batch (kawaii 3D baby character images)
   - User will generate batch and provide URLs
   - Code uses those URLs in mockData
   - Placeholder pics() function provides fallback during dev
   
3. **Production-Ready Standards:** YES to all
   - ✅ Comprehensive error handling
   - ✅ Loading/skeleton states throughout
   - ✅ Full TypeScript typing (strict mode)
   - ✅ Performance optimized (memoization, lazy loading, pagination)
   - ✅ Responsive design tested
   - ✅ Zero console errors/warnings
   - ✅ Proper fallbacks for all edge cases
   
4. **Video Playback:** Use `expo-video` with proper lifecycle management
   - Install via `npm install expo-video --legacy-peer-deps`
   - Requires native rebuild on first run
   - Include loading states and error boundaries
   
5. **Wallpaper OS Integration:** Full native integration
   - Android: WallpaperManager API
   - iOS: Proper wallpaper setting APIs
   - Fallback for API limitations
   
6. **Database/Backend:** Keep in mockData.ts (Zustand store for future scaling)
   - All data sourced from `constants/mockData.ts`
   - Settings state in `store/settings.ts`
   - Ready for real API swap (only hook bodies change)

---

## Executive Summary

Current app has core structure. Phase 2 delivers:
1. Two new tabbar tabs (Couple Theme, Mood Based) - TABBAR POSITION
2. Premium color themes in Settings (6-8 patterns with glassmorphism)
3. Performance optimization (lag-free category switching)
4. Video wallpaper playback (full implementation)
5. Dual wallpaper OS integration (lock + home screen)
6. Search/filter real logic (full-text + multi-select)
7. Theme-Based/Popular engagement (featured carousel + Polish)

---

## Task 1: Add Two New Tabbar Buttons

**What:** Add "Couple Theme" and "Mood Based Theme" navigation tabs  
**Where:** `app/(tabs)/_layout.tsx` tabbar configuration  
**Position:** Beside Home (Gallery) and AI tabs  
**Files to Create/Modify:**
- `app/(tabs)/_layout.tsx` - Update Tabs configuration
- `app/wallpapers/couple-theme.tsx` - NEW
- `app/wallpapers/mood-theme.tsx` - NEW
- `components/CustomTabBar.tsx` - Update tab order

**Requirements:**
- Couple Theme: Show romantic/couple-oriented wallpapers
- Mood Based: Show wallpapers by emotion (happy, sad, calm, romantic, focused, etc.)
- Match existing visual style (pink accent `Colors.pink`, dark theme)
- Use 2-col grid layout like existing category screens
- Icon design: Custom icons for each tab (heart for couple, emoji/expression for mood)
- Smooth navigation with slide animation

**Expected Output:**
```
Tab Order: [AI Generator] [Home/Gallery] [Couple Theme] [Mood Based] [Settings]
                          ↑ elevated pink button (existing)
```

---

## Task 2: Add 6-8 Premium Color Themes

**What:** Extend theme selection in Settings with premium, visually attractive patterns  
**Where:** `app/(tabs)/profile.tsx` (Settings screen)  
**Files to Modify:**
- `constants/theme.ts` - Define new theme objects
- `app/(tabs)/profile.tsx` - Update theme selector UI

**Current State:**
- Only dark theme available
- Basic colors without visual polish
- No premium/distinctive feel

**New Themes to Add (8 total):**

1. **Sunset Gradient** - Warm oranges/reds with pink accents
2. **Ocean Blue** - Cool blues with cyan highlights
3. **Forest Green** - Deep greens with emerald accents
4. **Purple Cosmic** - Deep purples with violet glows
5. **Rose Gold** - Warm golds with rose highlights (premium feel)
6. **Aurora Lights** - Cool purples/blues with mint accents
7. **Midnight Neon** - Dark with electric neon highlights
8. **Lavender Dreams** - Soft purens with blush tones

**Each Theme Must Include:**
- Primary color
- Secondary accent color
- Background color/gradient
- Card shadow colors
- Text colors (light/dark variants)
- Tab bar colors
- Button colors

**Visual Requirements:**
- Glassmorphism cards (semi-transparent with blur)
- Gradient backgrounds where appropriate
- Smooth shadows for depth
- Consistent padding/spacing
- Premium/high-end appearance

**Settings UI:**
- Show theme preview cards (small tiles)
- Allow tap to select
- Show currently active theme with checkmark
- Add color name label

---

## Task 3: Fix Performance Lag (2-3 second pause)

**Issue:** App freezes for 2-3 seconds when clicking Popular/Newest/Category tabs  
**Current Files:**
- `hooks/useFetchWallpapers.ts` - Data fetching
- `app/(tabs)/index.tsx` - Home screen with TopTabs
- `components/CategoryPreviewList.tsx` - Wallpaper grid

**Diagnosis Points:**
1. Check if `useFetchWallpapers` is blocking render
2. Verify FlatList optimization settings:
   - `removeClippedSubviews={true}`
   - `maxToRenderPerBatch={10}`
   - `updateCellsBatchingPeriod={50}`
   - `initialNumToRender={10}`
3. Check Image component caching:
   - `expo-image` should use `cachePolicy="memory"`
4. Ensure data fetching in useEffect, NOT render phase
5. Check if all 200+ images loading at once (implement pagination)

**Solutions:**
- Implement pagination (load 20 per scroll, lazy load more)
- Add loading skeleton while fetching
- Memoize components (`React.memo`)
- Use `useMemo` for filtered lists
- Profile with React DevTools Profiler
- Move expensive operations to workers if possible

**Expected Result:**
- Instant tab switch
- Progressive image loading with skeleton
- No visible pause/freeze

---

## Task 4: Implement Video Wallpaper Playback

**Issue:** Video wallpaper feature is stubbed (Phase 2 requirement)  
**Current State:** `app/wallpapers/video.tsx` shows placeholder  
**Required Package:** `expo-video`

**Implementation Steps:**
1. Install: `npm install expo-video --legacy-peer-deps`
2. Create VideoWallpaperCard component
3. Build VideoWallpapersScreen similar to image grid
4. Add playback controls (play/pause/seek)
5. Implement loading states with placeholder image
6. Add error handling for video not found
7. Optimize video caching and memory usage
8. Test on both Android and iOS

**Files to Create/Modify:**
- `components/VideoWallpaperCard.tsx` - NEW
- `app/wallpapers/video.tsx` - Replace stub with real implementation
- `constants/mockData.ts` - Add sample video URLs (or use local videos)
- Update `useFetchWallpapers` hook to support video type

**Video URLs (example):**
- Use small MP4 files or HLS streams
- Optimize for mobile (small file size, HD quality)
- Consider Cloudinary video hosting (free tier available)

---

## Task 5: Fix Dual Wallpaper Feature

**Issue:** "Dual Wallpaper" shows 2 different images  
**Expected Behavior:** Apply same wallpaper to lock screen + home screen

**Current State:** `app/wallpapers/dual.tsx`  
**Required Changes:**
1. Show single wallpaper image (not two)
2. Add option buttons: "Lock Screen" / "Home Screen" / "Both"
3. Implement native wallpaper setting:
   - Android: Use `WallpaperManager` or equivalent native module
   - iOS: Use proper iOS wallpaper API
4. Add confirmation UI with success message
5. Store user preference in settings store

**Files to Modify:**
- `app/wallpapers/dual.tsx` - Complete rewrite
- `store/settings.ts` - Add wallpaper preference state (if needed)
- May need native module for wallpaper setting

**Alternative (if native module complex):**
- Just implement "set as lock screen" and "set as home screen" separately
- Use existing OS intent/API without custom native code

---

## Task 6: Implement Search & Filter Logic

**Issue:** Search bar and filter buttons exist but don't work  
**Current Files:**
- `app/(tabs)/index.tsx` - Header with search
- Category/wallpaper screens - Filter UI

**Search Implementation:**
- Add search query state (useState)
- Filter wallpapers by: name, tags, category, description
- Show results in modal/overlay or dedicated screen
- Real-time search as user types
- Clear/reset button

**Filter Implementation:**
- By category (Kawaii, Fashion, Nature, etc.)
- By mood (Happy, Sad, Calm, Focused, Romantic)
- By color palette (if available in mockData)
- By trending/newest/popular
- Multi-select support (show active filters)
- Clear all filters button

**Files to Create/Modify:**
- `hooks/useSearch.ts` - NEW (search logic)
- `hooks/useFilter.ts` - NEW (filter logic)
- `hooks/useFetchWallpapers.ts` - Integrate search/filter
- `app/(tabs)/index.tsx` - Wire up search input
- Category screens - Add filter UI

**Search UI:**
- Modal or new screen with results
- Highlight matching terms
- Show "No results" state

**Filter UI:**
- Horizontal scroll of filter chips/buttons
- Show selected count badge
- "Clear All" button

---

## Task 7: Improve Theme-Based & Popular Collections Engagement

**Issue:** Theme-Based and Popular Collections tabs have low click-through rates  
**Root Causes:**
1. Low visibility in UI
2. Tab labels unclear or not compelling
3. Content (mockData) may be low quality
4. No preview of what's inside
5. Top section not prominent enough

**Improvements:**
1. **Featured Carousel** - Add hero carousel before categories (5-10 best wallpapers)
2. **Preview Cards** - Show thumbnail previews on Home for each collection
3. **Better Labels** - Rename/improve tab names
4. **Badges** - Show "NEW", "15+ items", "Trending" badges
5. **Explore CTAs** - Add "Explore More" buttons under each section
6. **Update mockData** - Replace placeholder images with actual kawaii wallpapers from Imagefree.org batch

**Files to Modify:**
- `app/(tabs)/index.tsx` - Add featured carousel at top
- `constants/mockData.ts` - Update with real wallpaper URLs
- `components/CategoryPreviewList.tsx` - Improve card styling
- `components/TopTabs.tsx` or equivalent - Make more prominent

**Visual Polish:**
- Better shadows/borders on cards
- Hover/press states
- Smooth transitions
- Color-coded by theme (each collection has accent color)
- Image quality check (ensure all images are high-resolution)

---

## Code Structure Reference

**Key Files to Know:**
```
app/
  ├── _layout.tsx (root wrapper)
  ├── (tabs)/ (tabbar screens)
  │   ├── _layout.tsx (tab configuration)
  │   ├── index.tsx (home/gallery)
  │   ├── ai.tsx (generator)
  │   ├── profile.tsx (settings)
  │   └── (new) couple-theme.tsx
  │   └── (new) mood-theme.tsx
  ├── wallpapers/
  │   ├── video.tsx (videos - needs implementation)
  │   ├── dual.tsx (lock+home wallpapers)
  │   ├── theme-packs.tsx (good, keep as is)
  │   └── (new) couple-theme.tsx
  │   └── (new) mood-theme.tsx
  ├── category/[id].tsx
  └── wallpaper/[id].tsx

components/
  ├── CustomTabBar.tsx (update for new tabs)
  ├── CategoryPreviewList.tsx (improve styling)
  ├── TopTabs.tsx (make more prominent)
  └── (new) VideoWallpaperCard.tsx

hooks/
  ├── useFetchWallpapers.ts (add search/filter integration)
  ├── (new) useSearch.ts
  └── (new) useFilter.ts

store/
  └── settings.ts (add new themes)

constants/
  ├── theme.ts (add 8 new premium themes)
  └── mockData.ts (update with real kawaii images)
```

---

## Performance Checklist

- [ ] FlatList has `removeClippedSubviews={true}`
- [ ] Image component uses `cachePolicy="memory"`
- [ ] Heavy operations in useEffect, not render
- [ ] Components memoized with `React.memo`
- [ ] Pagination implemented for large lists
- [ ] No unnecessary re-renders (check DevTools Profiler)
- [ ] Loading skeletons shown during fetch
- [ ] Tab switching is instant (< 100ms)

---

## Testing Checklist

- [ ] All 4 tabs smooth navigation (no lag)
- [ ] Search filters real-time
- [ ] Filters work with multiple selections
- [ ] Video playback works (Android + iOS)
- [ ] Wallpaper setting works (lock + home screen)
- [ ] Theme colors apply throughout app
- [ ] No crashes or errors
- [ ] Images load progressively
- [ ] All new screens have proper SafeAreaView

---

## Priority Order (Recommended)

1. **Task 7:** Update mockData with real kawaii images (enables all other tasks)
2. **Task 1:** Add two new tabs (structural change)
3. **Task 2:** Add premium themes (quick win, high polish impact)
4. **Task 3:** Fix performance lag (critical UX)
5. **Task 6:** Search/filter logic (engagement feature)
6. **Task 4:** Video playback (Phase 2 feature)
7. **Task 5:** Dual wallpaper OS integration (complex, can be last)

---

## Notes

- **CLAUDE.md** has critical dependency info (don't upgrade versions casually)
- Use `--legacy-peer-deps` for npm installs
- Metro cache gotcha: kill port 8081 if seeing stale errors
- TypeScript is editor-only; build uses Babel
- All animations use Reanimated v4 (don't downgrade)
- No tests/lint wired up (not blocking)
- Safe-area context required on all new screens
