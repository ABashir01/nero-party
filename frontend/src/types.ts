export type ParticipantRole = "HOST" | "GUEST";
export type PartyStatus = "LOBBY" | "LIVE" | "REVEALING" | "ENDED";
export type PlaybackStatus = "IDLE" | "PLAYING" | "PAUSED";
export type QueueEntryStatus = "QUEUED" | "PLAYING" | "PLAYED" | "SKIPPED";

export type PartySummary = {
  id: string;
  joinCode: string;
  name: string;
  status: PartyStatus;
  maxSongsPerPerson: number | null;
  maxDurationMinutes: number | null;
  votingMode: "SECRET_RATING";
  revealWinnerAtEnd: boolean;
  createdAt: string;
  endedAt: string | null;
};

export type PartyParticipant = {
  id: string;
  displayName: string;
  role: ParticipantRole;
  isConnected: boolean;
  joinedAt: string;
  lastSeenAt: string;
};

export type QueueEntry = {
  id: string;
  position: number;
  queueOrdinal: number;
  status: QueueEntryStatus;
  youtubeVideoId: string;
  title: string;
  artistName: string;
  thumbnailUrl: string;
  durationSeconds: number;
  addedBy: {
    id: string;
    displayName: string;
  };
  createdAt: string;
};

export type CurrentQueueEntry = QueueEntry & {
  liveFeedback: {
    totalVotes: number;
    buckets: {
      fire: number;
      move: number;
      feel: number;
      low: number;
    };
  };
};

export type PlaybackState = {
  status: PlaybackStatus;
  positionMs: number;
  videoId: string | null;
  queueEntryId: string | null;
  startedAt: string | null;
};

export type PartyResults = {
  rankedEntries: Array<{
    id: string;
    queueOrdinal: number;
    title: string;
    artistName: string;
    thumbnailUrl: string;
    youtubeVideoId: string;
    durationSeconds: number;
    status: QueueEntryStatus;
    addedBy: {
      id: string;
      displayName: string;
    };
    averageRating: number;
    voteCount: number;
  }>;
  winningEntry: {
    id: string;
    queueOrdinal: number;
    title: string;
    artistName: string;
    thumbnailUrl: string;
    youtubeVideoId: string;
    durationSeconds: number;
    status: QueueEntryStatus;
    addedBy: {
      id: string;
      displayName: string;
    };
    averageRating: number;
    voteCount: number;
  } | null;
  participantCount: number;
};

export type PartyState = {
  party: PartySummary;
  participants: PartyParticipant[];
  queue: QueueEntry[];
  currentQueueEntry: CurrentQueueEntry | null;
  playback: PlaybackState;
  myVote: number | null;
  results: PartyResults | null;
};

export type PartyStateResponse = {
  participant: {
    id: string;
    displayName: string;
    role: ParticipantRole;
  };
  sessionToken: string;
  state: PartyState;
};

export type PartyPreview = {
  party: {
    id: string;
    joinCode: string;
    name: string;
    status: PartyStatus;
    maxSongsPerPerson: number | null;
    maxDurationMinutes: number | null;
    revealWinnerAtEnd: boolean;
  };
  hostDisplayName: string;
  participantCount: number;
  currentTrack: {
    id: string;
    title: string;
    artistName: string;
    thumbnailUrl: string;
    durationSeconds: number;
    youtubeVideoId: string;
    status: QueueEntryStatus;
  } | null;
  queuePreview: Array<{
    id: string;
    title: string;
    artistName: string;
    addedBy: string;
  }>;
};

export type YouTubeSearchResult = {
  youtubeVideoId: string;
  title: string;
  artistName: string;
  thumbnailUrl: string;
  durationSeconds: number;
};
