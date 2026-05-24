/**
 * Premium wallpaper catalog — 60 curated images stored in the EXISTING public
 * Supabase `wallpapers` bucket, under a `premium/` folder (alongside the other
 * wallpaper collections, e.g. wallpapers/mood/happy/…). Upload them once with
 * scripts/upload-premium.mjs; the filenames below match that folder.
 *
 * URLs are built from EXPO_PUBLIC_SUPABASE_URL at runtime, so rotating the
 * Supabase project only needs an .env change, not a code edit. PREMIUM_BUCKET +
 * PREMIUM_PREFIX must match the script's upload target.
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const PREMIUM_BUCKET = 'wallpapers';
export const PREMIUM_PREFIX = 'premium/';

/** Exact object names in the bucket (kept in sync with the upload folder). */
export const PREMIUM_FILES: readonly string[] = [
  "0cd0dc0e-5a38-4e9d-b500-d634fe9ad987.png",
  "1680ac83-2ffb-47d6-a509-ca38326a62db.png",
  "17507ac8-cdf6-412f-939e-5057001baf55.png",
  "22bdd09c-4a35-40bc-8cc1-00d5915a2e94.png",
  "2dc998a3-8f87-430e-96b7-db197a672fa2.png",
  "302d1d95-ef44-4df2-8696-46a2f9c3ae5a.png",
  "375ebe83-1879-4624-a34f-1c91625b165c.png",
  "37b77d47-0434-4fc7-acb9-8c2c80ebce6c.png",
  "382aceac-ced1-454e-b64c-c162626238d8.png",
  "3e817121-b3db-4133-b61e-1d7e1e937fd5.png",
  "4154f627-e48f-49d5-a14a-19e041f4e10f.png",
  "423f1b41-69d4-422c-a8c0-90a58d0bfeef.png",
  "42e1a9ed-c138-4ce6-a154-c4c5bd4bbc4b.png",
  "4319dc33-48d8-4e4b-91b3-741816f6272e.png",
  "4ffdbf46-325c-4799-8384-e3b3111c3422.png",
  "545c9625-a728-4c31-a90c-732ee9244130.png",
  "59bdc17d-3cf0-4fff-ab84-80b0122d3a6d.png",
  "5ac7dd7a-4e37-450e-a5c2-9d3c28594d83.png",
  "5b8a41d1-994e-4536-9150-d99145f50a34.png",
  "6775c32d-4af9-43d9-8fb7-8fdada76067d.png",
  "6cfe0872-39df-4ffc-962e-8aacf4058e18.png",
  "6f805e12-64ef-457b-a241-3862e361045a.png",
  "747dff2f-3ed1-43bd-ba6b-4a9ff4ed1c0d.png",
  "777ee99b-ce72-4a37-8e84-d579fe5600d6.png",
  "7e09f768-a579-421d-8ee2-d4d5801e5bdf.png",
  "7e18351b-eded-4916-ae0b-848932699275.png",
  "80e3fa27-d0b8-44fd-9173-5a92b935cf5b.png",
  "88ff6519-f63c-49ae-9809-992be63c739b.png",
  "8e83bf0a-80b4-4796-8fc1-7bf76da8249e.png",
  "913c67bb-85b4-4c1f-bb7f-47a24333b9e6.png",
  "92fd7545-ba99-4931-b495-e789b5833f64.png",
  "93074b2c-7f9f-4098-90fb-be38df11dd56.png",
  "9d1c2bd5-f62f-48ff-9851-7b8ec5e16d6d.png",
  "9fd2883d-2e38-4d28-b0d8-c5e6f1ecf05b.png",
  "a16ad4ce-fac8-4180-825d-47aa8b74bf5d.png",
  "a1e3f75e-b3a6-4698-bb6a-63170bba5ade.png",
  "a222b0e1-8495-400c-b7ba-553f0f697db1.png",
  "a4182496-1151-4bc3-9291-b97a4e49b89c.png",
  "aa4b3316-f2f5-485b-9de7-ea8e5d949397.png",
  "ad1911bc-934a-46b0-8460-b0722aec9aa5.png",
  "adddb1fd-3f54-4b1e-8c96-11ced2ddadc3.png",
  "ae3c7c12-f55a-4866-b489-d9b2ff085f32.png",
  "b0980c9b-3a09-410f-a933-b876808a31bf.png",
  "b3f3254b-c103-4967-b844-1940fb5d3090.png",
  "b488e514-668b-4400-8f9d-9169978e69c8.png",
  "b82f3b1b-54f2-41b9-8c54-618f70959dce.png",
  "b8c5d56e-e769-47c4-9069-2f726bd4cd9e.png",
  "ba03f8ed-9da8-4863-84d7-099960767014.png",
  "bf5d5bf8-4c93-475a-a09c-daae3287ab27.png",
  "c5e0855a-e724-4918-8246-a7631decfd8f.png",
  "d1ad7b03-4e84-4cdd-9c83-6ce6c63eef44.png",
  "d28a8700-fc2a-499a-8e53-02af4f25b477.png",
  "d4cab471-7d48-4e0c-9cd0-786cedaf1554.png",
  "d6d4375a-198c-46ad-bd94-9fdbe4119e1d.png",
  "d7c7376e-2404-4516-abfe-d4b3c31a6738.png",
  "ddcae73b-f114-4ada-b73c-797599e6d4aa.png",
  "ea1fb180-9c86-408e-8542-fc8042cd2422.png",
  "f1365937-a241-4e42-9b32-f13bb01ef2a6.png",
  "f7650eb5-5894-4312-8ab9-b362a27a13a9.png",
  "fb1ef1c1-92ff-4528-8452-53f14b4ac8ec.png",
];

/** Public URL for one premium object (wallpapers bucket → premium/ folder). */
export function premiumImageUrl(file: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${PREMIUM_BUCKET}/${PREMIUM_PREFIX}${encodeURIComponent(file)}`;
}

export type PremiumPhoto = { id: string; image: string; premium: true };

/** Stable id 'premium-<uuid>' so getPhotoById can resolve it for preview. */
export const premiumPhotos: PremiumPhoto[] = PREMIUM_FILES.map((f) => ({
  id: 'premium-' + f.replace(/\.[^.]+$/, ''),
  image: premiumImageUrl(f),
  premium: true,
}));

/** Resolve a 'premium-<uuid>' id back to its image URL, or undefined. */
export function premiumPhotoById(id: string): PremiumPhoto | undefined {
  return premiumPhotos.find((p) => p.id === id);
}

/** True for a premium-collection id ('premium-<uuid>') — drives the diamond
 *  badge + the subscription gate on apply. */
export function isPremiumPhotoId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith('premium-');
}
