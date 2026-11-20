/**
 * ABSU Connect — WebRTC Call Types & Signaling Protocol
 */

export type CallType = 'audio' | 'video';

export type CallStatus =
  | 'idle'
  | 'outgoing' // Calling peer, waiting for ring
  | 'incoming' // Ringing for user
  | 'connecting' // SDP / ICE negotiation in progress
  | 'connected' // Call active with media flowing
  | 'ended' // Call finished cleanly
  | 'declined' // Call was rejected
  | 'missed' // Timed out without answer
  | 'busy' // Peer is on another call
  | 'failed'; // ICE or media failure

export interface CallParticipant {
  id: string;
  name: string;
  avatar?: string;
  department?: string;
}

export interface ActiveCall {
  callId: string;
  callType: CallType;
  status: CallStatus;
  peer: CallParticipant;
  isOutgoing: boolean;
  startedAt?: number;
  durationSeconds: number;
  isMuted: boolean;
  isVideoEnabled: boolean;
  isSpeakerOn: boolean;
  dataSaver: boolean;
  facingMode: 'user' | 'environment';
  errorMessage?: string;
}

export interface IncomingCallInvite {
  callId: string;
  callType: CallType;
  caller: CallParticipant;
  recipientId: string;
  createdAt: number;
  dataSaver?: boolean;
}

export interface CallSignalPayload {
  callId: string;
  senderId: string;
  type: 'offer' | 'answer' | 'candidate' | 'candidates_sync' | 'ringing' | 'accept' | 'decline' | 'end' | 'media_state';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  candidates?: RTCIceCandidateInit[];
  callType?: CallType;
  dataSaver?: boolean;
  mediaState?: {
    isMuted?: boolean;
    isVideoEnabled?: boolean;
  };
}
