# Nero Party MVP Plan

## Summary

Nero Party is a shared listening-party app where one host creates a room, invites friends, builds a collaborative queue, and guides everyone through a synchronized music session that ends with a crowned winning song. The MVP goal is to demonstrate a polished, real-time social music experience that is visually strong, easy to understand in a short demo, and realistic to build within the take-home constraints.

This phase is intentionally product-facing rather than implementation-heavy. The document is meant to stabilize the experience, interaction model, and system boundaries so the next step can focus on frontend mockups from a clear source of truth.

## Product Framing

### What The MVP Must Prove

The MVP should prove that Nero Party can:

- Let a host start a party quickly with a few useful controls.
- Let guests join with minimal friction.
- Make the room feel shared and live through synchronized playback and instant updates.
- Turn music listening into a light competition without disrupting the social vibe.
- End with a memorable reveal that gives the session a strong payoff.

### Why Host-Led YouTube Playback

YouTube-backed playback is the chosen MVP tradeoff because it best balances demo quality, realistic catalog depth, and feasible implementation scope.

- It supports full-track playback rather than short preview clips.
- It avoids the heavier auth and device constraints that come with Spotify-based playback.
- It allows the room to feel like a real listening session rather than a sampling interface.
- It is flexible enough for a music-first UI, even though the underlying embed is video-based.

The product should visually treat playback as music-first. The embedded player is a technical delivery mechanism, not the centerpiece of the interface.

## Locked Product Decisions

- Join model: guest-only names, no user accounts.
- Playback model: host-led synchronized YouTube playback.
- Room model: real-time shared state for queue, participants, and now playing.
- Competition model: hybrid feedback during the session with exact rankings revealed only at the end.

## Experience Principles

### Music-First Room

The main room should feel like a live listening session, not a video app. The UI should prioritize:

- current track identity
- album art or strong visual track treatment
- clear playback state
- active room energy from participants

The actual YouTube surface should be visually subordinate or integrated in a way that does not dominate the screen.

### Live, But Not Over-Explained

The room should always feel active:

- participant joins should register immediately
- queue changes should appear instantly
- playback changes should propagate without confusion
- voting or reactions should create visible momentum

At the same time, the app should not overload the user with numbers, tables, or constant rank reshuffling.

### Finale Matters

The leaderboard should not overshadow the listening session. Mid-session feedback can hint at energy or engagement, but the final reveal should be the emotional high point:

- final rankings become visible only at the end
- one song is clearly crowned the winner
- the reveal should feel celebratory and conclusive

## MVP Feature Overview

### 1. Create Party

The host can create a party with a few configurable conditions that make the session feel intentional rather than open-ended.

The MVP should support:

- party name
- host display name
- optional max song limit
- optional max session duration

The result of creation is a live party room plus a shareable link or short join code.

### 2. Join Party

Guests join using the shared link or code and enter a display name.

The join flow should be lightweight:

- no auth
- no email
- no account creation

The moment a guest joins, they should land directly in the room with current state already visible.

### 3. Add Songs To Shared Queue

Participants can search for songs and add them to the shared queue.

This feature should support:

- external song search
- recognizable song metadata
- clear add-to-queue behavior
- visible queue order

The queue should feel collaborative, but still controlled enough that the host can keep the session moving.

### 4. Listen Together

The host controls playback for the room. Everyone sees the same now-playing state, queue progression, and high-level transport actions.

The MVP should support:

- play
- pause
- skip to next song
- end party

Playback state should update in real time for all connected participants.

### 5. Vote / React During Playback

Each participant can privately express preference for songs as they are played.

The chosen baseline is:

- one private 1-5 rating per participant per played song

During the session, the UI may show lightweight live feedback such as:

- reaction pulses
- voting completion state
- non-numeric momentum indicators

The app should not show exact rank, average score, or a full standings table while the party is active.

### 6. Reveal Winner

When the party ends, the session transitions into a results state.

This should include:

- final ranked list of songs
- clear winner treatment
- enough supporting context that the ranking feels earned

The end state should feel like a payoff, not just a data dump.

## Core User Flows

### Host Flow

1. Open the app landing page.
2. Create a party with name and session rules.
3. Receive a join link or code.
4. Enter the room and begin searching for or queuing songs.
5. Start playback and manage the party pace.
6. Watch real-time room activity as guests join, add tracks, and react.
7. End the party when the queue or session is complete.
8. Reveal the winner and final standings.

### Guest Flow

1. Open the shared join link or enter the party code.
2. Enter a display name.
3. Land directly in the active room.
4. View now playing, queue, and participant presence.
5. Search and add songs.
6. Rate songs privately as they play.
7. Follow live room energy without seeing exact standings.
8. View final ranked results and winning song at the end.

## High-Level Frontend Surfaces

The MVP frontend should be organized around a small number of clear screens or states.

### Landing / Entry

- product introduction
- create-party path
- join-party path

### Party Creation

- party name
- host name
- room constraints
- create action

### Join Flow

- code or link entry when needed
- guest display name
- join action

### Main Party Room

The party room is the core product surface. It should include:

- now-playing module
- current playback status
- shared queue
- participant list or presence rail
- host controls when relevant
- guest add-song interface
- private voting interaction
- lightweight live feedback surfaces

The room should be visually centered on the currently playing track and the shared experience around it.

### Finale / Results

- winner reveal
- ranked song list
- supporting result details
- strong visual transition from live room to conclusion

## High-Level Backend Responsibilities

The backend should own the durable and synchronized state for the party experience.

It is responsible for:

- party lifecycle state
- participant membership
- queue state and ordering
- song metadata persistence
- rating or vote storage
- playback state authority
- final result calculation

The backend should expose:

- REST endpoints for create, join, fetch current state, search integration entrypoints, queue actions, and host controls
- Socket.IO events for participant presence, queue updates, playback updates, vote submission, and party-state transitions

This document does not lock exact endpoint or event shapes yet. It only fixes the responsibility boundaries.

## High-Level Data Responsibilities

At a conceptual level, the MVP data model should support:

- Party
- Participant
- Song
- Queue Entry
- Vote

These entities are enough to support:

- room identity
- guest participation
- shared queueing
- per-song rating
- final winner calculation

Additional fields and relations should be designed later during the detailed implementation phase.

## Competition Model

### Voting Rules

- Each participant can submit one private rating per played song.
- Ratings use a 1-5 scale.
- Ratings are attached to played songs, not to the queue in general.
- A rating locks when the song ends or is skipped.

### Mid-Session Feedback

During the party, the interface can communicate energy and participation, but not exact standings.

Allowed feedback patterns include:

- showing that people have voted
- showing that a song is getting strong response
- showing reactions or momentum

Avoid:

- explicit ranked tables
- visible average scores
- first/second/third labels before the finale

### Final Ranking Rules

The final ranking should be computed by:

1. Highest average rating
2. Highest total vote count as first tie-breaker
3. Earliest queue position as second tie-breaker

This gives the MVP a clear, deterministic winner without overcomplicating the scoring system.

## Acceptance Criteria

The planning document is successful if it gives the mockup phase enough clarity to design without reopening core product questions.

The MVP it describes should satisfy the prompt by covering:

- party creation
- configurable host constraints
- shareable join path
- collaborative song queue
- synchronized playback
- real-time room updates
- user preference expression
- a final winning song

It should also preserve the intended product character:

- low-friction joining
- visually strong room experience
- social energy during the session
- dramatic final reveal

## Edge Cases To Preserve For Later Implementation

These do not need detailed solutions in this phase, but they should remain in scope for later design and engineering:

- duplicate guest display names
- guests joining after playback has already started
- skipped songs
- songs with few or no votes
- participant disconnect and reconnect
- max-song or max-duration cutoff behavior
- host ending the session early

## What This Document Intentionally Does Not Lock Yet

To keep the next phase flexible, this plan does not yet define:

- exact API contracts
- exact socket event payloads
- exact Prisma schema fields
- detailed frontend component structure
- exact visual design language
- detailed moderation or permissions model beyond host authority

Those decisions should come after mockup generation, when the desired UX is more concrete.

## Success Criteria For The Next Step

This planning doc should act as the source of truth for mockup generation.

The mockup phase should be able to use it to answer:

- what the product is
- who the user roles are
- what screens or states exist
- what the primary interactions are
- what must feel prominent in the interface
- what must be hidden until the finale

If the mockup process can proceed without reopening major product decisions, this document has done its job.
