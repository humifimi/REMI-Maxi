import AsyncStorage from "@react-native-async-storage/async-storage";
import { BUG_REPORT_CONFIG } from "@technician/constants/bug-report";
import type {
  FrustrationEventType,
  CreateFrustrationEventData,
} from "@technician/types/bug-report";

const STORAGE_KEY = BUG_REPORT_CONFIG.ASYNC_STORAGE_KEYS.FRUSTRATION_EVENTS;

const TIER_MAP: Record<FrustrationEventType, number> = {
  rage_tap: 1,
  dead_end_scroll: 1,
  rapid_back_nav: 1,
  form_abandon: 2,
  error_dwell: 2,
  repeated_action: 2,
  session_churn: 3,
  keyboard_dismiss: 3,
  permission_deny_retry: 3,
};

const WEIGHT_MAP: Record<number, number> = {
  1: 3,
  2: 2,
  3: 1,
};

export class FrustrationTracker {
  private events: CreateFrustrationEventData[] = [];
  private lastNudgeTime = 0;
  private hasNudgedThisSession = false;

  async hydrate(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.events = JSON.parse(raw) as CreateFrustrationEventData[];
      }
    } catch {
      this.events = [];
    }
  }

  async recordEvent(
    type: FrustrationEventType,
    screenName: string,
    coordinates?: { x: number; y: number },
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const event: CreateFrustrationEventData = {
      type,
      tier: TIER_MAP[type] ?? 1,
      screen_name: screenName,
      occurred_at: new Date().toISOString(),
      coordinates,
      metadata,
    };

    this.events.push(event);

    if (this.events.length > BUG_REPORT_CONFIG.MAX_BATCH_EVENTS) {
      this.events = this.events.slice(-BUG_REPORT_CONFIG.MAX_BATCH_EVENTS);
    }

    await this.persist();
  }

  getSessionEvents(): CreateFrustrationEventData[] {
    return [...this.events];
  }

  getWeightedScore(): number {
    return this.events.reduce((sum, e) => {
      return sum + (WEIGHT_MAP[e.tier] ?? 1);
    }, 0);
  }

  shouldNudge(): boolean {
    if (this.hasNudgedThisSession && BUG_REPORT_CONFIG.FRUSTRATION.ONE_NUDGE_PER_SESSION) {
      return false;
    }

    const now = Date.now();
    if (now - this.lastNudgeTime < BUG_REPORT_CONFIG.FRUSTRATION.NUDGE_COOLDOWN_MS) {
      return false;
    }

    return this.getWeightedScore() >= 6;
  }

  markNudged(): void {
    this.lastNudgeTime = Date.now();
    this.hasNudgedThisSession = true;
  }

  async clearSession(): Promise<void> {
    this.events = [];
    this.hasNudgedThisSession = false;
    await AsyncStorage.removeItem(STORAGE_KEY);
  }

  getRecentForScreen(screenName: string): CreateFrustrationEventData[] {
    return this.events.filter((e) => e.screen_name === screenName);
  }

  private async persist(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.events));
    } catch {
      // Silent fail – not critical
    }
  }
}

export const frustrationTracker = new FrustrationTracker();
