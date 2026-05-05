import React from 'react';
import type { Notification } from '../App';

interface ToastProps {
  notification: Notification;
}

const Toast: React.FC<ToastProps> = ({ notification }) => {
  if (!notification.show) return null;

  const isError = notification.type === 'error';

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className={`flex items-center space-x-3 px-5 py-3 rounded-xl shadow-lg border bg-white ${
        isError ? 'border-red-200 text-red-700' 
                : 'border-green-200 text-green-700'
      }`}>
        <div className={`flex items-center justify-center w-6 h-6 rounded-full ${isError ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
          {isError ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
          )}
        </div>
        <span className="font-medium text-sm">{notification.message}</span>
      </div>
    </div>
  );
};

export default Toast;
