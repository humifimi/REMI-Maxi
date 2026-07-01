import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { BUG_REPORT_CONFIG } from "@technician/constants/bug-report";
import {
  LocalBugReportStatus,
  type AnyBugReportStatus,
  type BugReportServiceInterface,
  type LocalBugReport,
} from "@technician/types/bug-report";

const KEYS = BUG_REPORT_CONFIG.ASYNC_STORAGE_KEYS;

export class LocalBugReportService implements BugReportServiceInterface {
  async submit(report: LocalBugReport): Promise<void> {
    const updated: LocalBugReport = {
      ...report,
      status: LocalBugReportStatus.QUEUED,
      updated_at: new Date().toISOString(),
    };

    const pending = await this.loadList(KEYS.PENDING);
    pending.push(updated);
    await AsyncStorage.setItem(KEYS.PENDING, JSON.stringify(pending));

    const history = await this.loadList(KEYS.HISTORY);
    history.unshift(updated);
    await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(history));

    await this.deleteDraft();
  }

  async saveDraft(report: LocalBugReport): Promise<void> {
    const draft: LocalBugReport = {
      ...report,
      status: LocalBugReportStatus.DRAFT,
      updated_at: new Date().toISOString(),
    };
    await AsyncStorage.setItem(KEYS.DRAFT, JSON.stringify(draft));
  }

  async loadDraft(): Promise<LocalBugReport | null> {
    const raw = await AsyncStorage.getItem(KEYS.DRAFT);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as LocalBugReport;
    } catch {
      return null;
    }
  }

  async deleteDraft(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.DRAFT);
  }

  async getHistory(): Promise<LocalBugReport[]> {
    return this.loadList(KEYS.HISTORY);
  }

  async getStatus(id: string): Promise<AnyBugReportStatus | null> {
    const history = await this.loadList(KEYS.HISTORY);
    const report = history.find((r) => r.id === id);
    return report?.status ?? null;
  }

  async getPendingCount(): Promise<number> {
    const pending = await this.loadList(KEYS.PENDING);
    return pending.length;
  }

  async syncPending(): Promise<void> {
    // No-op for local-first implementation.
    // Remote sync will be wired when backend endpoints are confirmed.
  }

  private async loadList(key: string): Promise<LocalBugReport[]> {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as LocalBugReport[];
    } catch {
      return [];
    }
  }
}

export async function generateReportId(): Promise<string> {
  return Crypto.randomUUID();
}

export const bugReportService = new LocalBugReportService();
