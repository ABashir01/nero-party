import { env } from "./env.js";
import { parseYoutubeDuration } from "./utils.js";

export type YouTubeSearchResult = {
  youtubeVideoId: string;
  title: string;
  artistName: string;
  thumbnailUrl: string;
  durationSeconds: number;
};

type SearchResponse = {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      thumbnails?: {
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
  }>;
};

type VideosResponse = {
  items?: Array<{
    id?: string;
    contentDetails?: { duration?: string };
  }>;
};

function requireApiKey() {
  if (!env.YOUTUBE_API_KEY) {
    throw new Error("YOUTUBE_API_KEY is not configured.");
  }

  return env.YOUTUBE_API_KEY;
}

export async function searchYoutube(query: string) {
  const apiKey = requireApiKey();
  const searchParams = new URLSearchParams({
    key: apiKey,
    part: "snippet",
    type: "video",
    maxResults: "10",
    q: query,
    videoEmbeddable: "true",
  });

  const searchResponse = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`);
  if (!searchResponse.ok) {
    throw new Error(`YouTube search failed with status ${searchResponse.status}.`);
  }

  const searchJson = (await searchResponse.json()) as SearchResponse;
  const rawItems = searchJson.items ?? [];
  const videoIds = rawItems
    .map((item) => item.id?.videoId)
    .filter((videoId): videoId is string => Boolean(videoId));

  if (videoIds.length === 0) {
    return [] satisfies YouTubeSearchResult[];
  }

  const detailsParams = new URLSearchParams({
    key: apiKey,
    part: "contentDetails",
    id: videoIds.join(","),
  });

  const detailsResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?${detailsParams.toString()}`);
  if (!detailsResponse.ok) {
    throw new Error(`YouTube video lookup failed with status ${detailsResponse.status}.`);
  }

  const detailsJson = (await detailsResponse.json()) as VideosResponse;
  const durationsById = new Map(
    (detailsJson.items ?? [])
      .filter((item): item is Required<Pick<NonNullable<VideosResponse["items"]>[number], "id" | "contentDetails">> => Boolean(item.id && item.contentDetails?.duration))
      .map((item) => [item.id, parseYoutubeDuration(item.contentDetails.duration ?? "PT0S")]),
  );

  return rawItems
    .map((item) => {
      const videoId = item.id?.videoId;
      if (!videoId) {
        return null;
      }

      const snippet = item.snippet;
      const thumbnailUrl =
        snippet?.thumbnails?.high?.url ??
        snippet?.thumbnails?.medium?.url ??
        snippet?.thumbnails?.default?.url ??
        "";

      return {
        youtubeVideoId: videoId,
        title: snippet?.title ?? "Untitled track",
        artistName: snippet?.channelTitle ?? "Unknown artist",
        thumbnailUrl,
        durationSeconds: durationsById.get(videoId) ?? 0,
      } satisfies YouTubeSearchResult;
    })
    .filter((item): item is YouTubeSearchResult => Boolean(item));
}
