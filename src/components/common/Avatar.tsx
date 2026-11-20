import React, { useState } from 'react';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showOnline?: boolean;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-24 h-24 text-2xl',
};

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  className = '',
  showOnline = false,
}) => {
  const [imageError, setImageError] = useState(false);

  // Compute initials
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className={`relative inline-block shrink-0 ${className}`}>
      <div
        className={`${sizeClasses[size]} rounded-full overflow-hidden flex items-center justify-center font-bold select-none border border-[var(--color-border)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)] shadow-sm`}
      >
        {src && !imageError ? (
          <img
            src={src}
            alt={name}
            referrerPolicy="no-referrer"
            onError={() => setImageError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span>{initials || 'AB'}</span>
        )}
      </div>
      {showOnline && (
        <span
          className="absolute bottom-0 right-0 w-3 h-3 bg-[var(--color-success)] border-2 border-[var(--color-bg-card)] rounded-full"
          title="Online"
        />
      )}
    </div>
  );
};

export default Avatar;
