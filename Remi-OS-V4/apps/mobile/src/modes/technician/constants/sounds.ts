import type { SoundEventType } from "@technician/types/api";

export interface SoundAsset {
  key: SoundEventType;
  label: string;
  description: string;
  icon: string;
  file: ReturnType<typeof require>;
}

export const SOUND_ASSETS: SoundAsset[] = [
  {
    key: "new_job",
    label: "New Job",
    description: "Plays when a new job notification arrives",
    icon: "work",
    file: require("@/assets/sounds/new-job.mp3"),
  },
  {
    key: "job_complete",
    label: "Job Complete",
    description: "Plays when you finish a service",
    icon: "check-circle",
    file: require("@/assets/sounds/job-complete.mp3"),
  },
  {
    key: "rating_received",
    label: "Rating Received",
    description: "Plays when a customer rates your service",
    icon: "star",
    file: require("@/assets/sounds/rating-received.mp3"),
  },
  {
    key: "message_received",
    label: "Message Received",
    description: "Plays when a new message arrives",
    icon: "message",
    file: require("@/assets/sounds/message-received.mp3"),
  },
  {
    key: "milestone_unlocked",
    label: "Milestone Unlocked",
    description: "Plays when you earn a badge or reach a milestone",
    icon: "emoji-events",
    file: require("@/assets/sounds/milestone-unlocked.mp3"),
  },
];

export const SOUND_EVENT_MAP = Object.fromEntries(
  SOUND_ASSETS.map((s) => [s.key, s])
) as Record<SoundEventType, SoundAsset>;
