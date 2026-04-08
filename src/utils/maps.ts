/** Detect if input is a Google Maps URL */
export function isMapUrl(input: string): boolean {
  const s = input.trim();
  return s.startsWith('http') && (
    s.includes('google.com/maps') ||
    s.includes('maps.google') ||
    s.includes('maps.app.goo.gl') ||
    s.includes('goo.gl/maps')
  );
}

/** Extract place name from Google Maps URL */
export function extractPlaceName(url: string): string {
  try {
    // Pattern: /maps/place/Place+Name/
    const placeMatch = url.match(/\/place\/([^/@]+)/);
    if (placeMatch) {
      return decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
    }
    // Pattern: /maps/search/query
    const searchMatch = url.match(/\/search\/([^/@?]+)/);
    if (searchMatch) {
      return decodeURIComponent(searchMatch[1].replace(/\+/g, ' '));
    }
    // Pattern: ?q=Place+Name
    const qMatch = url.match(/[?&]q=([^&]+)/);
    if (qMatch) {
      return decodeURIComponent(qMatch[1].replace(/\+/g, ' '));
    }
  } catch { /* */ }
  return '';
}

/** Parse location input: returns { displayName, mapUrl } */
export function parseLocationInput(input: string): { displayName: string; mapUrl: string } {
  const trimmed = input.trim();
  if (isMapUrl(trimmed)) {
    const name = extractPlaceName(trimmed);
    return { displayName: name || trimmed, mapUrl: trimmed };
  }
  return { displayName: trimmed, mapUrl: '' };
}

/** Get the best Maps link for a location */
export function getMapsLink(location: string, mapUrl?: string): string {
  if (mapUrl?.trim()) return mapUrl.trim();
  if (!location?.trim()) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location + ' Singapore')}`;
}
