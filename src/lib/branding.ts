import type React from 'react';
import defaultLogoAsset from '../assets/images/japriin_logo_1791445508697.jpg';

export const DEFAULT_LOGO_ASSET = defaultLogoAsset;
export const DEFAULT_PUBLIC_LOGO_URL = '/logo.jpg';

const LEGACY_LOGO_PATHS = new Set([
  '/src/assets/images/japriin_logo_1791445508697.jpg',
  'src/assets/images/japriin_logo_1791445508697.jpg',
  './src/assets/images/japriin_logo_1791445508697.jpg'
]);

export function resolveLogoUrl(rawUrl?: string | null): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed || LEGACY_LOGO_PATHS.has(trimmed)) {
    return DEFAULT_LOGO_ASSET;
  }
  return trimmed;
}

export function handleLogoImgError(e: React.SyntheticEvent<HTMLImageElement>): void {
  const img = e.currentTarget;
  if (img.dataset.logoFallbackApplied === '1') return;
  img.dataset.logoFallbackApplied = '1';
  img.src = DEFAULT_LOGO_ASSET;
}
