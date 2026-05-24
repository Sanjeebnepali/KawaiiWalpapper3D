import { getPhotoById } from '../../constants/mockData';

export function photoThumb(photoIds: string[]): string {
  const first = photoIds[0];
  if (!first) return '';
  return getPhotoById(first)?.image ?? '';
}
