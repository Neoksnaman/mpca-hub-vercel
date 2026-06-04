import React, { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppContext } from '../App';

type UserHoverCardProps = {
  user?: any;
  fallbackName?: string;
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
  nameClassName?: string;
};

const sizeClasses = {
  sm: 'w-5 h-5 text-[9px]',
  md: 'w-6 h-6 text-[10px]',
  lg: 'w-8 h-8 text-xs'
};

const getFullName = (user?: any, fallbackName = 'User') => {
  const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
  return fullName || fallbackName || user?.username || 'User';
};

const getInitials = (name: string) => name
  .split(' ')
  .filter(Boolean)
  .map(part => part[0])
  .join('')
  .toUpperCase()
  .substring(0, 2) || 'U';

const UserHoverCard: React.FC<UserHoverCardProps> = ({
  user,
  fallbackName = 'User',
  size = 'md',
  showName = false,
  nameClassName = 'text-[12px] font-bold text-neutral-dark dark:text-white truncate max-w-[150px]'
}) => {
  const context = useContext(AppContext);
  const [imgError, setImgError] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, placement: 'top' as 'top' | 'bottom' });
  const anchorRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const fullName = getFullName(user, fallbackName);
  const initials = getInitials(fullName);
  const role = user?.role || 'User';
  const avatarUrl = !imgError ? user?.avatarUrl : '';
  const isOwnUser = !!user?.id && !!context?.user?.id && String(user.id) === String(context.user.id);
  const isOnline = !!user?.id && !isOwnUser && !!context?.onlineUserIDs?.has(String(user.id));

  useEffect(() => {
    setImgError(false);
  }, [user?.avatarUrl]);

  const openCard = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const showBelow = rect.top < 120;
    setPosition({
      top: showBelow ? rect.bottom + 12 : rect.top - 12,
      left: Math.min(window.innerWidth - 124, Math.max(124, rect.left + rect.width / 2)),
      placement: showBelow ? 'bottom' : 'top'
    });
    setIsOpen(true);
  };

  const handleMouseEnter = () => {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(openCard, 500);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsOpen(false);
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    };
  }, []);

  return (
    <div ref={anchorRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} className="relative inline-flex items-center gap-2 min-w-0">
      <div className={`relative ${sizeClasses[size]} shrink-0 cursor-help`}>
        <div className="h-full w-full rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden">
          {avatarUrl ? (
            <img src={avatarUrl} alt={fullName} className="w-full h-full object-cover" onError={() => setImgError(true)} />
          ) : (
            <span className="font-black text-primary">{initials}</span>
          )}
        </div>
        {isOnline && (
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 shadow-sm dark:border-gray-800" />
        )}
      </div>

      {showName && (
        <span className={nameClassName}>{fullName}</span>
      )}

      {isOpen && createPortal(
        <div
          className={`pointer-events-none fixed z-[12000] w-44 -translate-x-1/2 rounded-2xl border border-neutral-medium bg-white px-3 py-3 text-center shadow-2xl shadow-neutral-dark/20 dark:border-gray-700 dark:bg-gray-900 animate-in fade-in zoom-in-95 duration-150 ${position.placement === 'top' ? '-translate-y-full' : ''}`}
          style={{ top: position.top, left: position.left }}
        >
          <div className="flex flex-col items-center">
            <div className="relative w-24 h-24">
              <div className="h-full w-full rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden shadow-sm">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={fullName} className="w-full h-full object-cover" onError={() => setImgError(true)} />
                ) : (
                  <span className="text-2xl font-black text-primary">{initials}</span>
                )}
              </div>
              {isOnline && (
                <span className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 shadow-sm dark:border-gray-900" />
              )}
            </div>
            <div className="min-w-0 mt-2">
              <p className="text-xs font-black text-neutral-dark dark:text-white leading-tight">{fullName}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-primary mt-0.5">{role}</p>
            </div>
          </div>
          <div className={`absolute left-1/2 -translate-x-1/2 border-8 border-transparent ${position.placement === 'top' ? 'top-full border-t-white dark:border-t-gray-900' : 'bottom-full border-b-white dark:border-b-gray-900'}`} />
        </div>,
        document.body
      )}
    </div>
  );
};

export default UserHoverCard;
