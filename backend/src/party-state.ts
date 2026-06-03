import { Prisma } from "@prisma/client";
import { PARTICIPANT_ROLE, PARTY_STATUS, QUEUE_ENTRY_STATUS } from "./constants.js";
import { prisma } from "./prisma.js";
import { getEffectivePlaybackPositionMs } from "./utils.js";

const partyStateInclude = {
  participants: {
    orderBy: { joinedAt: "asc" },
  },
  queueEntries: {
    orderBy: { position: "asc" },
    include: {
      addedBy: true,
      votes: true,
    },
  },
} satisfies Prisma.PartyInclude;

type PartyWithState = Prisma.PartyGetPayload<{ include: typeof partyStateInclude }>;

export type PartyStatePayload = Awaited<ReturnType<typeof buildPartyState>>;

function buildLiveFeedback(votes: Array<{ rating: number }>) {
  return {
    totalVotes: votes.length,
    buckets: {
      fire: votes.filter((vote) => vote.rating === 5).length,
      move: votes.filter((vote) => vote.rating === 4).length,
      feel: votes.filter((vote) => vote.rating === 3).length,
      low: votes.filter((vote) => vote.rating <= 2).length,
    },
  };
}

function buildResults(party: PartyWithState) {
  const rankedEntries = party.queueEntries
    .filter((entry) => entry.status !== QUEUE_ENTRY_STATUS.QUEUED)
    .map((entry) => {
      const voteCount = entry.votes.length;
      const averageRating = voteCount > 0 ? entry.votes.reduce((sum, vote) => sum + vote.rating, 0) / voteCount : 0;

      return {
        id: entry.id,
        queueOrdinal: entry.queueOrdinal,
        title: entry.title,
        artistName: entry.artistName,
        thumbnailUrl: entry.thumbnailUrl,
        youtubeVideoId: entry.youtubeVideoId,
        durationSeconds: entry.durationSeconds,
        status: entry.status,
        addedBy: {
          id: entry.addedBy.id,
          displayName: entry.addedBy.displayName,
        },
        averageRating,
        voteCount,
      };
    })
    .sort((left, right) => {
      if (right.averageRating !== left.averageRating) {
        return right.averageRating - left.averageRating;
      }

      if (right.voteCount !== left.voteCount) {
        return right.voteCount - left.voteCount;
      }

      return left.queueOrdinal - right.queueOrdinal;
    });

  return {
    rankedEntries,
    winningEntry: rankedEntries[0] ?? null,
    participantCount: party.participants.length,
  };
}

function buildQueueEntry(entry: PartyWithState["queueEntries"][number]) {
  return {
    id: entry.id,
    position: entry.position,
    queueOrdinal: entry.queueOrdinal,
    status: entry.status,
    youtubeVideoId: entry.youtubeVideoId,
    title: entry.title,
    artistName: entry.artistName,
    thumbnailUrl: entry.thumbnailUrl,
    durationSeconds: entry.durationSeconds,
    addedBy: {
      id: entry.addedBy.id,
      displayName: entry.addedBy.displayName,
    },
    createdAt: entry.createdAt,
  };
}

function buildPublicPreview(party: PartyWithState) {
  const current = party.queueEntries.find((entry) => entry.id === party.currentQueueEntryId) ?? null;
  const nextQueue = party.queueEntries.filter((entry) => entry.status === QUEUE_ENTRY_STATUS.QUEUED).slice(0, 5);
  const previewEntry = current ?? nextQueue[0] ?? null;
  const host = party.participants.find((participant) => participant.role === PARTICIPANT_ROLE.HOST) ?? party.participants[0] ?? null;

  return {
    party: {
      id: party.id,
      joinCode: party.joinCode,
      name: party.name,
      status: party.status,
      maxSongsPerPerson: party.maxSongsPerPerson,
      maxDurationMinutes: party.maxDurationMinutes,
      revealWinnerAtEnd: party.revealWinnerAtEnd,
    },
    hostDisplayName: host?.displayName ?? "Host",
    participantCount: party.participants.length,
    currentTrack: previewEntry
      ? {
          id: previewEntry.id,
          title: previewEntry.title,
          artistName: previewEntry.artistName,
          thumbnailUrl: previewEntry.thumbnailUrl,
          durationSeconds: previewEntry.durationSeconds,
          youtubeVideoId: previewEntry.youtubeVideoId,
          status: previewEntry.status,
        }
      : null,
    queuePreview: nextQueue.map((entry) => ({
      id: entry.id,
      title: entry.title,
      artistName: entry.artistName,
      addedBy: entry.addedBy.displayName,
    })),
  };
}

export async function fetchPartyWithState(partyId: string) {
  return prisma.party.findUnique({
    where: { id: partyId },
    include: partyStateInclude,
  });
}

export async function buildPartyState(partyId: string, viewerParticipantId?: string) {
  const party = await fetchPartyWithState(partyId);
  if (!party) {
    return null;
  }

  const currentQueueEntry = party.queueEntries.find((entry) => entry.id === party.currentQueueEntryId) ?? null;
  const effectivePlaybackPositionMs = getEffectivePlaybackPositionMs(party);
  const myVote = currentQueueEntry?.votes.find((vote) => vote.participantId === viewerParticipantId) ?? null;

  return {
    party: {
      id: party.id,
      joinCode: party.joinCode,
      name: party.name,
      status: party.status,
      maxSongsPerPerson: party.maxSongsPerPerson,
      maxDurationMinutes: party.maxDurationMinutes,
      votingMode: party.votingMode,
      revealWinnerAtEnd: party.revealWinnerAtEnd,
      createdAt: party.createdAt,
      endedAt: party.endedAt,
    },
    participants: party.participants.map((participant) => ({
      id: participant.id,
      displayName: participant.displayName,
      role: participant.role,
      isConnected: participant.isConnected,
      joinedAt: participant.joinedAt,
      lastSeenAt: participant.lastSeenAt,
    })),
    queue: party.queueEntries.map(buildQueueEntry),
    currentQueueEntry: currentQueueEntry
      ? {
          ...buildQueueEntry(currentQueueEntry),
          liveFeedback: buildLiveFeedback(currentQueueEntry.votes),
        }
      : null,
    playback: {
      status: party.playbackStatus,
      positionMs: effectivePlaybackPositionMs,
      videoId: party.playbackVideoId,
      queueEntryId: party.currentQueueEntryId,
      startedAt: party.playbackStartedAt,
    },
    myVote: myVote ? myVote.rating : null,
    results:
      party.status === PARTY_STATUS.REVEALING || party.status === PARTY_STATUS.ENDED
        ? buildResults(party)
        : null,
  };
}

export async function buildPartyPreview(joinCode: string) {
  const party = await prisma.party.findUnique({
    where: { joinCode },
    include: partyStateInclude,
  });

  if (!party) {
    return null;
  }

  return buildPublicPreview(party);
}
