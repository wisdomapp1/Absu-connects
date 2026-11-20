import React, { useEffect, useRef, useState } from 'react';
import { useCall } from '../../context/CallContext.tsx';
import { Avatar } from '../common/Avatar.tsx';
import {
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  RefreshCw,
  Zap,
  Info,
  ShieldCheck,
  AlertTriangle,
  Clock,
} from 'lucide-react';

export const ActiveCallOverlay: React.FC = () => {
  const {
    activeCall,
    localStream,
    remoteStream,
    remoteMediaState,
    callQuality,
    endCall,
    toggleMute,
    toggleCamera,
    toggleDataSaver,
    flipCamera,
  } = useCall();

  const [showNetworkInfo, setShowNetworkInfo] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Bind local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, activeCall?.isVideoEnabled]);

  // Bind remote stream to video & audio elements with mobile autoplay unblock
  useEffect(() => {
    if (remoteStream) {
      if (remoteVideoRef.current && activeCall?.callType === 'video') {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch((e) => {
          console.debug('[ActiveCallOverlay] Remote audio autoplay handled:', e);
        });
      }
    }
  }, [remoteStream, activeCall?.callType]);

  // Auto-close overlay after call terminal states (ended, declined, missed, or failed)
  useEffect(() => {
    if (
      activeCall?.status === 'ended' ||
      activeCall?.status === 'declined' ||
      activeCall?.status === 'missed' ||
      activeCall?.status === 'failed'
    ) {
      const timer = setTimeout(() => {
        endCall();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [activeCall?.status, endCall]);

  if (!activeCall) return null;

  const {
    callType,
    status,
    peer,
    durationSeconds,
    isMuted,
    isVideoEnabled,
    dataSaver,
    errorMessage,
  } = activeCall;

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'outgoing':
        return 'Calling...';
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return formatDuration(durationSeconds);
      case 'declined':
        return 'Call Declined';
      case 'missed':
        return 'No Answer · Missed Call';
      case 'ended':
        return 'Call Ended';
      case 'failed':
        return 'Call Failed';
      default:
        return 'Connecting...';
    }
  };

  const isTerminal =
    status === 'ended' ||
    status === 'declined' ||
    status === 'missed' ||
    status === 'failed';

  return (
    <div
      className="fixed inset-0 z-[95] flex flex-col bg-slate-950 text-white overflow-hidden animate-in fade-in select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Active Call"
    >
      {/* Hidden audio element to guarantee remote voice playback */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* 1. TOP HEADER: Status, Duration, Data Saver & Info */}
      <div className="shrink-0 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between z-20 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <span className="text-xs text-white/70 font-medium">
              {callType === 'video' ? 'ABSU Video Call' : 'ABSU Voice Call'}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {status === 'connected' && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              )}
              <span className="text-sm sm:text-base font-bold tracking-tight">
                {getStatusLabel()}
              </span>
            </div>
          </div>
        </div>

        {/* Right Header Badges & Actions */}
        <div className="flex items-center gap-2">
          {/* Data Saver Mode Toggle Badge */}
          <button
            onClick={toggleDataSaver}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all border ${
              dataSaver
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                : 'bg-white/10 text-white/70 border-white/10 hover:bg-white/20'
            }`}
            title="Toggle Low-Data Mode (Saves mobile data on 2G/3G/4G)"
          >
            <Zap className={`w-3.5 h-3.5 ${dataSaver ? 'text-amber-400' : ''}`} />
            <span className="hidden xs:inline">
              {dataSaver ? 'Data Saver ON (240p / 16k)' : 'Data Saver'}
            </span>
          </button>

          {/* Network / STUN Info Tooltip Toggle */}
          <button
            onClick={() => setShowNetworkInfo((prev) => !prev)}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
            aria-label="Network information"
            title="Connection details"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Network / NAT Transparent Info Overlay */}
      {showNetworkInfo && (
        <div className="mx-4 sm:mx-6 p-3.5 rounded-2xl bg-slate-900/90 border border-violet-500/30 text-xs text-violet-200 z-30 mb-2 animate-in slide-in-from-top-2">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-white mb-0.5">
                ABSU Connect Real-Time Calling Architecture
              </p>
              <p className="text-[11px] leading-relaxed opacity-85">
                Calls establish direct peer-to-peer WebRTC connections via Google STUN
                infrastructure. In Low-Data mode, audio bitrates are compressed using Opus
                (16 kbps) and video resolution is throttled to 240p to minimize Nigerian
                cellular data consumption.
              </p>
            </div>
            <button
              onClick={() => setShowNetworkInfo(false)}
              className="text-white/60 hover:text-white text-xs px-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Connection Failure Notice */}
      {errorMessage && (
        <div className="mx-4 sm:mx-6 p-3 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-xs text-rose-200 z-30 mb-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <p>{errorMessage}</p>
        </div>
      )}

      {/* 2. MAIN CALL VIEWPORT */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {callType === 'video' ? (
          // VIDEO CALL LAYOUT
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            {/* Remote Peer Video Stream */}
            {remoteStream && remoteMediaState.isVideoEnabled ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover sm:object-contain"
              />
            ) : (
              // Remote Camera Paused or Audio Only
              <div className="flex flex-col items-center justify-center text-center p-6">
                <Avatar
                  src={peer.avatar}
                  name={peer.name}
                  size="xl"
                  className="w-28 h-28 ring-4 ring-violet-500/40 shadow-2xl mb-4"
                />
                <h3 className="text-xl font-bold text-white">{peer.name}</h3>
                <p className="text-xs text-white/60 mt-1">
                  {status === 'connected'
                    ? remoteMediaState.isVideoEnabled === false
                      ? 'Camera paused by participant'
                      : 'Audio streaming'
                    : getStatusLabel()}
                </p>
              </div>
            )}

            {/* Local Video Stream: Floating Picture-in-Picture in Corner */}
            {localStream && isVideoEnabled && (
              <div className="absolute top-4 right-4 w-28 h-36 sm:w-36 sm:h-48 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-slate-900 z-20">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform scale-x-[-1]"
                />
                <div className="absolute bottom-1 left-2 text-[10px] bg-black/60 px-1.5 py-0.5 rounded text-white/90 font-medium">
                  You
                </div>
              </div>
            )}

            {/* Local Video Disabled Pill */}
            {!isVideoEnabled && (
              <div className="absolute top-4 right-4 px-3 py-1.5 rounded-xl bg-black/60 border border-white/20 text-xs text-white/80 z-20 flex items-center gap-1.5">
                <VideoOff className="w-3.5 h-3.5 text-rose-400" />
                <span>Camera off</span>
              </div>
            )}
          </div>
        ) : (
          // VOICE CALL LAYOUT
          <div className="flex flex-col items-center justify-center text-center p-6 relative w-full h-full bg-gradient-to-b from-[#1b0d36] via-[#100624] to-[#080214]">
            {/* Animated Sound Wave Rings */}
            <div className="relative mb-6">
              {status === 'connected' && (
                <>
                  <div className="absolute -inset-6 rounded-full bg-violet-600/20 animate-ping opacity-60"></div>
                  <div className="absolute -inset-3 rounded-full bg-violet-500/25 animate-pulse"></div>
                </>
              )}
              {status === 'outgoing' && (
                <div className="absolute -inset-4 rounded-full bg-violet-500/30 animate-pulse"></div>
              )}
              <div className="relative">
                <Avatar
                  src={peer.avatar}
                  name={peer.name}
                  size="xl"
                  className="w-32 h-32 ring-4 ring-violet-500 shadow-2xl"
                />
              </div>
            </div>

            {/* Peer Info */}
            <h2 className="text-2xl font-extrabold text-white tracking-tight">
              {peer.name}
            </h2>
            <p className="text-xs sm:text-sm text-violet-200/80 mt-1">
              {peer.department || 'ABSU Student'}
            </p>

            {/* Peer Remote Mute Indicator */}
            {remoteMediaState.isMuted && status === 'connected' && (
              <span className="mt-3 px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-1">
                <MicOff className="w-3 h-3" />
                <span>{peer.name} is muted</span>
              </span>
            )}

            {/* Low Data Mode Indicator */}
            {dataSaver && status === 'connected' && (
              <span className="mt-2 text-[11px] text-amber-300/80 flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-400" />
                <span>16 kbps Low-Data Opus Speech Mode Active</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* 3. BOTTOM CALL CONTROLS */}
      <div className="shrink-0 px-6 py-6 pb-8 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-center gap-5 sm:gap-8 z-20">
        {!isTerminal ? (
          <>
            {/* Mute/Unmute Mic Button */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                onClick={toggleMute}
                className={`w-13 h-13 rounded-full flex items-center justify-center transition-all ${
                  isMuted
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                    : 'bg-white/15 hover:bg-white/25 text-white'
                }`}
                aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
              <span className="text-[11px] text-white/70">
                {isMuted ? 'Unmute' : 'Mute'}
              </span>
            </div>

            {/* Video Call Controls (Toggle Camera / Flip Camera) */}
            {callType === 'video' && (
              <>
                {/* Toggle Camera On/Off */}
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    onClick={toggleCamera}
                    className={`w-13 h-13 rounded-full flex items-center justify-center transition-all ${
                      !isVideoEnabled
                        ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                        : 'bg-white/15 hover:bg-white/25 text-white'
                    }`}
                    aria-label={isVideoEnabled ? 'Turn camera off' : 'Turn camera on'}
                  >
                    {isVideoEnabled ? (
                      <Video className="w-6 h-6" />
                    ) : (
                      <VideoOff className="w-6 h-6" />
                    )}
                  </button>
                  <span className="text-[11px] text-white/70">
                    {isVideoEnabled ? 'Stop Video' : 'Start Video'}
                  </span>
                </div>

                {/* Flip Camera (Front / Back) */}
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    onClick={flipCamera}
                    disabled={!isVideoEnabled}
                    className="w-13 h-13 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-40 text-white flex items-center justify-center transition-all"
                    aria-label="Flip camera"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                  <span className="text-[11px] text-white/70">Flip</span>
                </div>
              </>
            )}

            {/* End Call Button */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                onClick={endCall}
                className="w-15 h-15 rounded-full bg-rose-600 hover:bg-rose-500 active:scale-95 text-white flex items-center justify-center shadow-xl shadow-rose-600/40 transition-all focus:outline-none focus:ring-4 focus:ring-rose-500/50"
                aria-label="End call"
              >
                <PhoneOff className="w-7 h-7" />
              </button>
              <span className="text-[11px] font-semibold text-rose-300">End</span>
            </div>
          </>
        ) : (
          <button
            onClick={endCall}
            className="px-6 py-2.5 rounded-2xl bg-white/20 hover:bg-white/30 text-white font-semibold text-xs transition-colors"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
};
