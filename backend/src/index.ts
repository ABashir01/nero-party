import cors from "cors";
import express, { type Request } from "express";
import { createServer } from "http";
import { Prisma } from "@prisma/client";
import { Server } from "socket.io";
import {
  PARTICIPANT_ROLE,
  PARTY_STATUS,
  PLAYBACK_STATUS,
  QUEUE_ENTRY_STATUS,
} from "./constants.js";
import { buildPartyPreview, buildPartyState } from "./party-state.js";
import { env } from "./env.js";
import { prisma } from "./prisma.js";
import {
  clamp,
  coercePositiveInt,
  createJoinCode,
  createSessionToken,
  getEffectivePlaybackPositionMs,
  getPlaybackStartedAt,
} from "./utils.js";
import { searchYoutube } from "./youtube.js";

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: env.FRONTEND_ORIGIN,
    methods: ["GET", "POST"],
  },
});

app.use(
  cors({
    origin: env.FRONTEND_ORIGIN,
  }),
);
app.use(express.json());

function partyRoomId(partyId: string) {
  return `party:${partyId}`;
}

function readSessionToken(request: Request) {
  const headerValue = request.header("x-session-token");
  return typeof headerValue === "string" && headerValue.length > 0 ? headerValue : null;
}

async function requireParticipantByToken(sessionToken: string) {
  return prisma.participant.findUnique({
    where: { sessionToken },
    include: {
      party: true,
    },
  });
}

async function requirePartyParticipant(partyId: string, sessionToken: string) {
  const participant = await requireParticipantByToken(sessionToken);
  if (!participant || participant.partyId !== partyId) {
    return null;
  }

  return participant;
}

async function requireHostParticipant(partyId: string, sessionToken: string) {
  const participant = await requirePartyParticipant(partyId, sessionToken);
  if (!participant || participant.role !== PARTICIPANT_ROLE.HOST) {
    return null;
  }

  return participant;
}

async function issueUniqueJoinCode() {
  while (true) {
    const joinCode = createJoinCode();
    const existing = await prisma.party.findUnique({ where: { joinCode } });
    if (!existing) {
      return joinCode;
    }
  }
}

async function broadcastPartyState(partyId: string) {
  const sockets = await io.in(partyRoomId(partyId)).fetchSockets();
  const stateByParticipant = new Map<string, Awaited<ReturnType<typeof buildPartyState>>>();

  await Promise.all(
    sockets.map(async (socket) => {
      const participantId =
        typeof socket.data.participantId === "string" ? (socket.data.participantId as string) : "";
      const cacheKey = participantId || "__anonymous__";

      if (!stateByParticipant.has(cacheKey)) {
        stateByParticipant.set(cacheKey, await buildPartyState(partyId, participantId || undefined));
      }

      const state = stateByParticipant.get(cacheKey);
      if (state) {
        socket.emit("party:state", state);
      }
    }),
  );
}

async function emitPresence(partyId: string) {
  const participants = await prisma.participant.findMany({
    where: { partyId },
    orderBy: { joinedAt: "asc" },
    select: {
      id: true,
      displayName: true,
      role: true,
      isConnected: true,
      joinedAt: true,
      lastSeenAt: true,
    },
  });

  io.to(partyRoomId(partyId)).emit("party:presence", participants);
  return participants;
}

function validateRating(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    return null;
  }

  return parsed;
}

async function getQueueStats(partyId: string) {
  const aggregate = await prisma.queueEntry.aggregate({
    where: { partyId },
    _max: {
      position: true,
      queueOrdinal: true,
    },
  });

  return {
    nextPosition: (aggregate._max.position ?? 0) + 1,
    nextOrdinal: (aggregate._max.queueOrdinal ?? 0) + 1,
  };
}

async function getQueuedCountForParticipant(partyId: string, participantId: string) {
  return prisma.queueEntry.count({
    where: {
      partyId,
      addedByParticipantId: participantId,
      status: {
        in: [QUEUE_ENTRY_STATUS.QUEUED, QUEUE_ENTRY_STATUS.PLAYING],
      },
    },
  });
}

async function startNextQueueEntry(partyId: string) {
  const nextEntry = await prisma.queueEntry.findFirst({
    where: {
      partyId,
      status: QUEUE_ENTRY_STATUS.QUEUED,
    },
    orderBy: { position: "asc" },
  });

  if (!nextEntry) {
    return prisma.party.update({
      where: { id: partyId },
      data: {
        currentQueueEntryId: null,
        playbackStatus: PLAYBACK_STATUS.IDLE,
        playbackPositionMs: 0,
        playbackVideoId: null,
        playbackStartedAt: null,
      },
    });
  }

  await prisma.queueEntry.update({
    where: { id: nextEntry.id },
    data: {
      status: QUEUE_ENTRY_STATUS.PLAYING,
      playedAt: new Date(),
    },
  });

  return prisma.party.update({
    where: { id: partyId },
    data: {
      status: PARTY_STATUS.LIVE,
      currentQueueEntryId: nextEntry.id,
      playbackStatus: PLAYBACK_STATUS.PLAYING,
      playbackPositionMs: 0,
      playbackVideoId: nextEntry.youtubeVideoId,
      playbackStartedAt: new Date(),
    },
  });
}

async function finalizeCurrentEntry(
  partyId: string,
  status: (typeof QUEUE_ENTRY_STATUS.PLAYED) | (typeof QUEUE_ENTRY_STATUS.SKIPPED),
) {
  const party = await prisma.party.findUnique({
    where: { id: partyId },
  });

  if (!party?.currentQueueEntryId) {
    return null;
  }

  await prisma.queueEntry.update({
    where: { id: party.currentQueueEntryId },
    data: {
      status,
      finishedAt: new Date(),
    },
  });

  return party.currentQueueEntryId;
}

function readNextResolution(value: unknown) {
  if (value === QUEUE_ENTRY_STATUS.PLAYED || value === QUEUE_ENTRY_STATUS.SKIPPED) {
    return value;
  }

  return QUEUE_ENTRY_STATUS.SKIPPED;
}

function hasReachedPartyDurationLimit(party: { createdAt: Date; maxDurationMinutes: number | null }) {
  if (!party.maxDurationMinutes) {
    return false;
  }

  const elapsedMs = Date.now() - new Date(party.createdAt).getTime();
  return elapsedMs >= party.maxDurationMinutes * 60_000;
}

async function revealParty(
  partyId: string,
  status: string = PARTY_STATUS.REVEALING,
) {
  await prisma.party.update({
    where: { id: partyId },
    data: {
      status,
      playbackStatus: PLAYBACK_STATUS.IDLE,
      playbackPositionMs: 0,
      playbackVideoId: null,
      playbackStartedAt: null,
      currentQueueEntryId: null,
      endedAt: new Date(),
    },
  });
}

function serializePrismaError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected server error.";
}

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.post("/api/parties", async (request, response) => {
  try {
    const partyName = typeof request.body.partyName === "string" ? request.body.partyName.trim() : "";
    const hostDisplayName =
      typeof request.body.hostDisplayName === "string" ? request.body.hostDisplayName.trim() : "";

    if (!partyName || !hostDisplayName) {
      response.status(400).json({ error: "partyName and hostDisplayName are required." });
      return;
    }

    const joinCode = await issueUniqueJoinCode();
    const sessionToken = createSessionToken();
    const maxSongsPerPerson = coercePositiveInt(request.body.maxSongsPerPerson);
    const maxDurationMinutes = coercePositiveInt(request.body.maxDurationMinutes);

    const result = await prisma.$transaction(async (transaction) => {
      const party = await transaction.party.create({
        data: {
          joinCode,
          name: partyName,
          maxSongsPerPerson,
          maxDurationMinutes,
        },
      });

      const participant = await transaction.participant.create({
        data: {
          partyId: party.id,
          displayName: hostDisplayName,
          role: PARTICIPANT_ROLE.HOST,
          sessionToken,
          isConnected: true,
        },
      });

      const updatedParty = await transaction.party.update({
        where: { id: party.id },
        data: {
          hostParticipantId: participant.id,
        },
      });

      return { party: updatedParty, participant };
    });

    const state = await buildPartyState(result.party.id, result.participant.id);
    response.status(201).json({
      party: state?.party ?? result.party,
      participant: {
        id: result.participant.id,
        displayName: result.participant.displayName,
        role: result.participant.role,
      },
      sessionToken,
      state,
    });
  } catch (error) {
    response.status(500).json({ error: serializePrismaError(error) });
  }
});

app.post("/api/parties/join", async (request, response) => {
  try {
    const joinCode = typeof request.body.joinCode === "string" ? request.body.joinCode.trim().toUpperCase() : "";
    const displayName = typeof request.body.displayName === "string" ? request.body.displayName.trim() : "";

    if (!joinCode || !displayName) {
      response.status(400).json({ error: "joinCode and displayName are required." });
      return;
    }

    const party = await prisma.party.findUnique({
      where: { joinCode },
    });

    if (!party) {
      response.status(404).json({ error: "Party not found." });
      return;
    }

    if (party.status === PARTY_STATUS.REVEALING || party.status === PARTY_STATUS.ENDED) {
      response.status(409).json({ error: "This party is no longer accepting new participants." });
      return;
    }

    const sessionToken = createSessionToken();
    const participant = await prisma.participant.create({
      data: {
        partyId: party.id,
        displayName,
        role: PARTICIPANT_ROLE.GUEST,
        sessionToken,
        isConnected: true,
      },
    });

    const state = await buildPartyState(party.id, participant.id);
    await emitPresence(party.id);
    await broadcastPartyState(party.id);

    response.status(201).json({
      party: state?.party ?? party,
      participant: {
        id: participant.id,
        displayName: participant.displayName,
        role: participant.role,
      },
      sessionToken,
      state,
    });
  } catch (error) {
    response.status(500).json({ error: serializePrismaError(error) });
  }
});

app.get("/api/parties/:joinCode/preview", async (request, response) => {
  try {
    const preview = await buildPartyPreview(request.params.joinCode.toUpperCase());
    if (!preview) {
      response.status(404).json({ error: "Party not found." });
      return;
    }

    response.json(preview);
  } catch (error) {
    response.status(500).json({ error: serializePrismaError(error) });
  }
});

app.get("/api/parties/:joinCode/state", async (request, response) => {
  try {
    const sessionToken = readSessionToken(request);
    if (!sessionToken) {
      response.status(401).json({ error: "Missing session token." });
      return;
    }

    const party = await prisma.party.findUnique({
      where: { joinCode: request.params.joinCode.toUpperCase() },
    });

    if (!party) {
      response.status(404).json({ error: "Party not found." });
      return;
    }

    const participant = await requirePartyParticipant(party.id, sessionToken);
    if (!participant) {
      response.status(403).json({ error: "Invalid session token for this party." });
      return;
    }

    await prisma.participant.update({
      where: { id: participant.id },
      data: {
        isConnected: true,
        lastSeenAt: new Date(),
      },
    });

    const state = await buildPartyState(party.id, participant.id);
    response.json({
      participant: {
        id: participant.id,
        displayName: participant.displayName,
        role: participant.role,
      },
      sessionToken,
      state,
    });
  } catch (error) {
    response.status(500).json({ error: serializePrismaError(error) });
  }
});

app.get("/api/search/youtube", async (request, response) => {
  try {
    const query = typeof request.query.q === "string" ? request.query.q.trim() : "";
    if (!query) {
      response.status(400).json({ error: "Query parameter q is required." });
      return;
    }

    const results = await searchYoutube(query);
    response.json({ results });
  } catch (error) {
    response.status(500).json({ error: serializePrismaError(error) });
  }
});

app.post("/api/parties/:partyId/queue", async (request, response) => {
  try {
    const sessionToken = readSessionToken(request);
    if (!sessionToken) {
      response.status(401).json({ error: "Missing session token." });
      return;
    }

    const participant = await requirePartyParticipant(request.params.partyId, sessionToken);
    if (!participant) {
      response.status(403).json({ error: "Not allowed to mutate this party." });
      return;
    }

    const party = participant.party;
    if (party.status === PARTY_STATUS.REVEALING || party.status === PARTY_STATUS.ENDED) {
      response.status(409).json({ error: "Cannot add songs after the party has ended." });
      return;
    }

    if (party.maxSongsPerPerson) {
      const queuedCount = await getQueuedCountForParticipant(party.id, participant.id);
      if (queuedCount >= party.maxSongsPerPerson) {
        response.status(409).json({ error: "You have reached the room song limit." });
        return;
      }
    }

    const youtubeVideoId =
      typeof request.body.youtubeVideoId === "string" ? request.body.youtubeVideoId.trim() : "";
    const title = typeof request.body.title === "string" ? request.body.title.trim() : "";
    const artistName = typeof request.body.artistName === "string" ? request.body.artistName.trim() : "";
    const thumbnailUrl =
      typeof request.body.thumbnailUrl === "string" ? request.body.thumbnailUrl.trim() : "";
    const durationSeconds = coercePositiveInt(request.body.durationSeconds);

    if (!youtubeVideoId || !title || !artistName || !thumbnailUrl || !durationSeconds) {
      response.status(400).json({ error: "Song metadata is incomplete." });
      return;
    }

    const { nextPosition, nextOrdinal } = await getQueueStats(party.id);
    const wasIdle = !party.currentQueueEntryId;
    const queueEntry = await prisma.queueEntry.create({
      data: {
        partyId: party.id,
        addedByParticipantId: participant.id,
        position: nextPosition,
        queueOrdinal: nextOrdinal,
        youtubeVideoId,
        title,
        artistName,
        thumbnailUrl,
        durationSeconds,
      },
    });

    if (!party.currentQueueEntryId) {
      await startNextQueueEntry(party.id);
    }

    const state = await buildPartyState(party.id, participant.id);
    if (state) {
      await broadcastPartyState(party.id);
      if (wasIdle) {
        io.to(partyRoomId(party.id)).emit("playback:updated", state.playback);
      }
      io.to(partyRoomId(party.id)).emit("queue:updated", {
        queue: state.queue,
        currentQueueEntry: state.currentQueueEntry,
      });
    }

    response.status(201).json({ queueEntry, state });
  } catch (error) {
    response.status(500).json({ error: serializePrismaError(error) });
  }
});

app.post("/api/queue/:queueEntryId/vote", async (request, response) => {
  try {
    const sessionToken = readSessionToken(request);
    if (!sessionToken) {
      response.status(401).json({ error: "Missing session token." });
      return;
    }

    const queueEntry = await prisma.queueEntry.findUnique({
      where: { id: request.params.queueEntryId },
      include: {
        party: true,
      },
    });

    if (!queueEntry) {
      response.status(404).json({ error: "Queue entry not found." });
      return;
    }

    const participant = await requirePartyParticipant(queueEntry.partyId, sessionToken);
    if (!participant) {
      response.status(403).json({ error: "Not allowed to vote in this party." });
      return;
    }

    if (queueEntry.status !== QUEUE_ENTRY_STATUS.PLAYING) {
      response.status(409).json({ error: "Votes are only accepted while a song is playing." });
      return;
    }

    const rating = validateRating(request.body.rating);
    if (!rating) {
      response.status(400).json({ error: "rating must be an integer between 1 and 5." });
      return;
    }

    await prisma.vote.upsert({
      where: {
        queueEntryId_participantId: {
          queueEntryId: queueEntry.id,
          participantId: participant.id,
        },
      },
      update: {
        rating,
        submittedAt: new Date(),
      },
      create: {
        partyId: queueEntry.partyId,
        queueEntryId: queueEntry.id,
        participantId: participant.id,
        rating,
      },
    });

    const state = await buildPartyState(queueEntry.partyId, participant.id);
    if (state?.currentQueueEntry) {
      await broadcastPartyState(queueEntry.partyId);
      io.to(partyRoomId(queueEntry.partyId)).emit("vote:updated", {
        queueEntryId: queueEntry.id,
        liveFeedback: state.currentQueueEntry.liveFeedback,
      });
    }

    response.json({ myVote: rating, state });
  } catch (error) {
    response.status(500).json({ error: serializePrismaError(error) });
  }
});

app.post("/api/parties/:partyId/playback/play", async (request, response) => {
  try {
    const sessionToken = readSessionToken(request);
    if (!sessionToken) {
      response.status(401).json({ error: "Missing session token." });
      return;
    }

    const host = await requireHostParticipant(request.params.partyId, sessionToken);
    if (!host) {
      response.status(403).json({ error: "Only the host can control playback." });
      return;
    }

    const positionMs = clamp(Number(request.body.positionMs ?? 0), 0, Number.MAX_SAFE_INTEGER);
    const party = host.party;

    if (!party.currentQueueEntryId) {
      await startNextQueueEntry(party.id);
    } else {
      await prisma.party.update({
        where: { id: party.id },
        data: {
          status: PARTY_STATUS.LIVE,
          playbackStatus: PLAYBACK_STATUS.PLAYING,
          playbackPositionMs: positionMs,
          playbackStartedAt: getPlaybackStartedAt(positionMs),
        },
      });
    }

    const state = await buildPartyState(party.id, host.id);
    if (state) {
      await broadcastPartyState(party.id);
      io.to(partyRoomId(party.id)).emit("playback:updated", state.playback);
    }

    response.json({ state });
  } catch (error) {
    response.status(500).json({ error: serializePrismaError(error) });
  }
});

app.post("/api/parties/:partyId/playback/pause", async (request, response) => {
  try {
    const sessionToken = readSessionToken(request);
    if (!sessionToken) {
      response.status(401).json({ error: "Missing session token." });
      return;
    }

    const host = await requireHostParticipant(request.params.partyId, sessionToken);
    if (!host) {
      response.status(403).json({ error: "Only the host can control playback." });
      return;
    }

    const currentPositionMs =
      Number(request.body.positionMs) ||
      getEffectivePlaybackPositionMs({
        playbackPositionMs: host.party.playbackPositionMs,
        playbackStartedAt: host.party.playbackStartedAt,
        playbackStatus: host.party.playbackStatus,
      });

    await prisma.party.update({
      where: { id: host.party.id },
      data: {
        playbackStatus: PLAYBACK_STATUS.PAUSED,
        playbackPositionMs: clamp(currentPositionMs, 0, Number.MAX_SAFE_INTEGER),
        playbackStartedAt: null,
      },
    });

    const state = await buildPartyState(host.party.id, host.id);
    if (state) {
      await broadcastPartyState(host.party.id);
      io.to(partyRoomId(host.party.id)).emit("playback:updated", state.playback);
    }

    response.json({ state });
  } catch (error) {
    response.status(500).json({ error: serializePrismaError(error) });
  }
});

app.post("/api/parties/:partyId/playback/seek", async (request, response) => {
  try {
    const sessionToken = readSessionToken(request);
    if (!sessionToken) {
      response.status(401).json({ error: "Missing session token." });
      return;
    }

    const host = await requireHostParticipant(request.params.partyId, sessionToken);
    if (!host) {
      response.status(403).json({ error: "Only the host can control playback." });
      return;
    }

    const positionMs = clamp(Number(request.body.positionMs ?? 0), 0, Number.MAX_SAFE_INTEGER);
    await prisma.party.update({
      where: { id: host.party.id },
      data: {
        playbackPositionMs: positionMs,
        playbackStartedAt:
          host.party.playbackStatus === PLAYBACK_STATUS.PLAYING ? getPlaybackStartedAt(positionMs) : null,
      },
    });

    const state = await buildPartyState(host.party.id, host.id);
    if (state) {
      await broadcastPartyState(host.party.id);
      io.to(partyRoomId(host.party.id)).emit("playback:updated", state.playback);
    }

    response.json({ state });
  } catch (error) {
    response.status(500).json({ error: serializePrismaError(error) });
  }
});

app.post("/api/parties/:partyId/playback/next", async (request, response) => {
  try {
    const sessionToken = readSessionToken(request);
    if (!sessionToken) {
      response.status(401).json({ error: "Missing session token." });
      return;
    }

    const host = await requireHostParticipant(request.params.partyId, sessionToken);
    if (!host) {
      response.status(403).json({ error: "Only the host can control playback." });
      return;
    }

    const resolution = readNextResolution(request.body?.resolution);
    await finalizeCurrentEntry(host.party.id, resolution);

    if (hasReachedPartyDurationLimit(host.party)) {
      await revealParty(host.party.id);
    } else {
      await startNextQueueEntry(host.party.id);
    }

    const state = await buildPartyState(host.party.id, host.id);
    if (state) {
      await broadcastPartyState(host.party.id);
      io.to(partyRoomId(host.party.id)).emit("playback:updated", state.playback);
      io.to(partyRoomId(host.party.id)).emit("queue:updated", {
        queue: state.queue,
        currentQueueEntry: state.currentQueueEntry,
      });

      if (state.party.status === PARTY_STATUS.REVEALING || state.party.status === PARTY_STATUS.ENDED) {
        io.to(partyRoomId(host.party.id)).emit("party:phase-changed", {
          status: state.party.status,
          results: state.results,
        });
      }
    }

    response.json({ state });
  } catch (error) {
    response.status(500).json({ error: serializePrismaError(error) });
  }
});

app.post("/api/parties/:partyId/end", async (request, response) => {
  try {
    const sessionToken = readSessionToken(request);
    if (!sessionToken) {
      response.status(401).json({ error: "Missing session token." });
      return;
    }

    const host = await requireHostParticipant(request.params.partyId, sessionToken);
    if (!host) {
      response.status(403).json({ error: "Only the host can end the party." });
      return;
    }

    await finalizeCurrentEntry(host.party.id, QUEUE_ENTRY_STATUS.SKIPPED);
    await revealParty(host.party.id);

    const state = await buildPartyState(host.party.id, host.id);
    if (state) {
      await broadcastPartyState(host.party.id);
      io.to(partyRoomId(host.party.id)).emit("party:phase-changed", {
        status: PARTY_STATUS.REVEALING,
        results: state.results,
      });
    }

    response.json({ state });
  } catch (error) {
    response.status(500).json({ error: serializePrismaError(error) });
  }
});

io.on("connection", (socket) => {
  socket.on(
    "party:join-room",
    async (payload: { joinCode?: string; sessionToken?: string }, callback?: (result: { ok: boolean; error?: string }) => void) => {
      try {
        if (!payload.joinCode || !payload.sessionToken) {
          callback?.({ ok: false, error: "joinCode and sessionToken are required." });
          return;
        }

        const party = await prisma.party.findUnique({
          where: { joinCode: payload.joinCode.toUpperCase() },
        });

        if (!party) {
          callback?.({ ok: false, error: "Party not found." });
          return;
        }

        const participant = await requirePartyParticipant(party.id, payload.sessionToken);
        if (!participant) {
          callback?.({ ok: false, error: "Invalid session token." });
          return;
        }

        socket.data.partyId = party.id;
        socket.data.participantId = participant.id;
        socket.join(partyRoomId(party.id));

        await prisma.participant.update({
          where: { id: participant.id },
          data: {
            isConnected: true,
            lastSeenAt: new Date(),
          },
        });

        await emitPresence(party.id);
        const state = await buildPartyState(party.id, participant.id);
        if (state) {
          socket.emit("party:state", state);
        }

        callback?.({ ok: true });
      } catch (error) {
        callback?.({ ok: false, error: serializePrismaError(error) });
      }
    },
  );

  socket.on("party:presence", async () => {
    const participantId = socket.data.participantId as string | undefined;
    const partyId = socket.data.partyId as string | undefined;

    if (!participantId || !partyId) {
      return;
    }

    await prisma.participant.update({
      where: { id: participantId },
      data: {
        isConnected: true,
        lastSeenAt: new Date(),
      },
    });

    await emitPresence(partyId);
  });

  socket.on("disconnect", async () => {
    const participantId = socket.data.participantId as string | undefined;
    const partyId = socket.data.partyId as string | undefined;

    if (!participantId || !partyId) {
      return;
    }

    await prisma.participant.update({
      where: { id: participantId },
      data: {
        isConnected: false,
        lastSeenAt: new Date(),
      },
    });

    await emitPresence(partyId);
  });
});

server.listen(env.PORT, () => {
  console.log(`Server running on http://localhost:${env.PORT}`);
});
