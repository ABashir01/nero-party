import type { PartyPreview, PartyStateResponse, YouTubeSearchResult } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  sessionToken?: string;
};

async function request<T>(path: string, options: RequestOptions = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.sessionToken ? { "x-session-token": options.sessionToken } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const payload = (await response.json().catch(() => ({ error: "Request failed." }))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }

  return payload;
}

export const api = {
  createParty(input: {
    partyName: string;
    hostDisplayName: string;
    maxSongsPerPerson?: number | null;
    maxDurationMinutes?: number | null;
  }) {
    return request<PartyStateResponse>("/api/parties", { method: "POST", body: input });
  },
  joinParty(input: { joinCode: string; displayName: string }) {
    return request<PartyStateResponse>("/api/parties/join", { method: "POST", body: input });
  },
  getPartyState(joinCode: string, sessionToken: string) {
    return request<PartyStateResponse>(`/api/parties/${joinCode}/state`, { sessionToken });
  },
  getPartyPreview(joinCode: string) {
    return request<PartyPreview>(`/api/parties/${joinCode}/preview`);
  },
  searchYouTube(query: string) {
    return request<{ results: YouTubeSearchResult[] }>(`/api/search/youtube?q=${encodeURIComponent(query)}`);
  },
  addQueueEntry(
    partyId: string,
    sessionToken: string,
    song: {
      youtubeVideoId: string;
      title: string;
      artistName: string;
      thumbnailUrl: string;
      durationSeconds: number;
    },
  ) {
    return request<{ state: PartyStateResponse["state"] }>(`/api/parties/${partyId}/queue`, {
      method: "POST",
      body: song,
      sessionToken,
    });
  },
  submitVote(queueEntryId: string, sessionToken: string, rating: number) {
    return request<{ myVote: number; state: PartyStateResponse["state"] }>(`/api/queue/${queueEntryId}/vote`, {
      method: "POST",
      body: { rating },
      sessionToken,
    });
  },
  playParty(partyId: string, sessionToken: string, positionMs: number) {
    return request<{ state: PartyStateResponse["state"] }>(`/api/parties/${partyId}/playback/play`, {
      method: "POST",
      body: { positionMs },
      sessionToken,
    });
  },
  pauseParty(partyId: string, sessionToken: string, positionMs: number) {
    return request<{ state: PartyStateResponse["state"] }>(`/api/parties/${partyId}/playback/pause`, {
      method: "POST",
      body: { positionMs },
      sessionToken,
    });
  },
  seekParty(partyId: string, sessionToken: string, positionMs: number) {
    return request<{ state: PartyStateResponse["state"] }>(`/api/parties/${partyId}/playback/seek`, {
      method: "POST",
      body: { positionMs },
      sessionToken,
    });
  },
  nextPartyTrack(partyId: string, sessionToken: string) {
    return request<{ state: PartyStateResponse["state"] }>(`/api/parties/${partyId}/playback/next`, {
      method: "POST",
      body: { resolution: "SKIPPED" },
      sessionToken,
    });
  },
  completePartyTrack(partyId: string, sessionToken: string) {
    return request<{ state: PartyStateResponse["state"] }>(`/api/parties/${partyId}/playback/next`, {
      method: "POST",
      body: { resolution: "PLAYED" },
      sessionToken,
    });
  },
  endParty(partyId: string, sessionToken: string) {
    return request<{ state: PartyStateResponse["state"] }>(`/api/parties/${partyId}/end`, {
      method: "POST",
      sessionToken,
    });
  },
};

export { API_BASE_URL };
