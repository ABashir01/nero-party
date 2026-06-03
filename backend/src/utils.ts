import type { Party } from "@prisma/client";
import { randomBytes } from "crypto";
import { PLAYBACK_STATUS } from "./constants.js";

const JOIN_CODE_SEGMENT_LENGTH = 4;
const HEARTBEAT_DRIFT_THRESHOLD_MS = 1_500;

export function createSessionToken() {
  return randomBytes(24).toString("hex");
}

export function createJoinCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segment = () =>
    Array.from({ length: JOIN_CODE_SEGMENT_LENGTH }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");

  return `NP-${segment()}-${segment()}`;
}

export function coercePositiveInt(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function parseYoutubeDuration(duration: string) {
  const match =
    /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/u.exec(duration);

  if (!match) {
    return 0;
  }

  const [, , , , hours, minutes, seconds] = match;

  return (Number(hours ?? 0) * 60 * 60) + (Number(minutes ?? 0) * 60) + Number(seconds ?? 0);
}

export function getEffectivePlaybackPositionMs(party: Pick<Party, "playbackPositionMs" | "playbackStartedAt" | "playbackStatus">) {
  if (party.playbackStatus !== PLAYBACK_STATUS.PLAYING || !party.playbackStartedAt) {
    return party.playbackPositionMs;
  }

  const elapsed = Date.now() - new Date(party.playbackStartedAt).getTime();
  return Math.max(0, party.playbackPositionMs + elapsed);
}

export function getPlaybackStartedAt(positionMs: number) {
  void positionMs;
  return new Date();
}

export function withinSyncTolerance(currentMs: number, incomingMs: number) {
  return Math.abs(currentMs - incomingMs) <= HEARTBEAT_DRIFT_THRESHOLD_MS;
}
