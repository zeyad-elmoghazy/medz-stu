'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Activity } from 'lucide-react';

type LogoSize = 'sm' | 'md' | 'lg';

const DIMENSIONS: Record<LogoSize, { box: number; text: number; gap: number }> = {
  sm: { box: 32, text: 22, gap: 10 },
  md: { box: 40, text: 26, gap: 12 },
  lg: { box: 48, text: 30, gap: 14 },
};

/**
 * MediZee logo lockup — the real logo image from /public/medizee-logo.webp
 * with the wordmark. If the image fails to load, falls back to a
 * gradient tile with an Activity glyph so the brand never renders
 * a broken-image icon.
 */
export function MediZeeLogo({
  size = 'md',
  showWordmark = true,
}: {
  size?: LogoSize;
  showWordmark?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const { box, text, gap } = DIMENSIONS[size];

  return (
    <span className="inline-flex items-center" style={{ gap }}>
      <span
        className="relative grid shrink-0 place-items-center overflow-hidden rounded-lg"
        style={{
          width: box,
          height: box,
          background: 'linear-gradient(135deg, #00A6A6, #33BFBF)',
          boxShadow: '0 0 20px rgba(0,166,166,0.5)',
        }}
      >
        {imgFailed ? (
          <Activity style={{ width: box * 0.5, height: box * 0.5 }} className="text-white" />
        ) : (
          <Image
            src="/medizee-logo.webp"
            alt="MediZee"
            width={box}
            height={box}
            priority
            onError={() => setImgFailed(true)}
            style={{ width: box, height: box, objectFit: 'cover' }}
          />
        )}
      </span>
      {showWordmark && (
        <span
          className="font-bold text-white"
          style={{ fontSize: text, letterSpacing: '-0.5px' }}
        >
          MediZee
        </span>
      )}
    </span>
  );
}

export default MediZeeLogo;
