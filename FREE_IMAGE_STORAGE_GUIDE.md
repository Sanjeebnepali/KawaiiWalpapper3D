# Best FREE Image Storage Solutions for Your App (2026)

## COMPARISON: Free Image Storage Services

| Service | Free Tier | Speed | Best For | Setup |
|---------|-----------|-------|----------|-------|
| **Supabase** ⭐ | 1GB/month | Fast | Production apps | Easy |
| **Firebase** | 1GB/month | Fast | Mobile apps | Easy |
| **Backblaze B2** | 1GB free, then $0.006/GB | Very fast | Scaling apps | Medium |
| **Oracle Cloud** | 20GB free (12 months) | Fast | Long-term free | Hard |
| **Cloudinary** | 25/month credits | Fast | Image transformations | Easy |
| **Catbox** | Unlimited free | Slow | Simple storage | Very easy |
| **imgbb** | Unlimited free | Medium | Simple storage | Very easy |
| **AWS S3** | 5GB (12 months only) | Fast | Enterprise | Hard |
| **Google Cloud** | 5GB egress/month free | Fast | Enterprise | Hard |

---

## 🏆 RECOMMENDATION: Supabase (Best Balance)

### Why Supabase is Best:

✅ **1GB completely free** — perfect for starting  
✅ **Production-ready** — used by professional apps  
✅ **PostgreSQL database included** — store metadata  
✅ **Authentication built-in** — secure user data  
✅ **Real-time updates** — instant sync  
✅ **Easy integration** — simple HTTP requests  
✅ **Fair pricing if scaling** — $5/month for 100GB  
✅ **No credit card required** — truly free  

---

## IMPLEMENTATION: Supabase Free Tier

### Step 1: Create Free Supabase Account

1. Go to https://supabase.com/
2. Sign up (email + password)
3. Create new project (free tier)
4. Get your **API URL** and **API Key** (Public)
5. Enable Storage (Buckets section)
6. Create bucket: `wallpapers` (public)

### Step 2: Create Image Upload Service

**File: `lib/supabaseStorage.ts`**

```typescript
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface UploadImageResult {
  url: string;
  path: string;
}

/**
 * Upload image to Supabase Storage
 * @param imageUri - Local file URI or base64
 * @param bucket - Bucket name (e.g., 'wallpapers', 'chibis', 'favorites')
 * @param fileName - File name (e.g., 'chibi_1.jpg')
 */
export async function uploadImage(
  imageUri: string,
  bucket: string = 'wallpapers',
  fileName: string = `${Date.now()}.jpg`,
): Promise<UploadImageResult> {
  try {
    // Convert URI to blob
    const response = await fetch(imageUri);
    const blob = await response.blob();

    // Upload to Supabase
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, blob, {
        cacheControl: '3600',
        upsert: false, // Don't overwrite if exists
      });

    if (error) {
      throw new Error(error.message);
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(fileName);

    return {
      url: publicUrl,
      path: data.path,
    };
  } catch (error) {
    console.error('[uploadImage] Error:', error);
    throw error;
  }
}

/**
 * Upload generated AI image
 */
export async function uploadGeneratedImage(
  base64Image: string,
  type: 'chibi' | 'wallpaper' | 'ai-generated' = 'wallpaper',
): Promise<UploadImageResult> {
  try {
    const fileName = `${type}_${Date.now()}.jpg`;
    const bucket = 'generated-images';

    // Convert base64 to blob
    const binaryString = atob(base64Image.split(',')[1]);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'image/jpeg' });

    // Upload
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, blob);

    if (error) {
      throw new Error(error.message);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(fileName);

    return {
      url: publicUrl,
      path: data.path,
    };
  } catch (error) {
    console.error('[uploadGeneratedImage] Error:', error);
    throw error;
  }
}

/**
 * Save wallpaper metadata to database (for favorites tracking)
 */
export async function saveWallpaperMetadata(
  wallpaperId: string,
  metadata: {
    title: string;
    imageUrl: string;
    type: 'ai-generated' | 'chibi' | 'uploaded';
    userId?: string;
    createdAt?: string;
  },
) {
  try {
    const { data, error } = await supabase
      .from('wallpapers')
      .insert([
        {
          id: wallpaperId,
          ...metadata,
          created_at: new Date().toISOString(),
        },
      ]);

    if (error) {
      throw new Error(error.message);
    }

    return data;
  } catch (error) {
    console.error('[saveWallpaperMetadata] Error:', error);
    throw error;
  }
}

/**
 * Get all user's saved wallpapers
 */
export async function getUserWallpapers(userId: string) {
  try {
    const { data, error } = await supabase
      .from('wallpapers')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }

    return data;
  } catch (error) {
    console.error('[getUserWallpapers] Error:', error);
    throw error;
  }
}

/**
 * Delete wallpaper
 */
export async function deleteWallpaper(filePath: string) {
  try {
    const { error } = await supabase.storage
      .from('wallpapers')
      .remove([filePath]);

    if (error) {
      throw new Error(error.message);
    }

    return true;
  } catch (error) {
    console.error('[deleteWallpaper] Error:', error);
    throw error;
  }
}
```

### Step 3: Install Supabase Package

```bash
npm install @supabase/supabase-js --legacy-peer-deps
npx expo install expo-file-system
```

### Step 4: Setup Environment Variables

**Create `.env.local`:**
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-public-key
```

**Update `app.json`:**
```json
{
  "expo": {
    "extra": {
      "supabaseUrl": "https://your-project.supabase.co",
      "supabaseAnonKey": "your-key"
    }
  }
}
```

### Step 5: Use in Components

**Example: Save generated chibi**

```typescript
import { uploadGeneratedImage } from '../lib/supabaseStorage';

const handleSaveChibi = async (chibiBase64: string) => {
  try {
    const result = await uploadGeneratedImage(chibiBase64, 'chibi');
    
    // Now you have a public URL to the image
    console.log('Saved chibi:', result.url);
    
    // Add to favorites store
    useAddFavorite({
      id: `chibi_${Date.now()}`,
      image: result.url, // Use cloud URL instead of local
      source: 'chibi-generated',
    });
  } catch (error) {
    Alert.alert('Error', 'Failed to save chibi');
  }
};
```

---

## ALTERNATIVE: Completely Free (No Limits)

If you want **unlimited storage completely free**, use **Catbox or imgbb**:

### **Option A: Catbox (Unlimited, Completely Free)**

```typescript
export async function uploadToCatbox(
  imageUri: string,
): Promise<string> {
  try {
    const response = await fetch(imageUri);
    const blob = await response.blob();

    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('fileToUpload', blob as any);

    const uploadResponse = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: formData,
    });

    const url = await uploadResponse.text();
    return url.trim();
  } catch (error) {
    console.error('[uploadToCatbox] Error:', error);
    throw error;
  }
}
```

**Pros:** Unlimited free, simple  
**Cons:** No authentication, no metadata, less professional, may be slower

### **Option B: imgbb (Unlimited, Completely Free)**

Requires free API key from https://imgbb.com/

```typescript
export async function uploadToImgbb(
  imageUri: string,
  apiKey: string,
): Promise<string> {
  try {
    const response = await fetch(imageUri);
    const blob = await response.blob();

    const formData = new FormData();
    formData.append('image', blob as any);
    formData.append('expiration', '0'); // No expiration

    const uploadResponse = await fetch(
      `https://api.imgbb.com/1/upload?key=${apiKey}`,
      {
        method: 'POST',
        body: formData,
      },
    );

    const data = await uploadResponse.json();
    return data.data.display_url;
  } catch (error) {
    console.error('[uploadToImgbb] Error:', error);
    throw error;
  }
}
```

**Pros:** Unlimited free, reliable  
**Cons:** Image limits per month (30/month free tier), less professional

---

## COST COMPARISON (If Scaling)

| Service | 10GB | 100GB | 1TB |
|---------|------|-------|-----|
| **Supabase** | FREE | $8/mo | $58/mo |
| **Firebase** | FREE | $5/mo | $50/mo |
| **Backblaze B2** | $0.06 | $0.60 | $6 |
| **Cloudinary** | FREE | $99/mo | $499/mo |
| **imgbb** | FREE* | $13.74/mo | - |
| **Catbox** | FREE | FREE | FREE |

*imgbb has limits

---

## RECOMMENDATION BY SCENARIO

### **Scenario 1: Just Starting (Free Forever)**
Use **Catbox** or **imgbb**
- Unlimited storage
- Completely free
- No authentication needed
- Perfect for prototyping

### **Scenario 2: Production App (Free + Reasonable Scaling)**
Use **Supabase**
- 1GB free (covers ~5,000 images)
- Professional infrastructure
- Database included
- Fair pricing: $5/mo for 100GB
- **Recommended** ✅

### **Scenario 3: Enterprise (Cheapest Scaling)**
Use **Backblaze B2**
- Free 1GB
- Then $0.006/GB (cheapest available)
- 100GB = $0.60/month
- Very professional
- Recommended for large apps

---

## SETUP COMPARISON

| Service | Setup Time | Difficulty | Code Complexity |
|---------|-----------|-----------|-----------------|
| Supabase | 10 min | Easy | Medium |
| Firebase | 10 min | Easy | Medium |
| Catbox | 2 min | Very easy | Simple |
| imgbb | 5 min | Easy | Simple |
| Backblaze | 15 min | Medium | Medium |

---

## HYBRID APPROACH (Best of Both Worlds)

**Use Catbox for free, migrate to Supabase when needed:**

```typescript
// Development
const uploadImage = uploadToCatbox; // Free

// Production
const uploadImage = uploadToSupabase; // Paid but professional

// In component
const imageUrl = await uploadImage(imageUri);
```

This way:
- ✅ No cost to start
- ✅ Easy switch to professional later
- ✅ No refactoring needed

---

## MY FINAL RECOMMENDATION

### **For Your Wallpaper App:**

```
Phase 1 (MVP): Use Catbox (Free, unlimited)
  - No cost
  - Generate images
  - Store URLs
  - Test with users

Phase 2 (Scale): Migrate to Supabase (Free 1GB + paid scaling)
  - Professional infrastructure
  - Database for metadata
  - User authentication
  - Better performance
```

---

## QUICK START: Supabase (Recommended)

1. **Sign up:** https://supabase.com/ (free)
2. **Create project** (takes 2 minutes)
3. **Get API keys** from Settings
4. **Create storage bucket:** `wallpapers` (public)
5. **Copy `lib/supabaseStorage.ts`** code above
6. **Use in your components**
7. **Done!** First 1GB is free.

---

## NEXT STEPS

- [ ] Choose service (Supabase recommended)
- [ ] Create account
- [ ] Get API keys
- [ ] Create storage service file
- [ ] Test upload with sample image
- [ ] Integrate into AI generation feature
- [ ] Verify images are stored and retrievable

Would you like me to create a complete upload component that works with any of these services?
