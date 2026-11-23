import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { RefreshCw, Check } from 'lucide-react';

interface PullToRefreshProps {
  children: React.ReactNode;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

const PULL_THRESHOLD = 65; // pixels needed to trigger refresh
const MAX_PULL = 90; // maximum visual pull down
const PULL_DEADZONE = 12; // minimum downward drag before showing indicator

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ children, scrollContainerRef }) => {
  const { refreshCurrentScreen, isRefreshingScreen } = useApp();

  const [pullDistance, setPullDistance] = useState(0);
  const [refreshState, setRefreshState] = useState<'idle' | 'pulling' | 'canRelease' | 'refreshing' | 'success'>('idle');
  const [successMessage, setSuccessMessage] = useState<string>('');

  const startYRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const refreshStateRef = useRef(refreshState);
  refreshStateRef.current = refreshState;
  const isLocalRefreshRef = useRef(false);

  // Sync with global isRefreshingScreen (both start and completion of external refreshes)
  useEffect(() => {
    if (isRefreshingScreen && !isLocalRefreshRef.current) {
      setRefreshState('refreshing');
      setPullDistance(50);
    } else if (!isRefreshingScreen && !isLocalRefreshRef.current && refreshStateRef.current === 'refreshing') {
      setRefreshState('success');
      setSuccessMessage('Updated');
      const t1 = setTimeout(() => {
        setPullDistance(0);
      }, 600);
      const t2 = setTimeout(() => {
        setRefreshState('idle');
        setSuccessMessage('');
      }, 850);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [isRefreshingScreen]);

  const handleRefresh = useCallback(async () => {
    isLocalRefreshRef.current = true;
    setRefreshState('refreshing');
    setPullDistance(50);

    // Haptic feedback if supported
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(15);
      } catch {
        // Ignore vibration restrictions
      }
    }

    try {
      const res = await refreshCurrentScreen();
      setRefreshState('success');
      setSuccessMessage(res.message || 'Updated');

      // Show success checkmark briefly then reset
      setTimeout(() => {
        setPullDistance(0);
        setTimeout(() => {
          isLocalRefreshRef.current = false;
          setRefreshState('idle');
          setSuccessMessage('');
        }, 250);
      }, 900);
    } catch {
      isLocalRefreshRef.current = false;
      setPullDistance(0);
      setRefreshState('idle');
    }
  }, [refreshCurrentScreen]);

  const handleRefreshRef = useRef(handleRefresh);
  handleRefreshRef.current = handleRefresh;

  useEffect(() => {
    const isAtTop = (): boolean => {
      if (typeof window === 'undefined') return true;
      if (scrollContainerRef?.current) {
        return scrollContainerRef.current.scrollTop <= 5;
      }
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      if (scrollY > 5) return false;
      if (containerRef.current && containerRef.current.scrollTop > 5) return false;
      return true;
    };

    const isInteractiveElement = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tagName = target.tagName.toLowerCase();
      if (['input', 'textarea', 'select', 'button', 'video'].includes(tagName)) return true;
      if (target.isContentEditable) return true;
      if (target.closest('input, textarea, select, [role="dialog"], .no-pull-refresh')) return true;
      return false;
    };

    const handleTouchStart = (e: TouchEvent) => {
      const currentState = refreshStateRef.current;
      if (currentState === 'refreshing' || currentState === 'success') return;
      if (
        scrollContainerRef?.current &&
        e.target instanceof Node &&
        !scrollContainerRef.current.contains(e.target)
      ) {
        return;
      }
      if (!isAtTop()) return;
      if (isInteractiveElement(e.target)) return;

      startYRef.current = e.touches[0].clientY;
      isPullingRef.current = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const currentState = refreshStateRef.current;
      if (!isPullingRef.current || startYRef.current === null) return;
      if (currentState === 'refreshing' || currentState === 'success') return;
      if (!isAtTop()) {
        isPullingRef.current = false;
        startYRef.current = null;
        setPullDistance(0);
        setRefreshState('idle');
        return;
      }

      const currentY = e.touches[0].clientY;
      const rawDiff = currentY - startYRef.current;

      if (rawDiff > PULL_DEADZONE) {
        // Damping resistance formula
        const distance = Math.min(MAX_PULL, (rawDiff - PULL_DEADZONE) * 0.45);
        setPullDistance(distance);

        if (distance >= PULL_THRESHOLD) {
          setRefreshState('canRelease');
        } else {
          setRefreshState('pulling');
        }

        // Prevent browser overscroll rubber-band conflict when dragging
        if (e.cancelable) {
          e.preventDefault();
        }
      } else if (rawDiff <= 0) {
        setPullDistance(0);
        if (currentState !== 'idle') {
          setRefreshState('idle');
        }
      }
    };

    const handleTouchEnd = () => {
      if (!isPullingRef.current) return;
      isPullingRef.current = false;
      startYRef.current = null;

      const currentState = refreshStateRef.current;
      if (currentState === 'canRelease') {
        handleRefreshRef.current();
      } else if (currentState !== 'refreshing' && currentState !== 'success') {
        setPullDistance(0);
        setRefreshState('idle');
      }
    };

    const handleTouchCancel = () => {
      isPullingRef.current = false;
      startYRef.current = null;
      const currentState = refreshStateRef.current;
      if (currentState !== 'refreshing' && currentState !== 'success') {
        setPullDistance(0);
        setRefreshState('idle');
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [scrollContainerRef]);

  const rotation = Math.min(360, (pullDistance / PULL_THRESHOLD) * 360);

  return (
    <div ref={containerRef} className="relative w-full min-h-full">
      {/* Pull Indicator Container */}
      <div
        className={`fixed top-16 md:top-20 left-1/2 -translate-x-1/2 z-40 pointer-events-none transition-all duration-200 flex items-center justify-center ${
          pullDistance > 0 || refreshState === 'refreshing' || refreshState === 'success'
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-90'
        }`}
        style={{
          transform: `translate(-50%, ${Math.max(0, pullDistance - 45)}px)`,
        }}
        aria-hidden="true"
      >
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-lg rounded-full px-3.5 py-1.5 flex items-center gap-2 backdrop-blur-md">
          {refreshState === 'success' ? (
            <>
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap">
                {successMessage || 'Updated'}
              </span>
            </>
          ) : refreshState === 'refreshing' ? (
            <>
              <RefreshCw className="w-4 h-4 text-[var(--color-primary)] animate-spin shrink-0" />
              <span className="text-xs font-semibold text-[var(--color-text-secondary)] whitespace-nowrap">
                Refreshing campus data...
              </span>
            </>
          ) : (
            <>
              <div
                className="transition-transform duration-75"
                style={{ transform: `rotate(${rotation}deg)` }}
              >
                <RefreshCw
                  className={`w-4 h-4 ${
                    refreshState === 'canRelease'
                      ? 'text-[var(--color-primary)] scale-110'
                      : 'text-[var(--color-text-secondary)]'
                  } transition-all`}
                />
              </div>
              <span className="text-[11px] font-medium text-[var(--color-text-secondary)] whitespace-nowrap">
                {refreshState === 'canRelease' ? 'Release to refresh' : 'Pull to refresh'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Main Content with soft transform translation on pull (only active when pullDistance > 0 to prevent breaking position: fixed for child modals) */}
      <div
        className={pullDistance > 0 ? 'transition-transform duration-150 ease-out will-change-transform' : ''}
        style={
          pullDistance > 0
            ? { transform: `translateY(${pullDistance * 0.35}px)` }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
};
