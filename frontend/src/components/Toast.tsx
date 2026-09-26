import React from 'react';

export type Toast = { id: number; message: string; type: 'success' | 'error' };

const Toasts: React.FC<{ toasts: Toast[] }> = ({ toasts }) => (
  <div className="fixed bottom-20 md:bottom-6 right-4 left-4 sm:left-auto z-[60] flex flex-col items-end space-y-2 pointer-events-none">
    {toasts.map(t => {
      const isError = t.type === 'error';
      return (
        <div key={t.id} role={isError ? 'alert' : 'status'} className={`flex items-center space-x-3 px-5 py-3 rounded-xl shadow-lg border bg-white dark:bg-gray-900 max-w-md ${
          isError ? 'border-red-200 dark:border-red-900 text-red-700 dark:text-red-300' : 'border-green-200 dark:border-green-900 text-green-700 dark:text-green-300'
        }`}>
          <div className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${isError ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
            {isError ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
            )}
          </div>
          <span className="font-medium text-sm">{t.message}</span>
        </div>
      );
    })}
  </div>
);

export default Toasts;
