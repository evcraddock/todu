import type { DocHandle, DocumentId } from "@automerge/automerge-repo";
import type { Repo } from "@automerge/automerge-repo";
import {
  type CatalogDocument,
  type CreateHabitInput,
  type Habit,
  type HabitEntry,
  type HabitFilter,
  type HabitHistoryEntry,
  type HabitId,
  type HabitLogDocument,
  type HabitStreak,
  type Result,
  type UpdateHabitInput,
  createHabitId,
  createHabitLogDocument,
  err,
  notFound,
  ok,
  validateCreateHabitInput,
  validateUpdateHabitInput,
  validationError,
} from "@todu/core";
import { isScheduledDate, nextOccurrence, todayInTimezone } from "./schedule.js";
import { registerProcessor } from "./scheduling.js";
import type { HabitNamespace } from "./todu.js";

// ============================================================================
// Helpers
// ============================================================================

function generateHabitId(): HabitId {
  const hex = [...crypto.getRandomValues(new Uint8Array(4))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return createHabitId(`hab-${hex}`);
}

function cloneHabit(h: Habit): Habit {
  return JSON.parse(JSON.stringify(h)) as Habit;
}

// ============================================================================
// Habit namespace factory
// ============================================================================

export function createHabitNamespace(
  catalog: DocHandle<CatalogDocument>,
  repo: Repo,
): HabitNamespace {
  async function getLogHandle(habitId: HabitId): Promise<DocHandle<HabitLogDocument> | null> {
    const doc = catalog.doc();
    if (!doc) return null;
    const docId = doc.habitLogDocIds[habitId];
    if (!docId) return null;
    return repo.find<HabitLogDocument>(docId as DocumentId);
  }

  async function getOrCreateLogHandle(habitId: HabitId): Promise<DocHandle<HabitLogDocument>> {
    const existing = await getLogHandle(habitId);
    if (existing) return existing;

    const handle = repo.create<HabitLogDocument>();
    const empty = createHabitLogDocument(habitId);
    handle.change((doc) => {
      doc.habitId = empty.habitId;
      doc.entries = empty.entries;
    });

    catalog.change((doc) => {
      doc.habitLogDocIds[habitId] = handle.documentId;
    });

    return handle;
  }

  return {
    async create(input: CreateHabitInput): Promise<Result<Habit>> {
      const validationErr = validateCreateHabitInput(input);
      if (validationErr) return err(validationErr);

      const id = generateHabitId();
      const now = new Date().toISOString();

      const nextDue = nextOccurrence(
        input.schedule,
        input.startDate,
        input.timezone,
        input.startDate,
        input.endDate,
      );
      if (!nextDue) {
        return err(validationError("schedule", "Schedule produces no occurrences from start date"));
      }

      const habit: Habit = {
        id,
        title: input.title.trim(),
        description: input.description,
        schedule: input.schedule,
        timezone: input.timezone,
        startDate: input.startDate,
        endDate: input.endDate,
        nextDue,
        paused: false,
        createdAt: now,
        updatedAt: now,
      };

      // Create the HabitLogDocument
      await getOrCreateLogHandle(id);

      catalog.change((doc) => {
        // Strip undefined for Automerge
        const entry: Record<string, unknown> = { ...habit };
        for (const key of Object.keys(entry)) {
          if (entry[key] === undefined) delete entry[key];
        }
        doc.habits.push(entry as unknown as Habit);
      });

      return ok(cloneHabit(habit));
    },

    async list(filter?: HabitFilter): Promise<Result<Habit[]>> {
      const doc = catalog.doc();
      if (!doc) return ok([]);

      let habits = [...doc.habits];

      if (filter?.paused !== undefined) {
        habits = habits.filter((h) => h.paused === filter.paused);
      }
      if (filter?.search) {
        const lowerQuery = filter.search.toLowerCase();
        habits = habits.filter((h) => h.title.toLowerCase().includes(lowerQuery));
      }

      return ok(habits.map(cloneHabit));
    },

    async get(id: HabitId): Promise<Result<Habit>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("habit", id));

      const habit = doc.habits.find((h) => h.id === id);
      if (!habit) return err(notFound("habit", id));

      return ok(cloneHabit(habit));
    },

    async update(id: HabitId, input: UpdateHabitInput): Promise<Result<Habit>> {
      const validationErr = validateUpdateHabitInput(input);
      if (validationErr) return err(validationErr);

      const doc = catalog.doc();
      if (!doc) return err(notFound("habit", id));

      const index = doc.habits.findIndex((h) => h.id === id);
      if (index === -1) return err(notFound("habit", id));

      const scheduleChanged = input.schedule !== undefined || input.timezone !== undefined;

      catalog.change((doc) => {
        const h = doc.habits[index];
        if (input.title !== undefined) h.title = input.title.trim();
        if (input.description !== undefined) h.description = input.description;
        if (input.schedule !== undefined) h.schedule = input.schedule;
        if (input.timezone !== undefined) h.timezone = input.timezone;
        if (input.endDate !== undefined) h.endDate = input.endDate;
        h.updatedAt = new Date().toISOString();

        if (scheduleChanged) {
          const next = nextOccurrence(h.schedule, h.startDate, h.timezone, h.nextDue, h.endDate);
          if (next) h.nextDue = next;
        }
      });

      const updated = catalog.doc()!.habits[index];
      return ok(cloneHabit(updated));
    },

    async delete(id: HabitId): Promise<Result<void>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("habit", id));

      const index = doc.habits.findIndex((h) => h.id === id);
      if (index === -1) return err(notFound("habit", id));

      catalog.change((doc) => {
        doc.habits.splice(index, 1);
        delete doc.habitLogDocIds[id];
      });

      return ok(undefined);
    },

    async pause(id: HabitId): Promise<Result<Habit>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("habit", id));

      const index = doc.habits.findIndex((h) => h.id === id);
      if (index === -1) return err(notFound("habit", id));

      catalog.change((doc) => {
        doc.habits[index].paused = true;
        doc.habits[index].updatedAt = new Date().toISOString();
      });

      return ok(cloneHabit(catalog.doc()!.habits[index]));
    },

    async resume(id: HabitId): Promise<Result<Habit>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("habit", id));

      const index = doc.habits.findIndex((h) => h.id === id);
      if (index === -1) return err(notFound("habit", id));

      catalog.change((doc) => {
        const h = doc.habits[index];
        h.paused = false;
        h.updatedAt = new Date().toISOString();
        // Recalculate nextDue from today
        const today = todayInTimezone(h.timezone);
        const next = nextOccurrence(h.schedule, h.startDate, h.timezone, today, h.endDate);
        if (next) h.nextDue = next;
      });

      return ok(cloneHabit(catalog.doc()!.habits[index]));
    },

    async check(id: HabitId): Promise<Result<HabitEntry>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("habit", id));

      const habit = doc.habits.find((h) => h.id === id);
      if (!habit) return err(notFound("habit", id));

      const today = todayInTimezone(habit.timezone);

      const logHandle = await getLogHandle(id);
      if (!logHandle) return err(notFound("habit log", id));

      const logDoc = logHandle.doc();
      // If already checked today, return the existing entry (idempotent)
      if (logDoc?.entries[today]?.completed) {
        const entry = logDoc.entries[today];
        return ok({ date: entry.date, completed: entry.completed, checkedAt: entry.checkedAt });
      }

      const entry: HabitEntry = {
        date: today,
        completed: true,
        checkedAt: new Date().toISOString(),
      };

      logHandle.change((doc) => {
        doc.entries[today] = entry;
      });

      return ok(entry);
    },

    async uncheck(id: HabitId): Promise<Result<void>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("habit", id));

      const habit = doc.habits.find((h) => h.id === id);
      if (!habit) return err(notFound("habit", id));

      const today = todayInTimezone(habit.timezone);

      const logHandle = await getLogHandle(id);
      if (!logHandle) return err(notFound("habit log", id));

      const logDoc = logHandle.doc();
      // If not checked today, return success (idempotent)
      if (!logDoc?.entries[today]) return ok(undefined);

      logHandle.change((doc) => {
        delete doc.entries[today];
      });

      return ok(undefined);
    },

    async streak(id: HabitId): Promise<Result<HabitStreak>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("habit", id));

      const habit = doc.habits.find((h) => h.id === id);
      if (!habit) return err(notFound("habit", id));

      const logHandle = await getLogHandle(id);
      if (!logHandle) return err(notFound("habit log", id));

      const logDoc = logHandle.doc();
      const entries = logDoc?.entries ?? {};

      const today = todayInTimezone(habit.timezone);
      const completedToday = entries[today]?.completed === true;

      // Count total check-ins
      let totalCheckins = 0;
      for (const entry of Object.values(entries)) {
        if (entry.completed) totalCheckins++;
      }

      // Compute current streak: count backwards from today through scheduled dates
      let current = 0;
      let checkDate = today;
      while (true) {
        const isScheduled = isScheduledDate(
          habit.schedule,
          habit.startDate,
          habit.timezone,
          checkDate,
          habit.endDate,
        );
        if (isScheduled) {
          if (entries[checkDate]?.completed) {
            current++;
          } else {
            break;
          }
        }
        checkDate = shiftDate(checkDate, -1);
        // Don't go before start date
        if (checkDate < habit.startDate) break;
      }

      // Compute longest streak: scan all entries sorted by date
      const sortedDates = Object.keys(entries)
        .filter((d) => entries[d].completed)
        .sort();

      let longest = 0;
      let streak = 0;
      let prevScheduledDate: string | null = null;

      for (const date of sortedDates) {
        if (
          !isScheduledDate(habit.schedule, habit.startDate, habit.timezone, date, habit.endDate)
        ) {
          continue;
        }

        if (prevScheduledDate === null) {
          streak = 1;
        } else {
          // Check if there's an unscheduled gap
          const hasGap = hasUncompletedScheduledDateBetween(
            habit.schedule,
            habit.startDate,
            habit.timezone,
            prevScheduledDate,
            date,
            entries,
            habit.endDate,
          );
          if (hasGap) {
            streak = 1;
          } else {
            streak++;
          }
        }

        if (streak > longest) longest = streak;
        prevScheduledDate = date;
      }

      return ok({ current, longest, completedToday, totalCheckins });
    },

    async history(id: HabitId, days = 30): Promise<Result<HabitHistoryEntry[]>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("habit", id));

      const habit = doc.habits.find((h) => h.id === id);
      if (!habit) return err(notFound("habit", id));

      const logHandle = await getLogHandle(id);
      if (!logHandle) return err(notFound("habit log", id));

      const logDoc = logHandle.doc();
      const entries = logDoc?.entries ?? {};

      const today = todayInTimezone(habit.timezone);
      const result: HabitHistoryEntry[] = [];

      for (let i = 0; i < days; i++) {
        const date = shiftDate(today, -i);
        if (date < habit.startDate) break;

        const scheduled = isScheduledDate(
          habit.schedule,
          habit.startDate,
          habit.timezone,
          date,
          habit.endDate,
        );
        if (scheduled) {
          result.push({
            date,
            scheduled: true,
            completed: entries[date]?.completed === true,
          });
        }
      }

      return ok(result);
    },
  };
}

// ============================================================================
// Habit processor for processTemplates()
// ============================================================================

export function registerHabitProcessor(catalog: DocHandle<CatalogDocument>, _repo: Repo): void {
  registerProcessor("habit", async (context) => {
    const doc = context.catalog.doc();
    if (!doc?.habits) return 0;

    let processed = 0;

    for (let i = 0; i < doc.habits.length; i++) {
      const habit = doc.habits[i];
      if (habit.paused) continue;

      const today = todayInTimezone(habit.timezone);
      if (habit.nextDue > today) continue;

      // Advance nextDue to today or next scheduled date
      context.catalog.change((d) => {
        const h = d.habits[i];
        const next = nextOccurrence(h.schedule, h.startDate, h.timezone, today, h.endDate);
        if (next) {
          h.nextDue = next;
        }
        h.updatedAt = new Date().toISOString();
      });

      processed++;
    }

    return processed;
  });
}

// ============================================================================
// Date helpers
// ============================================================================

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Check if there's any scheduled date between two dates that lacks a completed entry.
 */
function hasUncompletedScheduledDateBetween(
  schedule: string,
  startDate: string,
  timezone: string,
  from: string,
  to: string,
  entries: Record<string, HabitEntry>,
  endDate?: string,
): boolean {
  let date = shiftDate(from, 1);
  while (date < to) {
    if (isScheduledDate(schedule, startDate, timezone, date, endDate)) {
      if (!entries[date]?.completed) return true;
    }
    date = shiftDate(date, 1);
  }
  return false;
}
