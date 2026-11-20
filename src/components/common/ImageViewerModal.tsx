import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { X } from 'lucide-react';

export const ImageViewerModal: React.FC = () => {
  const { imageLightboxUrl, setImageLightboxUrl } = useApp();

  if (!imageLightboxUrl) return null;

  const isVideo =
    imageLightboxUrl.includes('/video/upload/') ||
    imageLightboxUrl.match(/\.(mp4|webm|mov|ogg|m4v)(\?.*)?$/i) !== null ||
    imageLightboxUrl.startsWith('data:video/');

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={() => setImageLightboxUrl(null)}
      role="dialog"
      aria-label="Media Preview"
    >
      <button
        onClick={() => setImageLightboxUrl(null)}
        className="absolute top-4 right-4 z-10 w-11 h-11 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors focus:ring-2 focus:ring-white"
        aria-label="Close media preview"
      >
        <X className="w-6 h-6" />
      </button>

      <div
        className="max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {isVideo ? (
          <video
            src={imageLightboxUrl}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl bg-black"
          />
        ) : (
          <img
            src={imageLightboxUrl}
            alt="Campus preview"
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
          />
        )}
      </div>
    </div>
  );
};
