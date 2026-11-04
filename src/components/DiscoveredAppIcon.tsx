import React, { useState } from 'react';

/** Native icons are PNG data URLs. Never load a remote URL from a saved cache. */
export const DiscoveredAppIcon: React.FC<{
  src?: string | null;
  alt: string;
  className: string;
  fallback: React.ReactNode;
}> = ({ src, alt, className, fallback }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const valid = typeof src === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(src);
  return valid && src !== failedSrc
    ? <img src={src} alt={alt} className={className} onError={() => setFailedSrc(src)} />
    : <>{fallback}</>;
};
