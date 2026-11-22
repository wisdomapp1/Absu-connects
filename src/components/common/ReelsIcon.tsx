import React from 'react';

interface ReelsIconProps {
  className?: string;
}

/**
 * Modern Reels navigation & feed icon (rounded video frame with angled film-strip header and play glyph)
 */
export const ReelsIcon: React.FC<ReelsIconProps> = ({ className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <path d="M3 8.5h18" />
    <path d="M8.5 3l2 5.5" />
    <path d="M14.5 3l2 5.5" />
    <polygon points="10.25 12 15.5 14.75 10.25 17.5" fill="currentColor" stroke="none" />
  </svg>
);
