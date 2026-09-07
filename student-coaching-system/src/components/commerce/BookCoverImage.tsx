/**
 * Kitap kapağı — referrer/CDN engeli + kırık URL için güvenli img.
 */
import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';

type Props = {
  src?: string | null;
  alt?: string;
  className?: string;
  /** object-contain / object-cover */
  fit?: 'contain' | 'cover';
  placeholderClassName?: string;
};

export default function BookCoverImage({
  src,
  alt = '',
  className = 'w-full h-full',
  fit = 'contain',
  placeholderClassName = 'w-12 h-12 text-gray-300',
}: Props) {
  const [broken, setBroken] = useState(false);
  const url = String(src || '').trim();
  const showImg = Boolean(url) && !broken;

  if (!showImg) {
    return (
      <div className={`${className} flex items-center justify-center bg-gray-100`}>
        <BookOpen className={placeholderClassName} />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={`${className} ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  );
}
