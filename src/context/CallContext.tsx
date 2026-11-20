import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase.ts';
import { useAuth } from './AuthContext.tsx';
import { callAudio } from '../lib/callAudioSynthesizer.ts';
import { checkMediaPermission, checkDeviceAvailability } from '../utils/permissionUtils.ts';
import { MediaPermissionModal } from '../components/calls/MediaPermissionModal.tsx';
import { createRealNotification } from '../lib/notificationService.ts';
import type {
  CallType,
  CallParticipant,
  ActiveCall,
  IncomingCallInvite,
  CallSignalPayload,
} from '../types/call.ts';

interface CallContextType {
  activeCall: ActiveCall | null;
  incomingCall: IncomingCallInvite | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteMediaState: { isMuted: boolean; isVideoEnabled: boolean };
  callQuality: 'good' | 'poor' | 'reconnecting';
  startCall: (peer: CallParticipant, type: CallType) => Promise<boolean>;
  acceptCall: () => Promise<boolean>;
  declineCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => Promise<void>;
  toggleDataSaver: () => void;
  flipCamera: () => Promise<void>;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

// Comprehensive STUN & Open Relay TURN Server configuration for reliable cross-carrier mobile network traversal
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  // Google STUN servers (IPv4 & IPv6 global endpoints)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  // Cloudflare STUN (low latency routing)
  { urls: 'stun:stun.cloudflare.com:3478' },
  // Twilio & Mozilla STUN
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun.services.mozilla.com:3478' },
  // Open Relay Project TURN (UDP, TCP & Secure TLS over ports 80, 443, 3478, 5349)
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:3478',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: [
      'turn:openrelay.metered.ca:80?transport=tcp',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turn:openrelay.metered.ca:3478?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: [
      'turns:openrelay.metered.ca:443?transport=tcp',
      'turns:openrelay.metered.ca:5349?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

// Low-data Opus SDP modifier: constrains bitrate to save student data
function applyDataSaverSDP(sdp: string, dataSaver: boolean): string {
  if (!dataSaver) return sdp;
  let modified = sdp;
  // Limit audio bitrate to 16 kbps (super-efficient speech codec)
  if (modified.includes('a=rtpmap:') && modified.includes('opus/48000')) {
    modified = modified.replace(
      /(a=fmtp:\d+ .*)/g,
      '$1;maxaveragebitrate=16000;stereo=0;useinbandfec=1'
    );
  }
  // Add bandwidth cap for video track if present: ~150 kbps
  if (modified.includes('m=video')) {
    modified = modified.replace(/(m=video \d+ [A-Z/]+ \d+)/, '$1\r\nb=AS:150');
  }
  return modified;
}

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const currentUserId = user?.id;

  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallInvite | null>(null);
  const [localStream, setLocalStreamState] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStreamState] = useState<MediaStream | null>(null);
  const [remoteMediaState, setRemoteMediaState] = useState<{
    isMuted: boolean;
    isVideoEnabled: boolean;
  }>({ isMuted: false, isVideoEnabled: true });
  const [callQuality, setCallQuality] = useState<'good' | 'poor' | 'reconnecting'>('good');
  const [permModalState, setPermModalState] = useState<{
    isOpen: boolean;
    callType: CallType;
    isDenied: boolean;
    pendingAction: 'start' | 'accept';
    peer?: CallParticipant;
  } | null>(null);

  // Hardware & WebRTC Refs for zero-leak teardown & race-free candidate buffering
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const incomingCallRef = useRef<IncomingCallInvite | null>(null);
  const callChannelRef = useRef<any>(null);
  const userChannelRef = useRef<any>(null);
  const isChannelSubscribedRef = useRef<boolean>(false);
  const durationTimerRef = useRef<any>(null);
  const callTimeoutRef = useRef<any>(null);
  const iceCandidatesQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const outgoingIceCandidatesQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const localCandidatesHistoryRef = useRef<RTCIceCandidateInit[]>([]);
  const acceptRetryTimerRef = useRef<any>(null);
  const offerRetryTimerRef = useRef<any>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>(DEFAULT_ICE_SERVERS);

  // Keep refs in sync
  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  // Synchronize stream setters with refs
  const setLocalStream = useCallback((stream: MediaStream | null) => {
    localStreamRef.current = stream;
    setLocalStreamState(stream);
  }, []);

  const setRemoteStream = useCallback((stream: MediaStream | null) => {
    remoteStreamRef.current = stream;
    setRemoteStreamState(stream);
  }, []);

  // Securely query dynamic ICE servers on startup (with instant default fallback)
  useEffect(() => {
    fetch('/api/webrtc/ice-servers')
      .then((res) => {
        if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) {
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.success && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
          iceServersRef.current = data.iceServers;
        }
      })
      .catch((err) => {
        console.debug('[WebRTC] dynamic ICE servers notice:', err);
      });
  }, []);

  // Safe helper to apply ICE candidate or buffer until remoteDescription is active
  const addCandidateSafely = useCallback(
    async (pc: RTCPeerConnection, candidate: RTCIceCandidateInit) => {
      if (!candidate || !candidate.candidate) return;
      if (pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.debug('[WebRTC] add candidate note:', e);
        }
      } else {
        iceCandidatesQueueRef.current.push(candidate);
      }
    },
    []
  );

  // Drain any queued ICE candidates after setRemoteDescription completes
  const drainCandidateQueue = useCallback(async (pc: RTCPeerConnection) => {
    while (iceCandidatesQueueRef.current.length > 0) {
      const c = iceCandidatesQueueRef.current.shift();
      if (c && c.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(c));
        } catch (e) {
          console.debug('[WebRTC] drain candidate note:', e);
        }
      }
    }
  }, []);

  // Authoritative clean teardown helper - stops all audio/video tracks on hardware level
  const cleanUpCallResources = useCallback(() => {
    callAudio.stopRinging();

    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
    if (acceptRetryTimerRef.current) {
      clearInterval(acceptRetryTimerRef.current);
      acceptRetryTimerRef.current = null;
    }
    if (offerRetryTimerRef.current) {
      clearTimeout(offerRetryTimerRef.current);
      offerRetryTimerRef.current = null;
    }

    localCandidatesHistoryRef.current = [];
    iceCandidatesQueueRef.current = [];
    outgoingIceCandidatesQueueRef.current = [];

    // Stop every local audio & video track
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
          track.enabled = false;
        } catch {}
      });
      localStreamRef.current = null;
    }
    setLocalStreamState(null);

    // Stop every remote audio & video track
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
          track.enabled = false;
        } catch {}
      });
      remoteStreamRef.current = null;
    }
    setRemoteStreamState(null);

    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }

    if (callChannelRef.current) {
      try {
        supabase.removeChannel(callChannelRef.current);
      } catch {}
      callChannelRef.current = null;
    }

    isChannelSubscribedRef.current = false;
    iceCandidatesQueueRef.current = [];
    outgoingIceCandidatesQueueRef.current = [];
  }, []);

  // End Call function with immediate two-way synchronization
  const endCall = useCallback(() => {
    const current = activeCallRef.current;
    if (current) {
      // 1. Broadcast 'end' to call channel if established
      if (callChannelRef.current) {
        callChannelRef.current
          .send({
            type: 'broadcast',
            event: 'call_signal',
            payload: {
              callId: current.callId,
              senderId: currentUserId,
              type: 'end',
            } as CallSignalPayload,
          })
          .catch(() => {});
      }

      // 2. If call was still outgoing or connecting, also broadcast cancellation to peer's personal channel
      if ((current.status === 'outgoing' || current.status === 'connecting') && current.peer?.id) {
        const peerChan = supabase.channel(`user:${current.peer.id}:calls`);
        peerChan.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            peerChan
              .send({
                type: 'broadcast',
                event: 'call_cancel',
                payload: {
                  callId: current.callId,
                  senderId: currentUserId,
                  recipientId: current.peer.id,
                },
              })
              .then(() => supabase.removeChannel(peerChan))
              .catch(() => {});
          }
        });
      }
    }

    callAudio.playEndChime();
    cleanUpCallResources();
    setActiveCall(null);
    setIncomingCall(null);
  }, [currentUserId, cleanUpCallResources]);

  // Decline incoming call with two-way signaling
  const declineCall = useCallback(() => {
    if (!incomingCall || !currentUserId) return;
    const { callId, caller } = incomingCall;

    callAudio.stopRinging();
    callAudio.playEndChime();

    // 1. Broadcast decline to call channel
    const tempChannel = supabase.channel(`call:${callId}`);
    tempChannel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        tempChannel
          .send({
            type: 'broadcast',
            event: 'call_signal',
            payload: {
              callId,
              senderId: currentUserId,
              type: 'decline',
            } as CallSignalPayload,
          })
          .then(() => supabase.removeChannel(tempChannel))
          .catch(() => {});
      }
    });

    // 2. Also notify caller on personal channel in case caller call channel is still subscribing
    if (caller?.id) {
      const callerChan = supabase.channel(`user:${caller.id}:calls`);
      callerChan.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          callerChan
            .send({
              type: 'broadcast',
              event: 'call_decline',
              payload: {
                callId,
                senderId: currentUserId,
                callerId: caller.id,
              },
            })
            .then(() => supabase.removeChannel(callerChan))
            .catch(() => {});
        }
      });
    }

    setIncomingCall(null);
  }, [incomingCall, currentUserId]);

  // Obtain user media stream
  const acquireMediaStream = useCallback(
    async (
      callType: CallType,
      dataSaver: boolean,
      facingMode: 'user' | 'environment' = 'user'
    ): Promise<MediaStream> => {
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };

      if (callType === 'audio') {
        return await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: false,
        });
      }

      const videoConstraints: MediaTrackConstraints = dataSaver
        ? {
            facingMode,
            width: { max: 320 },
            height: { max: 240 },
            frameRate: { max: 15 },
          }
        : {
            facingMode,
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 24, max: 30 },
          };

      return await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: videoConstraints,
      });
    },
    []
  );

  // Initialize WebRTC RTCPeerConnection and bind listeners
  const setupPeerConnection = useCallback(
    (callId: string, currentDataSaver: boolean): RTCPeerConnection => {
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {}
      }

      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current,
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
      });
      pcRef.current = pc;
      outgoingIceCandidatesQueueRef.current = [];
      localCandidatesHistoryRef.current = [];
      isChannelSubscribedRef.current = false;

      // ICE Candidate event -> buffer until channel is subscribed, then send
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        const candJson = event.candidate.toJSON();
        if (!candJson.candidate) return;

        localCandidatesHistoryRef.current.push(candJson);

        if (callChannelRef.current && isChannelSubscribedRef.current) {
          callChannelRef.current
            .send({
              type: 'broadcast',
              event: 'call_signal',
              payload: {
                callId,
                senderId: currentUserId,
                type: 'candidate',
                candidate: candJson,
              } as CallSignalPayload,
            })
            .catch(() => {});
        } else {
          outgoingIceCandidatesQueueRef.current.push(candJson);
        }
      };

      // Helper to cleanly mark call connected and start duration timer
      const markCallConnected = () => {
        callAudio.playConnectedChime();
        setCallQuality('good');
        setActiveCall((prev) => {
          if (!prev || prev.status === 'connected') return prev;
          return { ...prev, status: 'connected', startedAt: prev.startedAt || Date.now() };
        });

        if (durationTimerRef.current) clearInterval(durationTimerRef.current);
        durationTimerRef.current = setInterval(() => {
          setActiveCall((prev) =>
            prev && prev.status === 'connected'
              ? { ...prev, durationSeconds: prev.durationSeconds + 1 }
              : prev
          );
        }, 1000);
      };

      // Remote stream track arriving
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
          markCallConnected();
        }
      };

      // Connection state monitor
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'connected') {
          markCallConnected();
        } else if (state === 'disconnected') {
          setCallQuality('poor');
        } else if (state === 'failed') {
          setCallQuality('reconnecting');
          setActiveCall((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'failed',
                  errorMessage:
                    'Connection could not be established. Network NAT/firewall check failed.',
                }
              : null
          );
        } else if (state === 'closed') {
          cleanUpCallResources();
          setActiveCall((prev) => (prev ? { ...prev, status: 'ended' } : null));
        }
      };

      pc.oniceconnectionstatechange = () => {
        const ice = pc.iceConnectionState;
        if (ice === 'disconnected' || ice === 'failed') {
          setCallQuality('poor');
        } else if (ice === 'connected' || ice === 'completed') {
          markCallConnected();
        }
      };

      return pc;
    },
    [currentUserId, setRemoteStream, cleanUpCallResources]
  );

  // Execute accepting an incoming call (with optional pre-acquired stream from permission gesture)
  const executeAcceptCall = useCallback(
    async (preAcquiredStream?: MediaStream): Promise<boolean> => {
      if (!incomingCall || !currentUserId) return false;

      callAudio.stopRinging();
      const { callId, callType, caller, dataSaver = false } = incomingCall;

      try {
        // 1. Acquire media stream (mic and optional camera) or use preAcquiredStream
        const stream = preAcquiredStream || (await acquireMediaStream(callType, dataSaver, 'user'));
        setLocalStream(stream);

        // 2. Set active call state
        setActiveCall({
          callId,
          callType,
          status: 'connecting',
          peer: caller,
          isOutgoing: false,
          durationSeconds: 0,
          isMuted: false,
          isVideoEnabled: callType === 'video',
          isSpeakerOn: true,
          dataSaver,
          facingMode: 'user',
        });
        setIncomingCall(null);

        // 3. Setup RTCPeerConnection
        const pc = setupPeerConnection(callId, dataSaver);
        stream.getTracks().forEach((track) => {
          track.enabled = true;
          pc.addTrack(track, stream);
        });

        // 4. Subscribe to call signaling channel
        const channel = supabase.channel(`call:${callId}`, {
          config: { broadcast: { self: false } },
        });

        channel
          .on('broadcast', { event: 'call_signal' }, async (payload: { payload: CallSignalPayload }) => {
            const signal = payload.payload;
            if (signal.senderId === currentUserId) return;

            if (signal.type === 'offer' && signal.sdp) {
              try {
                // Clear accept retry timer since offer has arrived!
                if (acceptRetryTimerRef.current) {
                  clearInterval(acceptRetryTimerRef.current);
                  acceptRetryTimerRef.current = null;
                }

                await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                await drainCandidateQueue(pc);

                // Add any candidates bundled with offer
                if (signal.candidates && Array.isArray(signal.candidates)) {
                  for (const cand of signal.candidates) {
                    await addCandidateSafely(pc, cand);
                  }
                }

                const answer = await pc.createAnswer();
                const modifiedSdp = applyDataSaverSDP(answer.sdp || '', dataSaver);
                const finalAnswer = { type: answer.type, sdp: modifiedSdp };

                await pc.setLocalDescription(finalAnswer);

                channel.send({
                  type: 'broadcast',
                  event: 'call_signal',
                  payload: {
                    callId,
                    senderId: currentUserId,
                    type: 'answer',
                    sdp: finalAnswer,
                    candidates: [...localCandidatesHistoryRef.current],
                  } as CallSignalPayload,
                });
              } catch (sdpErr) {
                console.error('[WebRTC] Answer error:', sdpErr);
              }
            } else if (signal.type === 'candidates_sync' && signal.candidates) {
              for (const cand of signal.candidates) {
                await addCandidateSafely(pc, cand);
              }
            } else if (signal.type === 'candidate' && signal.candidate) {
              await addCandidateSafely(pc, signal.candidate);
            } else if (signal.type === 'media_state' && signal.mediaState) {
              setRemoteMediaState({
                isMuted: Boolean(signal.mediaState.isMuted),
                isVideoEnabled: signal.mediaState.isVideoEnabled !== false,
              });
            } else if (signal.type === 'end') {
              callAudio.playEndChime();
              cleanUpCallResources();
              setActiveCall((prev) => (prev ? { ...prev, status: 'ended' } : null));
            }
          })
          .subscribe((status: string) => {
            if (status === 'SUBSCRIBED') {
              callChannelRef.current = channel;
              isChannelSubscribedRef.current = true;

              // Drain any buffered outgoing ICE candidates immediately
              while (outgoingIceCandidatesQueueRef.current.length > 0) {
                const cand = outgoingIceCandidatesQueueRef.current.shift();
                if (cand && callChannelRef.current) {
                  callChannelRef.current
                    .send({
                      type: 'broadcast',
                      event: 'call_signal',
                      payload: {
                        callId,
                        senderId: currentUserId,
                        type: 'candidate',
                        candidate: cand,
                      } as CallSignalPayload,
                    })
                    .catch(() => {});
                }
              }

              const sendAccept = () => {
                if (callChannelRef.current) {
                  callChannelRef.current.send({
                    type: 'broadcast',
                    event: 'call_signal',
                    payload: {
                      callId,
                      senderId: currentUserId,
                      type: 'accept',
                      candidates: [...localCandidatesHistoryRef.current],
                    } as CallSignalPayload,
                  });
                }
              };

              // Initial accept signal
              sendAccept();

              // Retry accept signal every 1000ms until offer arrives (up to 5 attempts)
              let acceptAttempts = 0;
              if (acceptRetryTimerRef.current) clearInterval(acceptRetryTimerRef.current);
              acceptRetryTimerRef.current = setInterval(() => {
                acceptAttempts++;
                if (acceptAttempts > 5 || pc.remoteDescription !== null) {
                  clearInterval(acceptRetryTimerRef.current);
                  acceptRetryTimerRef.current = null;
                  return;
                }
                sendAccept();
              }, 1000);
            }
          });

        // 16-second connecting watchdog to avoid indefinite 'Connecting...' state
        setTimeout(() => {
          setActiveCall((prev) => {
            if (prev && prev.status === 'connecting') {
              callAudio.playEndChime();
              cleanUpCallResources();
              return {
                ...prev,
                status: 'failed',
                errorMessage: 'Connection timed out. Peer network could not be reached.',
              };
            }
            return prev;
          });
        }, 16000);

        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Permission denied for microphone/camera.';
        console.error('[WebRTC] Call accept failed:', msg);
        callAudio.playEndChime();
        cleanUpCallResources();
        if (msg.includes('Permission') || msg.includes('NotAllowedError')) {
          setPermModalState({
            isOpen: true,
            callType,
            isDenied: true,
            pendingAction: 'accept',
            peer: caller,
          });
        }
        setActiveCall({
          callId,
          callType,
          status: 'failed',
          peer: caller,
          isOutgoing: false,
          durationSeconds: 0,
          isMuted: false,
          isVideoEnabled: false,
          isSpeakerOn: true,
          dataSaver,
          facingMode: 'user',
          errorMessage: msg.includes('Permission')
            ? 'Microphone/Camera permission denied in browser.'
            : 'Could not access media devices.',
        });
        return false;
      }
    },
    [incomingCall, currentUserId, acquireMediaStream, setLocalStream, setupPeerConnection, cleanUpCallResources]
  );

  // Accept incoming call with permission pre-check
  const acceptCall = useCallback(async (): Promise<boolean> => {
    if (!incomingCall || !currentUserId) return false;
    const { callType, caller } = incomingCall;

    // 1. Check physical hardware availability
    const devices = await checkDeviceAvailability();
    if (!devices.hasMicrophone) {
      callAudio.stopRinging();
      setActiveCall({
        callId: incomingCall.callId,
        callType,
        status: 'failed',
        peer: caller,
        isOutgoing: false,
        durationSeconds: 0,
        isMuted: false,
        isVideoEnabled: false,
        isSpeakerOn: true,
        dataSaver: incomingCall.dataSaver || false,
        facingMode: 'user',
        errorMessage: 'No microphone detected on your device.',
      });
      return false;
    }

    // 2. Query permissions
    const perm = await checkMediaPermission(callType);
    if (perm.mic === 'denied' || (callType === 'video' && perm.camera === 'denied')) {
      setPermModalState({
        isOpen: true,
        callType,
        isDenied: true,
        pendingAction: 'accept',
        peer: caller,
      });
      return false;
    }

    if (!perm.canDirectlyCall) {
      setPermModalState({
        isOpen: true,
        callType,
        isDenied: false,
        pendingAction: 'accept',
        peer: caller,
      });
      return false;
    }

    return executeAcceptCall();
  }, [incomingCall, currentUserId, executeAcceptCall]);


  // Execute outgoing call signaling (with optional pre-acquired stream from permission gesture)
  const executeStartCall = useCallback(
    async (
      peer: CallParticipant,
      type: CallType,
      preAcquiredStream?: MediaStream
    ): Promise<boolean> => {
      if (!currentUserId || !peer.id) return false;
      cleanUpCallResources();

      const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const dataSaver = false; // Default off, toggleable in call overlay

      try {
        // 1. Acquire media or use preAcquiredStream
        const stream = preAcquiredStream || (await acquireMediaStream(type, dataSaver, 'user'));
        setLocalStream(stream);

        // 2. Set outgoing state
        setActiveCall({
          callId,
          callType: type,
          status: 'outgoing',
          peer,
          isOutgoing: true,
          durationSeconds: 0,
          isMuted: false,
          isVideoEnabled: type === 'video',
          isSpeakerOn: true,
          dataSaver,
          facingMode: 'user',
        });

        // 3. Play gentle dial-back tone
        callAudio.startOutgoingRinging();

        // 4. Setup RTCPeerConnection
        const pc = setupPeerConnection(callId, dataSaver);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // 5. Send invite to recipient's personal call channel
        const recipientChannel = supabase.channel(`user:${peer.id}:calls`);
        recipientChannel.subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            recipientChannel
              .send({
                type: 'broadcast',
                event: 'call_invite',
                payload: {
                  callId,
                  callType: type,
                  caller: {
                    id: currentUserId,
                    name: (user as any)?.user_metadata?.display_name || 'ABSU Student',
                    avatar: (user as any)?.user_metadata?.avatar_url,
                  },
                  recipientId: peer.id,
                  createdAt: Date.now(),
                  dataSaver,
                } as IncomingCallInvite,
              })
              .then(() => {
                supabase.removeChannel(recipientChannel);
              })
              .catch(() => {});
          }
        });

        // 6. Subscribe to call signaling channel
        const callChannel = supabase.channel(`call:${callId}`, {
          config: { broadcast: { self: false } },
        });

        callChannel
          .on('broadcast', { event: 'call_signal' }, async (payload: { payload: CallSignalPayload }) => {
            const signal = payload.payload;
            if (signal.senderId === currentUserId) return;

            if (signal.type === 'accept') {
              // Peer accepted! Create WebRTC Offer
              try {
                // Add any candidates bundled with accept
                if (signal.candidates && Array.isArray(signal.candidates)) {
                  for (const cand of signal.candidates) {
                    await addCandidateSafely(pc, cand);
                  }
                }

                const offer = await pc.createOffer({
                  offerToReceiveAudio: true,
                  offerToReceiveVideo: type === 'video',
                });
                const modifiedSdp = applyDataSaverSDP(offer.sdp || '', dataSaver);
                const finalOffer = { type: offer.type, sdp: modifiedSdp };

                await pc.setLocalDescription(finalOffer);

                const sendOfferPayload = () => ({
                  callId,
                  senderId: currentUserId,
                  type: 'offer' as const,
                  sdp: finalOffer,
                  callType: type,
                  candidates: [...localCandidatesHistoryRef.current],
                });

                callChannel.send({
                  type: 'broadcast',
                  event: 'call_signal',
                  payload: sendOfferPayload() as CallSignalPayload,
                });

                // Cellular retry: Re-send offer if answer is delayed by high latency mobile network
                if (offerRetryTimerRef.current) clearTimeout(offerRetryTimerRef.current);
                offerRetryTimerRef.current = setTimeout(() => {
                  if (pc.signalingState === 'have-local-offer' && callChannelRef.current) {
                    console.log('[WebRTC] Cellular retry: resending offer with accumulated ICE candidates');
                    callChannelRef.current.send({
                      type: 'broadcast',
                      event: 'call_signal',
                      payload: sendOfferPayload() as CallSignalPayload,
                    }).catch(() => {});
                  }
                }, 1600);
              } catch (offerErr) {
                console.error('[WebRTC] Offer creation error:', offerErr);
              }
            } else if (signal.type === 'answer' && signal.sdp) {
              try {
                if (offerRetryTimerRef.current) {
                  clearTimeout(offerRetryTimerRef.current);
                  offerRetryTimerRef.current = null;
                }

                await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                await drainCandidateQueue(pc);

                // Add any candidates bundled with the answer
                if (signal.candidates && Array.isArray(signal.candidates)) {
                  for (const cand of signal.candidates) {
                    await addCandidateSafely(pc, cand);
                  }
                }

                // Mutual candidates sync to guarantee phone-to-phone NAT connectivity
                callChannel.send({
                  type: 'broadcast',
                  event: 'call_signal',
                  payload: {
                    callId,
                    senderId: currentUserId,
                    type: 'candidates_sync',
                    candidates: [...localCandidatesHistoryRef.current],
                  } as CallSignalPayload,
                }).catch(() => {});
              } catch (ansErr) {
                console.error('[WebRTC] Set remote answer error:', ansErr);
              }
            } else if (signal.type === 'candidates_sync' && signal.candidates) {
              for (const cand of signal.candidates) {
                await addCandidateSafely(pc, cand);
              }
            } else if (signal.type === 'candidate' && signal.candidate) {
              await addCandidateSafely(pc, signal.candidate);
            } else if (signal.type === 'decline') {
              callAudio.stopRinging();
              callAudio.playEndChime();
              cleanUpCallResources();
              setActiveCall((prev) => (prev ? { ...prev, status: 'declined' } : null));
            } else if (signal.type === 'media_state' && signal.mediaState) {
              setRemoteMediaState({
                isMuted: Boolean(signal.mediaState.isMuted),
                isVideoEnabled: signal.mediaState.isVideoEnabled !== false,
              });
            } else if (signal.type === 'end') {
              callAudio.playEndChime();
              cleanUpCallResources();
              setActiveCall((prev) => (prev ? { ...prev, status: 'ended' } : null));
            }
          })
          .subscribe((status: string) => {
            if (status === 'SUBSCRIBED') {
              callChannelRef.current = callChannel;
              isChannelSubscribedRef.current = true;

              // Drain any buffered outgoing ICE candidates immediately
              while (outgoingIceCandidatesQueueRef.current.length > 0) {
                const cand = outgoingIceCandidatesQueueRef.current.shift();
                if (cand && callChannelRef.current) {
                  callChannelRef.current
                    .send({
                      type: 'broadcast',
                      event: 'call_signal',
                      payload: {
                        callId,
                        senderId: currentUserId,
                        type: 'candidate',
                        candidate: cand,
                      } as CallSignalPayload,
                    })
                    .catch(() => {});
                }
              }
            }
          });

        // 7. Auto-timeout after 35 seconds if peer does not answer (Missed Call)
        callTimeoutRef.current = setTimeout(() => {
          if (activeCallRef.current?.status === 'outgoing') {
            callAudio.stopRinging();
            callAudio.playEndChime();
            cleanUpCallResources();
            setActiveCall((prev) => (prev ? { ...prev, status: 'missed' } : null));

            // Record missed call notification across Express, Vercel, and Android APK + dispatch FCM
            createRealNotification({
              recipientId: peer.id,
              actorId: currentUserId,
              type: 'message',
              entityType: 'user',
              entityId: currentUserId,
              body: `Missed ${type === 'video' ? 'video' : 'voice'} call.`,
              url: '/?view=messages',
            }).catch(() => {});
          }
        }, 35000);

        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to start call';
        console.error('[WebRTC] Start call error:', msg);
        callAudio.stopRinging();
        cleanUpCallResources();
        if (msg.includes('Permission') || msg.includes('NotAllowedError')) {
          setPermModalState({
            isOpen: true,
            callType: type,
            isDenied: true,
            pendingAction: 'start',
            peer,
          });
        }
        setActiveCall({
          callId,
          callType: type,
          status: 'failed',
          peer,
          isOutgoing: true,
          durationSeconds: 0,
          isMuted: false,
          isVideoEnabled: false,
          isSpeakerOn: true,
          dataSaver,
          facingMode: 'user',
          errorMessage: msg.includes('Permission')
            ? 'Please grant microphone/camera permissions in your browser.'
            : 'Could not access audio/video hardware.',
        });
        return false;
      }
    },
    [currentUserId, user, acquireMediaStream, setLocalStream, setupPeerConnection, cleanUpCallResources]
  );

  // Start outgoing call with permission pre-check
  const startCall = useCallback(
    async (peer: CallParticipant, type: CallType): Promise<boolean> => {
      if (!currentUserId || !peer.id) return false;

      // 1. Check physical hardware availability
      const devices = await checkDeviceAvailability();
      if (!devices.hasMicrophone) {
        setActiveCall({
          callId: `call_err_${Date.now()}`,
          callType: type,
          status: 'failed',
          peer,
          isOutgoing: true,
          durationSeconds: 0,
          isMuted: false,
          isVideoEnabled: false,
          isSpeakerOn: true,
          dataSaver: false,
          facingMode: 'user',
          errorMessage: 'No microphone detected on your device.',
        });
        return false;
      }

      if (type === 'video' && !devices.hasCamera) {
        setActiveCall({
          callId: `call_err_${Date.now()}`,
          callType: type,
          status: 'failed',
          peer,
          isOutgoing: true,
          durationSeconds: 0,
          isMuted: false,
          isVideoEnabled: false,
          isSpeakerOn: true,
          dataSaver: false,
          facingMode: 'user',
          errorMessage: 'No camera detected on your device for video calls.',
        });
        return false;
      }

      // 2. Query permissions
      const perm = await checkMediaPermission(type);
      if (perm.mic === 'denied' || (type === 'video' && perm.camera === 'denied')) {
        setPermModalState({
          isOpen: true,
          callType: type,
          isDenied: true,
          pendingAction: 'start',
          peer,
        });
        return false;
      }

      if (!perm.canDirectlyCall) {
        setPermModalState({
          isOpen: true,
          callType: type,
          isDenied: false,
          pendingAction: 'start',
          peer,
        });
        return false;
      }

      // Permissions are already granted: proceed directly
      return executeStartCall(peer, type);
    },
    [currentUserId, executeStartCall]
  );

  // Permission Modal Handlers
  const handlePermissionContinue = useCallback(async () => {
    if (!permModalState) return;
    const { callType, pendingAction, peer } = permModalState;

    try {
      const stream = await acquireMediaStream(callType, false, 'user');
      setPermModalState(null);

      if (pendingAction === 'start' && peer) {
        await executeStartCall(peer, callType, stream);
      } else if (pendingAction === 'accept') {
        await executeAcceptCall(stream);
      }
    } catch (err: unknown) {
      console.warn('[WebRTC] getUserMedia failed from permission modal:', err);
      setPermModalState((prev) => (prev ? { ...prev, isDenied: true } : null));
    }
  }, [permModalState, acquireMediaStream, executeStartCall, executeAcceptCall]);

  const handlePermissionRetry = useCallback(async () => {
    if (!permModalState) return;
    const { callType } = permModalState;
    const perm = await checkMediaPermission(callType);
    if (perm.canDirectlyCall) {
      await handlePermissionContinue();
    } else {
      await handlePermissionContinue();
    }
  }, [permModalState, handlePermissionContinue]);

  const handlePermissionCancel = useCallback(() => {
    if (permModalState?.pendingAction === 'start') {
      cleanUpCallResources();
    }
    setPermModalState(null);
  }, [permModalState, cleanUpCallResources]);


  // Toggle Mute
  const toggleMute = useCallback(() => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      const newMuted = !audioTrack.enabled;
      setActiveCall((prev) => (prev ? { ...prev, isMuted: newMuted } : null));

      // Broadcast media state to peer
      if (callChannelRef.current && activeCallRef.current) {
        callChannelRef.current
          .send({
            type: 'broadcast',
            event: 'call_signal',
            payload: {
              callId: activeCallRef.current.callId,
              senderId: currentUserId,
              type: 'media_state',
              mediaState: { isMuted: newMuted },
            } as CallSignalPayload,
          })
          .catch(() => {});
      }
    }
  }, [localStream, currentUserId]);

  // Toggle Camera (Turn camera off / Switch to audio-only)
  const toggleCamera = useCallback(async () => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      const isVideoOn = videoTrack.enabled;
      setActiveCall((prev) => (prev ? { ...prev, isVideoEnabled: isVideoOn } : null));

      // Broadcast to peer
      if (callChannelRef.current && activeCallRef.current) {
        callChannelRef.current
          .send({
            type: 'broadcast',
            event: 'call_signal',
            payload: {
              callId: activeCallRef.current.callId,
              senderId: currentUserId,
              type: 'media_state',
              mediaState: { isVideoEnabled: isVideoOn },
            } as CallSignalPayload,
          })
          .catch(() => {});
      }
    }
  }, [localStream, currentUserId]);

  // Toggle Low-Data Calling Mode (Phase 5)
  const toggleDataSaver = useCallback(() => {
    setActiveCall((prev) => {
      if (!prev) return null;
      const nextSaver = !prev.dataSaver;

      // Apply constraints to video track if running
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack
            .applyConstraints(
              nextSaver
                ? { width: { max: 320 }, height: { max: 240 }, frameRate: { max: 15 } }
                : { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } }
            )
            .catch(() => {});
        }
      }

      return { ...prev, dataSaver: nextSaver };
    });
  }, [localStream]);

  // Flip Camera (Front / Back on mobile devices)
  const flipCamera = useCallback(async () => {
    if (!localStream || !pcRef.current) return;
    const currentFacing = activeCallRef.current?.facingMode || 'user';
    const nextFacing = currentFacing === 'user' ? 'environment' : 'user';

    try {
      const oldVideoTrack = localStream.getVideoTracks()[0];
      if (oldVideoTrack) {
        oldVideoTrack.stop();
        localStream.removeTrack(oldVideoTrack);
      }

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: nextFacing,
          width: activeCallRef.current?.dataSaver ? { max: 320 } : { ideal: 640 },
          height: activeCallRef.current?.dataSaver ? { max: 240 } : { ideal: 480 },
        },
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (newVideoTrack) {
        localStream.addTrack(newVideoTrack);

        // Replace track on RTCPeerConnection sender
        const senders = pcRef.current.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack);
        }

        setActiveCall((prev) => (prev ? { ...prev, facingMode: nextFacing } : null));
      }
    } catch (err) {
      console.warn('[WebRTC] Flip camera error:', err);
    }
  }, [localStream]);

  // Global Listener for incoming call invites on personal channel
  useEffect(() => {
    if (!currentUserId) return;

    const channelName = `user:${currentUserId}:calls`;
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'call_invite' }, (payload: { payload: IncomingCallInvite }) => {
        const invite = payload.payload;
        if (!invite || invite.recipientId !== currentUserId) return;

        // If already in a call, notify busy
        if (activeCallRef.current && activeCallRef.current.status !== 'ended') {
          const busyChan = supabase.channel(`call:${invite.callId}`);
          busyChan.subscribe((status: string) => {
            if (status === 'SUBSCRIBED') {
              busyChan
                .send({
                  type: 'broadcast',
                  event: 'call_signal',
                  payload: {
                    callId: invite.callId,
                    senderId: currentUserId,
                    type: 'decline',
                  } as CallSignalPayload,
                })
                .then(() => supabase.removeChannel(busyChan))
                .catch(() => {});
            }
          });
          return;
        }

        // Play incoming musical ringtone
        callAudio.startIncomingRingtone();
        setIncomingCall(invite);

        // Auto-dismiss after 32 seconds if not answered
        setTimeout(() => {
          setIncomingCall((current) => {
            if (current?.callId === invite.callId) {
              callAudio.stopRinging();
              return null;
            }
            return current;
          });
        }, 32000);
      })
      .on('broadcast', { event: 'call_cancel' }, (payload: any) => {
        const data = payload.payload;
        if (incomingCallRef.current?.callId === data?.callId) {
          callAudio.stopRinging();
          callAudio.playEndChime();
          setIncomingCall(null);
        }
      })
      .on('broadcast', { event: 'call_decline' }, (payload: any) => {
        const data = payload.payload;
        if (activeCallRef.current?.callId === data?.callId) {
          callAudio.stopRinging();
          callAudio.playEndChime();
          cleanUpCallResources();
          setActiveCall((prev) => (prev ? { ...prev, status: 'declined' } : null));
        }
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          userChannelRef.current = channel;
        }
      });

    return () => {
      supabase.removeChannel(channel);
      userChannelRef.current = null;
    };
  }, [currentUserId]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      cleanUpCallResources();
    };
  }, [cleanUpCallResources]);

  return (
    <CallContext.Provider
      value={{
        activeCall,
        incomingCall,
        localStream,
        remoteStream,
        remoteMediaState,
        callQuality,
        startCall,
        acceptCall,
        declineCall,
        endCall,
        toggleMute,
        toggleCamera,
        toggleDataSaver,
        flipCamera,
      }}
    >
      {children}
      {permModalState && (
        <MediaPermissionModal
          isOpen={permModalState.isOpen}
          callType={permModalState.callType}
          isDenied={permModalState.isDenied}
          onCancel={handlePermissionCancel}
          onContinue={handlePermissionContinue}
          onRetry={handlePermissionRetry}
        />
      )}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};
