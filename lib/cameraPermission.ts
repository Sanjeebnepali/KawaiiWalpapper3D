/**
 * Imperative camera-permission helpers.
 *
 * `useCameraPermissions()` is a React hook so it can't be called from outside
 * a component (e.g. from the Mood Mode toggle's `onPress`). expo-camera also
 * exposes imperative APIs that we use here.
 *
 * Lazy-required so the rest of the app boots even without expo-camera's
 * native bridge linked yet — every helper returns a safe default when the
 * module is missing.
 */

type CameraModuleLike = {
  Camera?: {
    getCameraPermissionsAsync?: () => Promise<PermissionResultLike>;
    requestCameraPermissionsAsync?: () => Promise<PermissionResultLike>;
  };
  getCameraPermissionsAsync?: () => Promise<PermissionResultLike>;
  requestCameraPermissionsAsync?: () => Promise<PermissionResultLike>;
};

type PermissionResultLike = {
  granted?: boolean;
  status?: string;
  canAskAgain?: boolean;
};

let cameraMod: CameraModuleLike | null = null;
let resolved = false;

function getModule(): CameraModuleLike | null {
  if (resolved) return cameraMod;
  resolved = true;
  try {

    cameraMod = require('expo-camera') as CameraModuleLike;
  } catch {
    cameraMod = null;
  }
  return cameraMod;
}

function pickFn(name: 'get' | 'request') {
  const m = getModule();
  if (!m) return null;
  // expo-camera v15+ uses top-level functions; older exposed them under `Camera`.
  if (name === 'get') {
    return (
      m.getCameraPermissionsAsync ??
      m.Camera?.getCameraPermissionsAsync ??
      null
    );
  }
  return (
    m.requestCameraPermissionsAsync ??
    m.Camera?.requestCameraPermissionsAsync ??
    null
  );
}

export type CameraPermissionResult = {
  granted: boolean;
  canAskAgain: boolean;
  /** True when the expo-camera native module isn't available at runtime. */
  moduleMissing: boolean;
};

export async function getCameraPermission(): Promise<CameraPermissionResult> {
  const get = pickFn('get');
  if (!get) {
    return { granted: false, canAskAgain: true, moduleMissing: true };
  }
  try {
    const r = await get();
    return {
      granted: !!r?.granted,
      canAskAgain: r?.canAskAgain !== false,
      moduleMissing: false,
    };
  } catch {
    return { granted: false, canAskAgain: true, moduleMissing: true };
  }
}

export async function requestCameraPermission(): Promise<CameraPermissionResult> {
  const req = pickFn('request');
  if (!req) {
    return { granted: false, canAskAgain: true, moduleMissing: true };
  }
  try {
    const r = await req();
    return {
      granted: !!r?.granted,
      canAskAgain: r?.canAskAgain !== false,
      moduleMissing: false,
    };
  } catch {
    return { granted: false, canAskAgain: true, moduleMissing: true };
  }
}
