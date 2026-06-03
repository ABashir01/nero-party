export const PARTY_STATUS = {
  LOBBY: "LOBBY",
  LIVE: "LIVE",
  REVEALING: "REVEALING",
  ENDED: "ENDED",
} as const;

export const PLAYBACK_STATUS = {
  IDLE: "IDLE",
  PLAYING: "PLAYING",
  PAUSED: "PAUSED",
} as const;

export const PARTICIPANT_ROLE = {
  HOST: "HOST",
  GUEST: "GUEST",
} as const;

export const QUEUE_ENTRY_STATUS = {
  QUEUED: "QUEUED",
  PLAYING: "PLAYING",
  PLAYED: "PLAYED",
  SKIPPED: "SKIPPED",
} as const;

export const VOTING_MODE = {
  SECRET_RATING: "SECRET_RATING",
} as const;
