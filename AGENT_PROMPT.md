# AI Agent: Kawaii Baby Wallpapers - Critical Fixes & Feature Completion

## PROJECT STATUS
- **Completed:** Couple/Mood tabs, premium themes, performance fixes, video playback basics, dual wallpaper structure, search/filter, engagement improvements (Tasks 1-7 ✅)
- **Broken/Missing:** Wallpaper actually setting, theme color application, component validation, editor, sharing (Tasks 8-16 🔴)

---

## CRITICAL ISSUES TO FIX (IN ORDER)

### **ISSUE 1: Wallpaper Setting is Non-Functional (Android)**
**Location:** `app/wallpapers/dual.tsx` lines 42-75  
**Current State:** `setWallpaper()` is fake — waits 1200ms then shows success toast. No actual wallpaper applied.  
**Required Output:**

1. **Create new file:** `hooks/useWallpaperManager.ts`
```typescript
import { Platform, Linking, Share, Alert } from 'react-native';
import { useCallback } from 'react';

export function useWallpaperManager() {
  const setWallpaper = useCallback(
    async (imageUri: string, target: 'lock' | 'home' | 'both') => {
      try {
        if (Platform.OS === 'android') {
          // Option A (Recommended): Use native module
          // npm install react-native-wallpaper-manager --legacy-peer-deps
          // const WallpaperManager = require('react-native-wallpaper-manager');
          // const wallpaperType = target === 'lock' ? WallpaperManager.WALLPAPER_LOCK_SCREEN 
          //                       : target === 'home' ? WallpaperManager.WALLPAPER_SYSTEM
          //                       : WallpaperManager.WALLPAPER_BOTH;
          // await WallpaperManager.setWallpaper(imageUri, wallpaperType);
          
          // Option B (Fallback): Use Linking + Share
          await Share.share({
            url: imageUri,
            title: 'Set as Wallpaper',
            message: 'Tap "Save Image" to set as wallpaper',
          });
        } else {
          // iOS: Use Share API (user manually applies from share sheet)
          await Share.share({
            url: imageUri,
            title: 'Set as Wallpaper',
            message: 'Tap "Save Image" then Settings > Wallpaper > Choose Photo',
          });
        }
        return true;
      } catch (error) {
        console.error('Wallpaper set failed:', error);
        throw error;
      }
    },
    [],
  );

  return { setWallpaper };
}
```

2. **Update:** `app/wallpapers/dual.tsx`
   - Line 1: Add import: `import { useWallpaperManager } from '../../hooks/useWallpaperManager';`
   - Line 42-75: Replace entire `setWallpaper` function with:
```typescript
const { setWallpaper: applyWallpaper } = useWallpaperManager();

const setWallpaper = useCallback(
  async (imageUri: string, target: WallpaperTarget, title: string) => {
    try {
      setApplyingId(title);
      await applyWallpaper(imageUri, target);
      
      const targetLabel = {
        lock: 'lock screen',
        home: 'home screen',
        both: 'lock screen and home screen',
      }[target];

      const msg = `✓ Wallpaper set to ${targetLabel}`;
      if (Platform.OS === 'android') {
        ToastAndroid.show(msg, ToastAndroid.LONG);
      } else {
        Alert.alert('Success', msg);
      }

      setApplyingId(null);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to set wallpaper');
      setApplyingId(null);
    }
  },
  [applyWallpaper],
);
```

**Verification:**
- ✅ Tapping "Lock Screen" button opens share sheet (Android) or system wallpaper UI
- ✅ Tapping "Home Screen" and "Both Screens" works correctly
- ✅ Success/error alerts show appropriate messages
- ✅ Test on actual Android device (not just emulator)

---

### **ISSUE 2: Theme Colors Not Applied to Wallpaper Screens**
**Location:** `app/wallpapers/dual.tsx` and `app/wallpapers/video.tsx`  
**Current State:** Use static `Colors.bg`, `Colors.text` — don't update when user changes theme in Settings.  
**Required Output:**

1. **Update:** `app/wallpapers/dual.tsx`
   - Verify line 30 has: `const theme = useTheme();` (should already exist)
   - Line 104: Change `{ backgroundColor: Colors.bg }` → `{ backgroundColor: theme.bg }`
   - Line 114, 116: Change `Colors.text` → `theme.text`
   - Verify import exists: `import { useTheme } from '../../contexts/ThemeContext';`

2. **Update:** `app/wallpapers/video.tsx`
   - Line 40: Add `const theme = useTheme();` (if not already present)
   - Line 123: Change `{ backgroundColor: Colors.bg }` → `{ backgroundColor: theme.bg }`
   - Line 142, 152: Change `Colors.text` → `theme.text`
   - Add import: `import { useTheme } from '../../contexts/ThemeContext';`

**Verification:**
- ✅ Navigate to Settings (profile tab)
- ✅ Change theme color
- ✅ Go back to Dual Wallpapers or Video Wallpapers screens
- ✅ Background and text colors update immediately
- ✅ Header text is readable on new background

---

### **ISSUE 3: VideoWallpaperCard Component Missing/Broken**
**Location:** `components/VideoWallpaperCard.tsx` (used by `app/wallpapers/video.tsx` line 88)  
**Current State:** Component may be missing or not showing play icon/duration properly.  
**Required Output:**

Create or fix `components/VideoWallpaperCard.tsx`:
```typescript
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Spacing } from '../constants/theme';

export interface VideoWallpaperCardProps {
  id: string;
  thumbnail: string;
  title: string;
  duration: string; // e.g., "2:15"
  width: number;
  height: number;
  onPlay: (videoId: string) => void;
}

export function VideoWallpaperCard({
  id,
  thumbnail,
  title,
  duration,
  width,
  height,
  onPlay,
}: VideoWallpaperCardProps) {
  return (
    <Pressable
      onPress={() => onPlay(id)}
      style={({ pressed }) => [
        styles.card,
        { width, height },
        pressed && styles.pressed,
      ]}
    >
      {/* Thumbnail Image */}
      <Image
        source={{ uri: thumbnail }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
      />

      {/* Play Icon Overlay (centered) */}
      <View style={styles.playOverlay}>
        <Ionicons name="play-circle" size={48} color="#ffffff" />
      </View>

      {/* Duration Badge (bottom-right) */}
      <View style={styles.durationBadge}>
        <Text style={styles.durationText}>{duration}</Text>
      </View>

      {/* Title Overlay (bottom) */}
      <View style={styles.titleBar}>
        <Text style={styles.titleText} numberOfLines={1}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    position: 'relative',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  durationBadge: {
    position: 'absolute',
    bottom: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  durationText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  titleBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: Spacing.sm,
  },
  titleText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
```

**Verification:**
- ✅ All 8 video cards show in grid with thumbnails
- ✅ Play icon visible in center of each thumbnail
- ✅ Duration text visible in bottom-right corner
- ✅ Video title visible at bottom
- ✅ Tapping card opens VideoPlayer with correct video
- ✅ Press animation works (opacity + scale)

---

### **ISSUE 4: WallpaperGridCell Component Missing Heart Toggle Integration**
**Location:** `components/WallpaperGridCell.tsx` (used by `app/(tabs)/mood.tsx` line 98)  
**Current State:** Component exists but heart toggle may not integrate with Zustand favorites store.  
**Required Output:**

Fix or create `components/WallpaperGridCell.tsx`:
```typescript
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import { Colors, Radius, Spacing } from '../constants/theme';
import { useIsFavorite, useToggleFavorite } from '../store/favorites';

export interface WallpaperGridCellProps {
  id: string;
  image: string;
  width: number;
  height: number;
  accent?: string; // Optional color for shadow/glow
  onOpen: (id: string) => void;
}

export function WallpaperGridCell({
  id,
  image,
  width,
  height,
  accent,
  onOpen,
}: WallpaperGridCellProps) {
  const isFavorite = useIsFavorite(id);
  const toggleFavorite = useToggleFavorite();

  const handleHeartPress = () => {
    toggleFavorite(id);
  };

  return (
    <Pressable
      onPress={() => onOpen(id)}
      style={({ pressed }) => [
        styles.card,
        { width, height, shadowColor: accent || Colors.pink },
        pressed && styles.pressed,
      ]}
    >
      {/* Image */}
      <Image
        source={{ uri: image }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
      />

      {/* Heart Button (top-right, non-blocking) */}
      <Pressable
        onPress={handleHeartPress}
        style={styles.heartBtn}
        hitSlop={8}
      >
        <Ionicons
          name={isFavorite ? 'heart' : 'heart-outline'}
          size={22}
          color={isFavorite ? accent || Colors.pink : '#ffffff'}
        />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  heartBtn: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
```

**Verification:**
- ✅ Heart icon appears in top-right of each card
- ✅ Heart is outline (white) when not favorited
- ✅ Tapping heart fills it with color and toggles state
- ✅ State persists when navigating away and back
- ✅ Tapping image (not heart) opens wallpaper preview
- ✅ Verify `store/favorites.ts` has `useIsFavorite()` and `useToggleFavorite()` hooks

---

### **ISSUE 5: Add "Set as Wallpaper" Button to Wallpaper Preview**
**Location:** `app/wallpaper/[id].tsx`  
**Current State:** Full-screen preview has no way to apply wallpaper.  
**Required Output:**

1. Add import: `import { useWallpaperManager } from '../hooks/useWallpaperManager';`
2. Inside component, add:
```typescript
const { setWallpaper } = useWallpaperManager();

const handleSetWallpaper = () => {
  Alert.alert(
    'Set Wallpaper',
    'Where would you like to apply this wallpaper?',
    [
      {
        text: 'Lock Screen',
        onPress: () => setWallpaper(wallpaperUrl, 'lock').catch(e => Alert.alert('Error', e.message)),
      },
      {
        text: 'Home Screen',
        onPress: () => setWallpaper(wallpaperUrl, 'home').catch(e => Alert.alert('Error', e.message)),
      },
      {
        text: 'Both Screens',
        onPress: () => setWallpaper(wallpaperUrl, 'both').catch(e => Alert.alert('Error', e.message)),
      },
      { text: 'Cancel', style: 'cancel' },
    ],
  );
};
```

3. Add button to header (next to heart icon):
```typescript
<Pressable onPress={handleSetWallpaper} style={styles.setBtn} hitSlop={8}>
  <Ionicons name="download" size={22} color={Colors.text} />
</Pressable>
```

**Verification:**
- ✅ Download icon visible in header alongside heart icon
- ✅ Tapping opens alert with 3 options
- ✅ Selecting option triggers wallpaper set

---

### **ISSUE 6: Add "Set as Wallpaper" Button to Video Player**
**Location:** `components/VideoPlayer.tsx` controls overlay  
**Current State:** Can play videos but cannot apply as wallpaper.  
**Required Output:**

Update `components/VideoPlayer.tsx`:

1. Add import: `import { useWallpaperManager } from '../hooks/useWallpaperManager';`
2. Inside component, add:
```typescript
const { setWallpaper } = useWallpaperManager();

const handleSetAsWallpaper = () => {
  // Note: Video wallpaper support varies by device
  Alert.alert(
    'Set as Wallpaper',
    Platform.OS === 'ios' 
      ? 'Video wallpapers require iOS 16+. Will use first frame as image.' 
      : 'Set this video as your wallpaper?',
    [
      {
        text: 'Lock Screen',
        onPress: () => {
          // For now, show message (actual video wallpaper needs native implementation)
          Alert.alert('Info', 'Video wallpaper requires native module. Contact developer.');
        },
      },
      {
        text: 'Home Screen',
        onPress: () => {
          Alert.alert('Info', 'Video wallpaper requires native module. Contact developer.');
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ],
  );
};
```

3. Add button to controls (line 173, before closing `</View>`):
```typescript
<Pressable onPress={handleSetAsWallpaper} style={styles.btn} hitSlop={8}>
  <Ionicons
    name="download"
    size={24}
    color={Colors.text}
  />
</Pressable>
```

**Verification:**
- ✅ Download icon appears in controls next to play/mute buttons
- ✅ Tapping shows alert with platform-appropriate message
- ✅ Button doesn't block video playback controls

---

### **ISSUE 7: Create Image Editor Modal**
**Location:** `components/ImageEditorModal.tsx` (new component) + `app/wallpaper/[id].tsx`  
**Current State:** No image editing capability.  
**Required Output:**

Create `components/ImageEditorModal.tsx`:
```typescript
import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Colors, Radius, Spacing } from '../constants/theme';
import { Slider } from './Slider'; // Assumes Slider component exists

export interface ImageEditorModalProps {
  imageUri: string;
  onSave: (editedUri: string) => void;
  onCancel: () => void;
}

export function ImageEditorModal({ imageUri, onSave, onCancel }: ImageEditorModalProps) {
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [saturation, setSaturation] = useState(1);

  const handleReset = () => {
    setBrightness(1);
    setContrast(1);
    setSaturation(1);
  };

  const handleApply = () => {
    // TODO: Implement actual image processing using expo-image-manipulator or react-native-image-crop-picker
    // For now, just callback with original URI
    onSave(imageUri);
  };

  return (
    <View style={styles.container}>
      {/* Preview */}
      <View style={styles.previewWrap}>
        <Image
          source={{ uri: imageUri }}
          style={[
            styles.preview,
            {
              opacity: brightness,
            },
          ]}
          contentFit="contain"
        />
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <View style={styles.control}>
          <Text style={styles.label}>Brightness</Text>
          <Slider
            value={brightness}
            onValueChange={setBrightness}
            min={0.5}
            max={1.5}
            step={0.1}
          />
        </View>

        <View style={styles.control}>
          <Text style={styles.label}>Contrast</Text>
          <Slider
            value={contrast}
            onValueChange={setContrast}
            min={0.5}
            max={1.5}
            step={0.1}
          />
        </View>

        <View style={styles.control}>
          <Text style={styles.label}>Saturation</Text>
          <Slider
            value={saturation}
            onValueChange={setSaturation}
            min={0.5}
            max={1.5}
            step={0.1}
          />
        </View>

        {/* Buttons */}
        <View style={styles.buttons}>
          <Pressable onPress={handleReset} style={styles.btn}>
            <Text style={styles.btnText}>Reset</Text>
          </Pressable>
          <Pressable onPress={onCancel} style={[styles.btn, styles.btnCancel]}>
            <Text style={styles.btnTextCancel}>Cancel</Text>
          </Pressable>
          <Pressable onPress={handleApply} style={[styles.btn, styles.btnApply]}>
            <Text style={styles.btnText}>Apply</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  previewWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  controls: {
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  control: {
    gap: Spacing.sm,
  },
  label: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  btn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
    backgroundColor: Colors.border,
  },
  btnCancel: {
    backgroundColor: Colors.border,
  },
  btnApply: {
    backgroundColor: Colors.pink,
  },
  btnText: {
    color: '#131313',
    fontSize: 14,
    fontWeight: '700',
  },
  btnTextCancel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
});
```

Add to `app/wallpaper/[id].tsx`:
1. Import: `import { ImageEditorModal } from '../components/ImageEditorModal';`
2. Add state: `const [showEditor, setShowEditor] = useState(false);`
3. Add button to header: `<Pressable onPress={() => setShowEditor(true)}><Ionicons name="create" size={22} /></Pressable>`
4. Add modal to render:
```typescript
<Modal visible={showEditor} animationType="slide">
  <ImageEditorModal
    imageUri={wallpaperUri}
    onSave={(edited) => {
      setShowEditor(false);
      // Handle edited image
    }}
    onCancel={() => setShowEditor(false)}
  />
</Modal>
```

**Verification:**
- ✅ Edit icon appears in wallpaper preview header
- ✅ Tapping opens editor modal with image and sliders
- ✅ Moving sliders updates preview in real-time
- ✅ Reset button resets all sliders to 1.0
- ✅ Cancel closes modal without saving
- ✅ Apply closes modal and shows edited image

---

### **ISSUE 8: Add Share Buttons to Wallpaper Screens**
**Location:** `app/wallpapers/dual.tsx`, `app/wallpapers/video.tsx`, `app/wallpaper/[id].tsx`  
**Current State:** No way to share wallpapers with friends.  
**Required Output:**

Add to all 3 files:

1. Import: `import { Share } from 'react-native';`
2. Add function:
```typescript
const handleShare = async (imageUrl: string, title: string) => {
  try {
    await Share.share({
      url: imageUrl,
      title: title,
      message: 'Check out this wallpaper from Kawaii Baby Wallpapers!',
    });
  } catch (error) {
    console.error('Share failed:', error);
  }
};
```

3. **For dual.tsx & video.tsx:** Add share button to header (next to back button or as new icon):
```typescript
<Pressable onPress={() => handleShare(imageUri, wallpaperTitle)}>
  <Ionicons name="share-social" size={22} color={Colors.text} />
</Pressable>
```

4. **For wallpaper/[id].tsx:** Add share button to header next to edit/set buttons:
```typescript
<Pressable onPress={() => handleShare(wallpaperUri, wallpaperTitle)}>
  <Ionicons name="share-social" size={22} color={Colors.text} />
</Pressable>
```

**Verification:**
- ✅ Share icon visible on dual, video, and preview screens
- ✅ Tapping opens native share sheet
- ✅ Can select messaging app and share succeeds
- ✅ Shared message includes wallpaper title and app name

---

## DELIVERABLES CHECKLIST

- [ ] Task 8: `hooks/useWallpaperManager.ts` created with Android + iOS implementation
- [ ] Task 8: `app/wallpapers/dual.tsx` updated to use real wallpaper hook
- [ ] Task 9: Wallpaper setting works on iOS via Share API
- [ ] Task 10: `app/wallpapers/dual.tsx` uses `useTheme()` for all colors
- [ ] Task 10: `app/wallpapers/video.tsx` uses `useTheme()` for all colors
- [ ] Task 11: `components/VideoWallpaperCard.tsx` shows play icon + duration
- [ ] Task 12: `components/WallpaperGridCell.tsx` heart toggle persists
- [ ] Task 13: "Set as Wallpaper" button in `app/wallpaper/[id].tsx` works
- [ ] Task 14: "Set as Wallpaper" button in `components/VideoPlayer.tsx` visible
- [ ] Task 15: `components/ImageEditorModal.tsx` created with brightness/contrast/saturation sliders
- [ ] Task 16: Share buttons added to dual, video, and preview screens

---

## VERIFICATION STEPS (FINAL)

1. **Android Device Test:**
   - Navigate to Dual Wallpapers → tap "Lock Screen" → wallpaper actually applies ✅
   - Change theme in Settings → Dual/Video screen colors update ✅
   - Open wallpaper preview → tap heart → state persists ✅

2. **iOS Device Test:**
   - Navigate to Video Wallpapers → tap video → VideoPlayer shows with play controls ✅
   - Tap "Set as Wallpaper" → share sheet opens ✅
   - Wallpaper preview → tap edit → image editor opens with sliders ✅

3. **All Platforms:**
   - Tap share icon anywhere → native share sheet opens ✅
   - All buttons responsive and no crashes ✅

---

## NOTES FOR AI AGENT

- **Do not skip** Platform-specific handling (Android vs iOS need different approaches)
- **Test thoroughly** on actual devices, not just emulator
- **Preserve all existing functionality** — don't break the 7 completed tasks
- **Follow React Native + Expo conventions** — use hooks, functional components, expo packages
- **Respect code style** — match indentation, naming, and patterns in existing codebase
- **If blocked** on native module dependencies — use fallback implementations (Share API, Linking, etc.)
- **Update CLAUDE.md** if you add new dependencies to `package.json`
