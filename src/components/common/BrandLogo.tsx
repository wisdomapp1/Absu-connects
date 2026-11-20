import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'w-7 h-7 sm:w-8 sm:h-8 rounded-[11px]',
  md: 'w-8 h-8 sm:w-9 sm:h-9 rounded-[13px]',
  lg: 'w-11 h-11 rounded-[15px]',
};

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'md', className = '' }) => {
  return (
    <div
      className={`${sizeMap[size]} bg-gradient-to-tr from-[var(--color-primary)] to-[var(--color-primary-hover)] flex items-center justify-center text-white shadow-sm shrink-0 select-none transition-colors ${className}`}
      aria-hidden="true"
    >
      <svg
        className="w-4 h-4 sm:w-5 sm:h-5 fill-none stroke-current"
        viewBox="0 0 32 32"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Bold geometric letter 'A' arch with rounded apex */}
        <path
          d="M6.5 25.5L14.2 6.8C14.8 5.3 17.2 5.3 17.8 6.8L25.5 25.5"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Interlocking connection bridge */}
        <path
          d="M10.2 18.2H21.8"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        {/* Central connectivity node */}
        <circle cx="16" cy="18.2" r="2.2" fill="currentColor" stroke="none" />
      </svg>
    </div>
  );
};
