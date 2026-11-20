import React from 'react';
import { useCall } from '../../context/CallContext.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { Phone, PhoneOff, Video, ShieldCheck, Zap } from 'lucide-react';

export const IncomingCallModal: React.FC = () => {
  const { incomingCall, acceptCall, declineCall } = useCall();

  if (!incomingCall) return null;

  const { caller, callType, dataSaver } = incomingCall;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="incoming-call-title"
    >
      <div className="relative w-full max-w-sm bg-gradient-to-b from-[#241442] to-[#120824] border border-violet-500/30 rounded-3xl p-6 shadow-2xl text-center text-white flex flex-col items-center">
        {/* Call Type Pill */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/20 border border-violet-500/40 text-violet-200 text-xs font-semibold mb-4 animate-pulse">
          {callType === 'video' ? (
            <>
              <Video className="w-3.5 h-3.5 text-violet-300" />
              <span>Incoming Video Call</span>
            </>
          ) : (
            <>
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              <span>Incoming Voice Call</span>
            </>
          )}
        </div>

        {/* Pulsing Avatar with Glowing Rings */}
        <div className="relative mb-4 mt-2">
          {/* Animated concentric pulse rings */}
          <span className="absolute -inset-3 rounded-full bg-violet-600/30 animate-ping opacity-75"></span>
          <span className="absolute -inset-1.5 rounded-full bg-violet-500/40 animate-pulse"></span>
          <div className="relative">
            <Avatar
              src={caller.avatar}
              name={caller.name}
              size="xl"
              className="w-24 h-24 ring-4 ring-violet-500 shadow-xl"
            />
          </div>
        </div>

        {/* Caller Name & Subtitle */}
        <h2 id="incoming-call-title" className="text-xl font-extrabold text-white tracking-tight">
          {caller.name}
        </h2>
        <p className="text-xs text-violet-200/80 mt-1">
          {caller.department || 'ABSU Student'}
        </p>

        {/* Low Data / Privacy reassurance */}
        <div className="flex items-center gap-2 mt-4 text-[11px] text-violet-300/70">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Peer-to-peer encrypted</span>
          {dataSaver && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">
              <Zap className="w-2.5 h-2.5" />
              Low Data
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="mt-8 flex items-center justify-center gap-10 w-full">
          {/* Decline Button */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={declineCall}
              className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-rose-600/30 transition-all focus:outline-none focus:ring-4 focus:ring-rose-500/50"
              aria-label="Decline call"
            >
              <PhoneOff className="w-7 h-7" />
            </button>
            <span className="text-xs font-semibold text-rose-300">Decline</span>
          </div>

          {/* Accept Button */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={acceptCall}
              className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30 transition-all focus:outline-none focus:ring-4 focus:ring-emerald-500/50 animate-bounce"
              aria-label="Accept call"
            >
              {callType === 'video' ? (
                <Video className="w-7 h-7" />
              ) : (
                <Phone className="w-7 h-7" />
              )}
            </button>
            <span className="text-xs font-semibold text-emerald-300">Accept</span>
          </div>
        </div>
      </div>
    </div>
  );
};
