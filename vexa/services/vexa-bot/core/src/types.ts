export type BotConfig = {
  platform: "google_meet" | "zoom" | "teams",
  meetingUrl: string | null,
  botName: string,
  token: string,
  connectionId: string,
  nativeMeetingId: string,
  language?: string | null,
  task?: string | null,
  redisUrl: string,
  automaticLeave: {
    waitingRoomTimeout: number,
    noOneJoinedTimeout: number,
    everyoneLeftTimeout: number,
    humanInactivityTimeout?: number,    // Timeout when no human activity (default: 10 minutes)
    maxSessionDuration?: number         // Maximum session duration (default: 1 hour)
  },
  reconnectionIntervalMs?: number,
  keepAliveIntervalMs?: number,
  meeting_id?: number,
  botManagerCallbackUrl?: string;
}
