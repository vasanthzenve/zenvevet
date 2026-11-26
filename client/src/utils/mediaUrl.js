/**
 * Zenve Vet™ — Universal Media URL Resolver
 * 
 * Correctly normalizes media URLs for all network topologies:
 * - Handles relative `/uploads/...` paths across frontend, backend (8080), and load balancer (8000)
 * - Automatically rewires localhost to current LAN host when accessed on mobile devices / Wi-Fi
 * - Preserves data URIs and blob URLs
 * - Appends optional cache-busting timestamp on retry
 */

export const resolveMediaUrl = (url, retryCount = 0) => {
  if (!url) return '';
  let str = String(url).trim();
  if (!str) return '';
  if (str.startsWith('data:') || str.startsWith('blob:')) return str;

  // Adapt for mobile and LAN access so non-desktop clients don't fail connecting to localhost
  if (typeof window !== 'undefined' && window.location) {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocal && str.includes('localhost:8080')) {
      str = str.replace('localhost:8080', `${window.location.hostname}:8080`);
    } else if (!isLocal && str.includes('localhost:8000')) {
      str = str.replace('localhost:8000', `${window.location.hostname}:8000`);
    }
  }

  // If pointing to uploads (either absolute or relative), normalize to relative /uploads/
  // This ensures same-origin ('self') playback via Vite proxy (:5173) or Gateway (:8000)
  if (str.includes('/uploads/')) {
    const uploadIndex = str.indexOf('/uploads/');
    str = str.substring(uploadIndex);
  } else if (str.startsWith('uploads/')) {
    str = `/${str}`;
  }

  let finalUrl = str;
  if (!str.startsWith('/') && (str.startsWith('http://') || str.startsWith('https://'))) {
    finalUrl = str;
  }

  if (retryCount > 0) {
    const separator = finalUrl.includes('?') ? '&' : '?';
    return `${finalUrl}${separator}_r=${retryCount}&_t=${Date.now()}`;
  }
  return finalUrl;
};

