import React, { useEffect } from 'react';
import Icon from './Icon';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Bottom sheet on phones, centered dialog on wider screens. */
const Sheet: React.FC<SheetProps> = ({ title, onClose, children, footer }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full md:max-w-lg max-h-[92vh] flex flex-col bg-white dark:bg-gray-900 rounded-t-2xl md:rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button onClick={onClose} className="p-1.5 -mr-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-5">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
};

export default Sheet;
