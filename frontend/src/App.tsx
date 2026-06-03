import { useEffect, useMemo, useRef, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { api } from "./lib/api";
import { createPartySocket } from "./lib/socket";
import { clearStoredSessionToken, getStoredSessionToken, storeSessionToken } from "./lib/session";
import { loadYouTubeIframeApi } from "./lib/youtube";
import type {
  PartyParticipant,
  PartyPreview,
  PartyState,
  QueueEntryStatus,
  YouTubeSearchResult,
} from "./types";

type ConnectionStatus = "connecting" | "live" | "offline";

const DEFAULT_PARTY_NAME = "Friday Night Aux Battle";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CreatePartyPage />} />
        <Route path="/join/:joinCode" element={<JoinPartyPage />} />
        <Route path="/party/:joinCode" element={<PartyRoomPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function CreatePartyPage() {
  const navigate = useNavigate();
  const [partyName, setPartyName] = useState(DEFAULT_PARTY_NAME);
  const [hostDisplayName, setHostDisplayName] = useState("Maya");
  const [maxSongsPerPerson, setMaxSongsPerPerson] = useState(2);
  const [maxDurationMinutes, setMaxDurationMinutes] = useState(90);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleCreateParty = async () => {
    try {
      setIsSubmitting(true);
      setError("");
      const response = await api.createParty({
        partyName,
        hostDisplayName,
        maxSongsPerPerson,
        maxDurationMinutes,
      });

      storeSessionToken(response.state.party.joinCode, response.sessionToken);
      navigate(`/party/${response.state.party.joinCode}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to create the room.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageShell>
      <header className="entry-topbar">
        <BrandLockup />
      </header>

      <section className="entry-grid entry-grid-create">
        <div className="entry-column entry-copy">
          <div className="entry-headline-wrap">
            <p className="eyebrow">Nero Party</p>
            <h1 className="display-title">Start a listening party.</h1>
            <p className="entry-lead">
              Create a room, invite your people, and build the playlist together in real time.
            </p>
          </div>

          <div className="value-list">
            <ValueRow title="Real-time listening" text="Everyone hears every song together, in perfect sync." />
            <ValueRow title="Shared queue" text="Add tracks, vote, and move the vibe as a group." />
            <ValueRow title="React together" text="Drop reactions and feel the moment together." />
            <ValueRow title="Winner reveal" text="The top track is revealed when the party ends." />
          </div>
        </div>

        <div className="entry-column">
          <div className="panel entry-form-panel">
            <h2 className="panel-title">Create a room</h2>

            <label className="field-label">
              Party name
              <input className="input-field" value={partyName} onChange={(event) => setPartyName(event.target.value)} maxLength={60} />
            </label>

            <label className="field-label">
              Your name
              <input
                className="input-field"
                value={hostDisplayName}
                onChange={(event) => setHostDisplayName(event.target.value)}
                maxLength={24}
              />
            </label>

            <SegmentField
              label="Max songs per person"
              helper="How many songs each person can add"
              options={[
                { label: "1", value: 1 },
                { label: "2", value: 2 },
                { label: "3", value: 3 },
                { label: "4", value: 4 },
                { label: "5", value: 5 },
              ]}
              value={maxSongsPerPerson}
              onChange={setMaxSongsPerPerson}
            />

            <SegmentField
              label="Time cap"
              helper="How long the party will run"
              options={[
                { label: "30m", value: 30 },
                { label: "1h", value: 60 },
                { label: "1h 30m", value: 90 },
                { label: "2h", value: 120 },
                { label: "3h", value: 180 },
              ]}
              value={maxDurationMinutes}
              onChange={setMaxDurationMinutes}
            />

            {error ? <p className="form-error">{error}</p> : null}

            <button className="primary-button" disabled={isSubmitting} onClick={handleCreateParty} type="button">
              {isSubmitting ? "Creating room..." : "Create room"}
            </button>
          </div>
        </div>
      </section>

    </PageShell>
  );
}

function JoinPartyPage() {
  const navigate = useNavigate();
  const { joinCode = "" } = useParams();
  const [preview, setPreview] = useState<PartyPreview | null>(null);
  const [displayName, setDisplayName] = useState("Devon");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      try {
        setIsLoading(true);
        const response = await api.getPartyPreview(joinCode.toUpperCase());
        if (!cancelled) {
          setPreview(response);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Failed to load room preview.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [joinCode]);

  const handleJoin = async () => {
    try {
      setIsSubmitting(true);
      setError("");
      const response = await api.joinParty({ joinCode: joinCode.toUpperCase(), displayName });
      storeSessionToken(response.state.party.joinCode, response.sessionToken);
      navigate(`/party/${response.state.party.joinCode}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to join room.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageShell>
      <header className="entry-topbar">
        <BrandLockup />
      </header>

      <section className="entry-grid entry-grid-join">
        <div className="entry-column">
          <div className="entry-headline-wrap">
            <p className="eyebrow eyebrow-warm">You&apos;re invited</p>
            <h1 className="page-title">Join the room</h1>
            <p className="entry-lead">Jump into the music and help shape the vibe.</p>
          </div>

          <div className="panel join-summary-panel">
            {isLoading ? (
              <p className="muted-copy">Loading room preview...</p>
            ) : preview ? (
              <>
                <div className="join-hero-row">
                  <img
                    src={preview.currentTrack?.thumbnailUrl || "https://i.ytimg.com/vi/Rk6_hdRtJOE/hqdefault.jpg"}
                    alt={preview.currentTrack?.title || "Room preview"}
                    className="join-artwork"
                  />
                  <div className="join-hero-copy">
                    <h2 className="join-room-title">{preview.party.name}</h2>
                    <p className="join-room-host">Hosted by {preview.hostDisplayName}</p>
                    <AvatarStack
                      names={[preview.hostDisplayName]}
                      totalCount={preview.participantCount}
                    />
                    <p className="join-room-count">{preview.participantCount} people in the room</p>
                  </div>
                </div>

                <div className="join-rule-grid">
                  <RuleCell label="listening" value={`${preview.participantCount}`} detail="People in the room" />
                  <RuleCell
                    label="songs each"
                    value={`${preview.party.maxSongsPerPerson ?? "∞"}`}
                    detail="Max songs per person"
                  />
                  <RuleCell
                    label="time cap"
                    value={preview.party.maxDurationMinutes ? `${preview.party.maxDurationMinutes / 60}h` : "Open"}
                    detail="Session duration"
                  />
                  <RuleCell label="voting" value="Secret" detail="Votes hidden until reveal" />
                </div>

                <label className="field-label">
                  Your name
                  <input
                    className="input-field"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    maxLength={24}
                  />
                </label>

                {error ? <p className="form-error">{error}</p> : null}

                <button className="primary-button" disabled={isSubmitting} onClick={handleJoin} type="button">
                  {isSubmitting ? "Joining..." : "Join room"}
                </button>
              </>
            ) : (
              <p className="muted-copy">Room preview unavailable.</p>
            )}
          </div>
        </div>

        <div className="entry-column">
          <div className="panel preview-panel">
            <p className="section-label">Room preview</p>
            <p className="preview-copy">Here&apos;s what you&apos;ll be joining.</p>

            {preview ? (
              <>
                <MiniNowPlayingCard preview={preview} />
                <QueuePreviewList preview={preview} />
              </>
            ) : (
              <p className="muted-copy">No preview available.</p>
            )}
          </div>
        </div>
      </section>

    </PageShell>
  );
}

function PartyRoomPage() {
  const navigate = useNavigate();
  const { joinCode = "" } = useParams();
  const sessionToken = getStoredSessionToken(joinCode);
  const playerElementId = useMemo(() => `nero-party-player-${joinCode}`, [joinCode]);
  const playerRef = useRef<YT.Player | null>(null);
  const stateRef = useRef<PartyState | null>(null);
  const completingTrackIdRef = useRef<string | null>(null);
  const activeTrackIdRef = useRef<string | null>(null);
  const appliedGuestPlaybackSyncVersionRef = useRef(0);

  const [state, setState] = useState<PartyState | null>(null);
  const [viewer, setViewer] = useState<{ id: string; displayName: string; role: "HOST" | "GUEST" } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [loadError, setLoadError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerEnabled, setPlayerEnabled] = useState(false);
  const [displayPositionMs, setDisplayPositionMs] = useState(0);
  const [pendingSeekMs, setPendingSeekMs] = useState<number | null>(null);
  const [guestPlaybackSync, setGuestPlaybackSync] = useState<{ version: number; playback: PartyState["playback"] } | null>(null);

  const isHost = viewer?.role === "HOST";

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (state?.currentQueueEntry?.id !== completingTrackIdRef.current) {
      completingTrackIdRef.current = null;
    }
  }, [state?.currentQueueEntry?.id]);

  useEffect(() => {
    if (!sessionToken) {
      navigate(`/join/${joinCode}`, { replace: true });
    }
  }, [joinCode, navigate, sessionToken]);

  useEffect(() => {
    if (!sessionToken) {
      return;
    }
    const activeSessionToken = sessionToken;

    let cancelled = false;

    async function hydrateRoom() {
      try {
        setConnectionStatus("connecting");
        const response = await api.getPartyState(joinCode.toUpperCase(), activeSessionToken);
        if (cancelled) {
          return;
        }

        setViewer(response.participant);
        setState(response.state);
        setGuestPlaybackSync({ version: 1, playback: response.state.playback });
        setPlayerEnabled(true);
        setLoadError("");
      } catch (caughtError) {
        if (cancelled) {
          return;
        }

        const message = caughtError instanceof Error ? caughtError.message : "Failed to load room state.";
        setLoadError(message);
        if (message.toLowerCase().includes("invalid session")) {
          clearStoredSessionToken(joinCode);
        }
      }
    }

    void hydrateRoom();

    return () => {
      cancelled = true;
    };
  }, [joinCode, sessionToken]);

  useEffect(() => {
    if (!sessionToken || !viewer) {
      return;
    }

    const socket = createPartySocket();

    socket.on("connect", () => {
      setConnectionStatus("live");
      socket.emit(
        "party:join-room",
        { joinCode: joinCode.toUpperCase(), sessionToken },
        (result: { ok: boolean; error?: string }) => {
          if (!result.ok) {
            setLoadError(result.error ?? "Failed to join the live room.");
          }
        },
      );
    });

    socket.on("disconnect", () => {
      setConnectionStatus("offline");
    });

    socket.on("party:state", (incomingState: PartyState) => {
      setState(incomingState);
    });

    socket.on("playback:updated", (playback: PartyState["playback"]) => {
      setGuestPlaybackSync((current) => ({
        version: (current?.version ?? 0) + 1,
        playback,
      }));
      setState((current) => (current ? { ...current, playback } : current));
    });

    socket.on("party:presence", (participants: PartyParticipant[]) => {
      setState((current) => (current ? { ...current, participants } : current));
    });

    socket.connect();

    const heartbeat = window.setInterval(() => {
      socket.emit("party:presence");
    }, 15_000);

    return () => {
      window.clearInterval(heartbeat);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [joinCode, sessionToken, viewer]);

  useEffect(() => {
    let cancelled = false;

    void loadYouTubeIframeApi().then(() => {
      if (cancelled || !document.getElementById(playerElementId)) {
        return;
      }

      if (!playerRef.current) {
        playerRef.current = new window.YT.Player(playerElementId, {
          height: "1",
          width: "1",
          playerVars: {
            autoplay: 0,
            controls: 0,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
          },
          events: {
            onReady: (event) => {
              event.target.setVolume(isHost ? 100 : 75);
              setPlayerReady(true);
            },
            onStateChange: (event) => {
              if (event.data !== window.YT.PlayerState.ENDED || !sessionToken || !isHost) {
                return;
              }

              const liveState = stateRef.current;
              if (!liveState?.currentQueueEntry || completingTrackIdRef.current === liveState.currentQueueEntry.id) {
                return;
              }

              completingTrackIdRef.current = liveState.currentQueueEntry.id;
              void api
                .completePartyTrack(liveState.party.id, sessionToken)
                .then((response) => {
                  if (response.state) {
                    setState(response.state);
                  }
                })
                .catch((caughtError) => {
                  completingTrackIdRef.current = null;
                  setLoadError(caughtError instanceof Error ? caughtError.message : "Track transition failed.");
                });
            },
          },
        });
      }
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      setPlayerReady(false);
    };
  }, [isHost, playerElementId]);

  useEffect(() => {
    if (!playerReady || !playerRef.current) {
      return;
    }

    const player = playerRef.current;
    if (!state?.currentQueueEntry) {
      activeTrackIdRef.current = null;
      player.pauseVideo();
      player.seekTo(0, true);
      return;
    }

    const currentTrackId = state.currentQueueEntry.id;
    const targetVideoId = state.currentQueueEntry.youtubeVideoId;
    const currentVideoId = player.getVideoData()?.video_id;
    const trackStartSeconds = state.playback.positionMs / 1000;
    const trackChanged = activeTrackIdRef.current !== currentTrackId || currentVideoId !== targetVideoId;

    if (trackChanged && isHost) {
      activeTrackIdRef.current = currentTrackId;

      if (state.playback.status === "PLAYING" && playerEnabled) {
        player.loadVideoById({ videoId: targetVideoId, startSeconds: trackStartSeconds });
      } else {
        player.cueVideoById({ videoId: targetVideoId, startSeconds: trackStartSeconds });
        player.seekTo(trackStartSeconds, true);
      }
      return;
    }

    if (isHost) {
      if (state.playback.status === "PLAYING") {
        player.playVideo();
      } else if (state.playback.status === "PAUSED" || state.playback.status === "IDLE") {
        player.pauseVideo();
      }
      return;
    }

    if (!playerEnabled) {
      return;
    }

    if (!guestPlaybackSync || appliedGuestPlaybackSyncVersionRef.current === guestPlaybackSync.version) {
      return;
    }

    appliedGuestPlaybackSyncVersionRef.current = guestPlaybackSync.version;
    const syncPlayback = guestPlaybackSync.playback;
    const syncStartSeconds = syncPlayback.positionMs / 1000;
    const syncVideoId = syncPlayback.videoId;
    const syncQueueEntryId = syncPlayback.queueEntryId;

    if (!syncVideoId || !syncQueueEntryId) {
      activeTrackIdRef.current = null;
      player.pauseVideo();
      player.seekTo(0, true);
      return;
    }

    const guestTrackChanged =
      activeTrackIdRef.current !== syncQueueEntryId || player.getVideoData()?.video_id !== syncVideoId;

    if (guestTrackChanged) {
      activeTrackIdRef.current = syncQueueEntryId;

      if (syncPlayback.status === "PLAYING") {
        player.loadVideoById({ videoId: syncVideoId, startSeconds: syncStartSeconds });
      } else {
        player.cueVideoById({ videoId: syncVideoId, startSeconds: syncStartSeconds });
        player.seekTo(syncStartSeconds, true);
      }
      return;
    }

    if (syncPlayback.status === "PLAYING") {
      player.seekTo(syncStartSeconds, true);
      player.playVideo();
      return;
    }

    player.pauseVideo();
    player.seekTo(syncStartSeconds, true);
  }, [guestPlaybackSync, isHost, playerEnabled, playerReady, state]);

  useEffect(() => {
    if (!state) {
      return;
    }

    const interval = window.setInterval(() => {
      if (playerEnabled && playerReady && playerRef.current && state.currentQueueEntry) {
        setDisplayPositionMs(Math.floor(playerRef.current.getCurrentTime() * 1000));
        return;
      }

      if (state.playback.status === "PLAYING" && state.playback.startedAt) {
        const elapsed = Date.now() - new Date(state.playback.startedAt).getTime();
        setDisplayPositionMs(Math.max(0, state.playback.positionMs + elapsed));
        return;
      }

      setDisplayPositionMs(state.playback.positionMs);
    }, 400);

    return () => {
      window.clearInterval(interval);
    };
  }, [playerEnabled, playerReady, state]);

  if (!sessionToken) {
    return null;
  }

  if (loadError) {
    return (
      <PageShell>
        <div className="empty-state">
          <BrandLockup />
          <p className="form-error">{loadError}</p>
          <button className="ghost-button" onClick={() => navigate(`/join/${joinCode}`)} type="button">
            Return to join
          </button>
        </div>
      </PageShell>
    );
  }

  if (!state || !viewer) {
    return (
      <PageShell>
        <div className="empty-state">
          <BrandLockup />
          <p className="muted-copy">Loading room...</p>
        </div>
      </PageShell>
    );
  }

  const currentEntry = state.currentQueueEntry;
  const upNext = state.queue.filter((entry) => entry.status === "QUEUED");
  const setlistEntries = state.queue.slice().sort((left, right) => left.queueOrdinal - right.queueOrdinal);
  const artwork = currentEntry?.thumbnailUrl ?? "https://i.ytimg.com/vi/Rk6_hdRtJOE/hqdefault.jpg";
  const durationMs = (currentEntry?.durationSeconds ?? 0) * 1000;
  const safeDurationMs = durationMs > 0 ? durationMs : 1;

  const handleSearch = async () => {
    try {
      if (!searchQuery.trim()) {
        setSearchError("Enter a song, artist, or album.");
        return;
      }

      setSearchLoading(true);
      setSearchError("");
      const response = await api.searchYouTube(searchQuery.trim());
      setSearchResults(response.results);
    } catch (caughtError) {
      setSearchError(caughtError instanceof Error ? caughtError.message : "Search failed.");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAddSong = async (song: YouTubeSearchResult) => {
    try {
      setSearchError("");
      const response = await api.addQueueEntry(state.party.id, sessionToken, song);
      if (response.state) {
        setState(response.state);
      }
      setSearchOpen(false);
      setSearchQuery("");
      setSearchResults([]);
    } catch (caughtError) {
      setSearchError(caughtError instanceof Error ? caughtError.message : "Failed to add song.");
    }
  };

  const handleVote = async (rating: number) => {
    if (!currentEntry) {
      return;
    }

    try {
      const response = await api.submitVote(currentEntry.id, sessionToken, rating);
      if (response.state) {
        setState(response.state);
      }
    } catch (caughtError) {
      setLoadError(caughtError instanceof Error ? caughtError.message : "Failed to save vote.");
    }
  };

  const currentPositionMs =
    playerEnabled && playerReady && playerRef.current
      ? Math.floor(playerRef.current.getCurrentTime() * 1000)
      : displayPositionMs;

  const handlePlayPause = async () => {
    if (!isHost) {
      setPlayerEnabled(true);
      return;
    }

    try {
      if (state.playback.status === "PLAYING") {
        playerRef.current?.pauseVideo();
        const response = await api.pauseParty(state.party.id, sessionToken, currentPositionMs);
        if (response.state) {
          setState(response.state);
        }
      } else {
        setPlayerEnabled(true);
        if (currentEntry) {
          playerRef.current?.playVideo();
        }
        const response = await api.playParty(state.party.id, sessionToken, currentPositionMs);
        if (response.state) {
          setState(response.state);
        }
      }
    } catch (caughtError) {
      setLoadError(caughtError instanceof Error ? caughtError.message : "Playback update failed.");
    }
  };

  const handleSeekCommit = async (valueMs: number) => {
    if (!isHost) {
      return;
    }

    try {
      playerRef.current?.seekTo(valueMs / 1000, true);
      setDisplayPositionMs(valueMs);
      const response = await api.seekParty(state.party.id, sessionToken, valueMs);
      if (response.state) {
        setState(response.state);
      }
    } catch (caughtError) {
      setLoadError(caughtError instanceof Error ? caughtError.message : "Seek failed.");
    } finally {
      setPendingSeekMs(null);
    }
  };

  const handleNext = async () => {
    if (!isHost) {
      return;
    }

    try {
      const response = await api.nextPartyTrack(state.party.id, sessionToken);
      if (response.state) {
        setState(response.state);
      }
    } catch (caughtError) {
      setLoadError(caughtError instanceof Error ? caughtError.message : "Skip failed.");
    }
  };

  const handleEndParty = async () => {
    if (!isHost) {
      return;
    }

    try {
      const response = await api.endParty(state.party.id, sessionToken);
      if (response.state) {
        setState(response.state);
      }
    } catch (caughtError) {
      setLoadError(caughtError instanceof Error ? caughtError.message : "End party failed.");
    }
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/join/${state.party.joinCode}`);
    setInviteCopied(true);
    window.setTimeout(() => setInviteCopied(false), 1500);
  };

  const visiblePositionMs = pendingSeekMs ?? currentPositionMs;
  const progressPercent = safeDurationMs > 0 ? Math.min(100, (visiblePositionMs / safeDurationMs) * 100) : 0;

  return (
    <div className="room-viewport">
      <div id={playerElementId} className="youtube-player-mount" />
      {state.party.status === "REVEALING" || state.party.status === "ENDED" ? (
        <ResultsView state={state} onRestart={() => navigate("/")} />
      ) : (
        <div className="room-shell">
          <div className="room-main">
            <header className="room-header">
              <div>
                <h1 className="room-title">{state.party.name}</h1>
                <p className="room-subtitle">
                  {state.participants.length} listening · {state.participants.slice(0, 4).map((person) => person.displayName).join(", ")}
                  {state.participants.length > 4 ? ` +${state.participants.length - 4}` : ""}
                </p>
              </div>

              <div className="room-header-actions">
                <div className={`status-pill ${connectionStatus === "live" ? "status-pill-live" : ""}`}>
                  {connectionStatus === "live" ? "Connected" : "Reconnecting"}
                </div>
                <button className="ghost-button" onClick={copyInvite} type="button">
                  {inviteCopied ? "Copied" : "Invite"}
                </button>
                <AvatarStack names={state.participants.map((person) => person.displayName)} totalCount={state.participants.length} />
              </div>
            </header>

            <div className="room-body">
              <section className="now-playing-panel">
                <p className="section-label">Now playing</p>
                <div className="now-playing-stage">
                <div className="now-playing-grid">
                  <img className="now-playing-art" src={artwork} alt={currentEntry?.title ?? "Current track"} />
                  <div className="now-playing-copy">
                    <h2 className="now-playing-title">{currentEntry?.title ?? "Queue something great"}</h2>
                    <p className="now-playing-artist">{currentEntry?.artistName ?? "The room is waiting for its next track."}</p>
                    <p className="sync-copy">
                      {state.playback.status === "PLAYING" ? "Everyone is synced" : "Waiting for the host to press play"}
                    </p>
                  </div>
                </div>

                <div className="progress-block">
                  {isHost ? (
                    <input
                      className="progress-slider"
                      type="range"
                      min={0}
                      max={safeDurationMs}
                      value={Math.min(visiblePositionMs, safeDurationMs)}
                      onChange={(event) => setPendingSeekMs(Number(event.target.value))}
                      onMouseUp={(event) => handleSeekCommit(Number((event.target as HTMLInputElement).value))}
                      onTouchEnd={(event) => handleSeekCommit(Number((event.target as HTMLInputElement).value))}
                      disabled={!currentEntry}
                    />
                  ) : (
                    <div className="progress-bar" aria-hidden="true">
                      <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
                    </div>
                  )}
                  <div className="progress-meta">
                    <span>{formatTime(visiblePositionMs)}</span>
                    <span>{formatTime(durationMs)}</span>
                  </div>
                </div>

                {isHost ? (
                  <div className="transport-row">
                    <button className="play-button" onClick={handlePlayPause} type="button" disabled={!currentEntry && upNext.length === 0}>
                      <span aria-hidden="true">{state.playback.status === "PLAYING" ? "❚❚" : "▶"}</span>
                      <span className="sr-only">{state.playback.status === "PLAYING" ? "Pause" : "Play"}</span>
                    </button>
                    <button className="transport-icon-button" onClick={handleNext} type="button" disabled={!currentEntry} aria-label="Skip">
                      <span aria-hidden="true">⏭</span>
                    </button>
                  </div>
                ) : null}
                </div>

                <div className="vote-card">
                  <div>
                    <p className="section-label section-label-muted">Rate the song</p>
                    <p className="muted-copy">Your vote stays private until the winner reveal.</p>
                  </div>
                  <div className="vote-row">
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <button
                        key={rating}
                        className={`vote-chip ${state.myVote === rating ? "vote-chip-active" : ""}`}
                        onClick={() => handleVote(rating)}
                        type="button"
                        disabled={!currentEntry}
                      >
                        {rating}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <aside className="queue-panel">
                <div className="queue-heading">
                  <div>
                    <p className="section-label">Setlist</p>
                    <h3 className="queue-title">{setlistEntries.length} songs</h3>
                  </div>
                  <button className="ghost-button" onClick={() => setSearchOpen(true)} type="button">
                    Add song
                  </button>
                </div>

                <div className="queue-list">
                  {setlistEntries.length > 0 ? (
                    setlistEntries.map((entry) => (
                      <div className={`queue-row ${entry.status === "PLAYING" ? "queue-row-active" : ""}`} key={entry.id}>
                        <span className="queue-index">{String(entry.queueOrdinal).padStart(2, "0")}</span>
                        <img className="queue-thumb" src={entry.thumbnailUrl} alt={entry.title} />
                        <div className="queue-copy">
                          <span className="queue-song">{entry.title}</span>
                          <span className="queue-artist">
                            {entry.artistName} · {formatQueueEntryStatus(entry.status)}
                          </span>
                        </div>
                        <div className="queue-meta">
                          <span className={`queue-state ${entry.status === "PLAYING" ? "queue-state-playing" : ""}`}>
                            {formatQueueEntryStatus(entry.status)}
                          </span>
                          <span className="queue-added-by">added by</span>
                          <span className="queue-added-name">{entry.addedBy.displayName}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="muted-copy queue-empty-copy">The setlist will build here.</p>
                  )}
                </div>
              </aside>
            </div>

            {isHost ? (
              <footer className="host-footer">
                <div className="host-footer-summary">
                  <span className="host-mode-pill">Host mode</span>
                  <span>{state.party.maxSongsPerPerson ?? "∞"} songs each</span>
                  <span>{state.party.maxDurationMinutes ? `${state.party.maxDurationMinutes / 60} hour cap` : "Open length"}</span>
                  <span>Secret voting</span>
                </div>
                <div className="host-footer-actions">
                  <button className="danger-button end-party-button" onClick={handleEndParty} type="button">
                    End party
                  </button>
                </div>
              </footer>
            ) : (
              <footer className="guest-footer" />
            )}
          </div>
        </div>
      )}

      <SearchDrawer
        error={searchError}
        isLoading={searchLoading}
        isOpen={searchOpen}
        onAddSong={handleAddSong}
        onClose={() => setSearchOpen(false)}
        onSearch={handleSearch}
        query={searchQuery}
        results={searchResults}
        setQuery={setSearchQuery}
      />
    </div>
  );
}

function SearchDrawer(props: {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  setQuery: (value: string) => void;
  onSearch: () => void;
  results: YouTubeSearchResult[];
  isLoading: boolean;
  error: string;
  onAddSong: (song: YouTubeSearchResult) => void;
}) {
  if (!props.isOpen) {
    return null;
  }

  return (
    <div className="drawer-backdrop" role="presentation" onClick={props.onClose}>
      <div className="drawer-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <h3 className="panel-title">Add a song</h3>
          <button className="ghost-button" onClick={props.onClose} type="button">
            Close
          </button>
        </div>
        <div className="drawer-search-row">
          <input
            className="input-field"
            placeholder="Search songs, artists, albums"
            value={props.query}
            onChange={(event) => props.setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void props.onSearch();
              }
            }}
          />
          <button className="ghost-button" onClick={props.onSearch} type="button">
            Search
          </button>
        </div>
        {props.error ? <p className="form-error">{props.error}</p> : null}
        <div className="search-results">
          {props.isLoading ? <p className="muted-copy">Searching YouTube...</p> : null}
          {props.results.map((result) => (
            <div className="search-row" key={result.youtubeVideoId}>
              <img className="queue-thumb" src={result.thumbnailUrl} alt={result.title} />
              <div className="queue-copy">
                <span className="queue-song">{result.title}</span>
                <span className="queue-artist">{result.artistName}</span>
              </div>
              <div className="search-row-meta">
                <span>{formatTime(result.durationSeconds * 1000)}</span>
                <button className="ghost-button" onClick={() => props.onAddSong(result)} type="button">
                  Add
                </button>
              </div>
            </div>
          ))}
          {!props.isLoading && props.results.length === 0 ? (
            <p className="muted-copy">Search for a YouTube track to add it to the setlist.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ResultsView(props: { state: PartyState; onRestart: () => void }) {
  const winner = props.state.results?.winningEntry;

  return (
    <div className="results-page">
      <header className="results-header">
        <BrandLockup />
      </header>

      <div className="results-shell">
        <section className="results-hero">
          <p className="eyebrow eyebrow-warm">Tonight&apos;s winner</p>
          {winner ? (
            <>
              <div className="results-winner-grid">
                <img className="results-art" src={winner.thumbnailUrl} alt={winner.title} />
                <div className="results-winner-copy">
                  <h1 className="results-title">{winner.title}</h1>
                  <p className="results-subtitle">{winner.artistName}</p>
                  <p className="results-meta">Added by {winner.addedBy.displayName}</p>
                  <p className="results-score">
                    {winner.averageRating.toFixed(1)} average score · {winner.voteCount} votes
                  </p>
                </div>
              </div>

              <div className="results-actions">
                <button className="primary-button" onClick={props.onRestart} type="button">
                  Start another room
                </button>
              </div>
            </>
          ) : (
            <div className="results-empty">
              <h1 className="results-title">No winner yet</h1>
              <p className="muted-copy">No songs were played before the room ended.</p>
              <div className="results-actions">
                <button className="primary-button" onClick={props.onRestart} type="button">
                  Start another room
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="results-ranking">
          <p className="section-label">Final setlist ranking</p>
          <div className="queue-list">
            {props.state.results?.rankedEntries.map((entry, index) => (
              <div className="queue-row results-row" key={entry.id}>
                <span className="queue-index">#{index + 1}</span>
                <img className="queue-thumb" src={entry.thumbnailUrl} alt={entry.title} />
                <div className="queue-copy">
                  <span className="queue-song">{entry.title}</span>
                  <span className="queue-artist">{entry.artistName}</span>
                </div>
                <div className="queue-meta">
                  <span className="queue-added-name">{entry.averageRating.toFixed(1)}</span>
                  <span className="queue-added-by">{entry.voteCount} votes</span>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function PageShell(props: { children: React.ReactNode }) {
  return <main className="app-shell">{props.children}</main>;
}

function BrandLockup(props: { compact?: boolean } = {}) {
  return (
    <div className={`brand-lockup ${props.compact ? "brand-lockup-compact" : ""}`}>
      <span>Nero Party</span>
    </div>
  );
}

function ValueRow(props: { title: string; text: string }) {
  return (
    <div className="value-row">
      <div>
        <h3 className="value-title">{props.title}</h3>
        <p className="value-copy">{props.text}</p>
      </div>
    </div>
  );
}

function MiniNowPlayingCard(props: { preview: PartyPreview }) {
  return (
    <div className="mini-player">
      <p className="section-label">Now playing</p>
      <div className="mini-player-row">
        <img
          className="mini-player-art"
          src={props.preview.currentTrack?.thumbnailUrl || "https://i.ytimg.com/vi/Rk6_hdRtJOE/hqdefault.jpg"}
          alt={props.preview.currentTrack?.title ?? "Now playing"}
        />
        <div>
          <h3 className="mini-player-title">{props.preview.currentTrack?.title ?? "Waiting for the host"}</h3>
          <p className="preview-track-artist">{props.preview.currentTrack?.artistName ?? "No track started yet"}</p>
          <p className="sync-copy">Everyone is synced</p>
        </div>
      </div>
    </div>
  );
}

function QueuePreviewList(props: { preview: PartyPreview }) {
  return (
    <div className="queue-preview-list">
      <div className="queue-heading">
        <p className="section-label">Up next</p>
        <span className="tiny-pill">{props.preview.queuePreview.length} songs</span>
      </div>
      {props.preview.queuePreview.map((item, index) => (
        <div className="queue-row queue-row-preview" key={item.id}>
          <span className="queue-index">{String(index + 1).padStart(2, "0")}</span>
          <div className="queue-copy">
            <span className="queue-song">{item.title}</span>
            <span className="queue-artist">{item.artistName}</span>
          </div>
          <div className="queue-meta">
            <span className="queue-added-by">added by</span>
            <span className="queue-added-name">{item.addedBy}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SegmentField<T extends number>(props: {
  label: string;
  helper: string;
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="field-block">
      <div className="field-title">{props.label}</div>
      <div className="field-helper">{props.helper}</div>
      <div className={`segmented-grid ${props.options.length > 3 ? "segmented-grid-wide" : "segmented-grid-two"}`}>
        {props.options.map((option) => (
          <button
            key={option.label}
            className={`segmented-button ${props.value === option.value ? "segmented-button-active" : ""}`}
            onClick={() => props.onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RuleCell(props: { label: string; value: string; detail: string }) {
  return (
    <div className="rule-cell">
      <span className="rule-value">{props.value}</span>
      <span className="rule-label">{props.label}</span>
      <span className="rule-detail">{props.detail}</span>
    </div>
  );
}

function AvatarStack(props: { names: string[]; totalCount?: number }) {
  const visible = props.names.slice(0, 4);
  const overflow = props.totalCount !== undefined ? Math.max(props.totalCount - visible.length, 0) : Math.max(props.names.length - visible.length, 0);

  return (
    <div className="avatar-stack">
      {visible.map((name, index) => (
        <span className="avatar" key={`${name}-${index}`}>
          {getInitials(name)}
        </span>
      ))}
      {overflow > 0 ? <span className="avatar avatar-overflow">+{overflow}</span> : null}
    </div>
  );
}

function formatTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatQueueEntryStatus(status: QueueEntryStatus) {
  switch (status) {
    case "PLAYED":
      return "played";
    case "SKIPPED":
      return "skipped";
    case "PLAYING":
      return "playing";
    default:
      return "up next";
  }
}

function getInitials(name: string) {
  const words = name.split(/\s+/u).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

export default App;
