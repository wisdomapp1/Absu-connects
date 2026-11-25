import React from 'react';

interface VerifiedBadgeProps {
  className?: string;
  size?: number;
  title?: string;
}

/**
 * 16px circular blue (#1877F2) verified badge with crisp white checkmark.
 */
export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  className = '',
  size = 16,
  title = 'Verified Page',
}) => {
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={`inline-flex items-center justify-center shrink-0 align-middle ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="8" fill="#1877F2" />
        <path
          d="M11.35 5.45L6.85 9.95L4.65 7.75"
          stroke="#FFFFFF"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
};
