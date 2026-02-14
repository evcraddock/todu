import type {
  CreateHabitInput,
  CreateLabelInput,
  CreateNoteInput,
  CreateProjectInput,
  CreateRecurringInput,
  CreateTaskInput,
  Habit,
  HabitEntry,
  HabitFilter,
  HabitHistoryEntry,
  HabitId,
  HabitStreak,
  Label,
  LabelId,
  Note,
  NoteFilter,
  NoteId,
  Project,
  ProjectFilter,
  ProjectId,
  RecurringFilter,
  RecurringId,
  RecurringTemplate,
  Result,
  Task,
  TaskFilter,
  TaskId,
  TaskSortOptions,
  TaskWithDetail,
  UpdateHabitInput,
  UpdateLabelInput,
  UpdateProjectInput,
  UpdateRecurringInput,
  UpdateTaskInput,
} from "@todu/core/browser";
import type { UpcomingOccurrence } from "@todu/engine";

export interface ToduProjectApi {
  list(filter?: ProjectFilter): Promise<Result<Project[]>>;
  get(id: ProjectId): Promise<Result<Project>>;
  create(input: CreateProjectInput): Promise<Result<Project>>;
  update(id: ProjectId, input: UpdateProjectInput): Promise<Result<Project>>;
  delete(id: ProjectId): Promise<Result<void>>;
}

export interface ToduTaskApi {
  list(filter?: TaskFilter, sort?: TaskSortOptions): Promise<Result<Task[]>>;
  get(id: TaskId): Promise<Result<TaskWithDetail>>;
  create(input: CreateTaskInput): Promise<Result<TaskWithDetail>>;
  update(id: TaskId, input: UpdateTaskInput): Promise<Result<TaskWithDetail>>;
  delete(id: TaskId): Promise<Result<void>>;
  move(id: TaskId, projectId: ProjectId): Promise<Result<TaskWithDetail>>;
  search(query: string): Promise<Result<Task[]>>;
}

export interface ToduLabelApi {
  list(): Promise<Result<Label[]>>;
  create(input: CreateLabelInput): Promise<Result<Label>>;
  update(id: LabelId, input: UpdateLabelInput): Promise<Result<Label>>;
  delete(id: LabelId): Promise<Result<void>>;
}

export interface ToduNoteApi {
  list(filter?: NoteFilter): Promise<Result<Note[]>>;
  create(input: CreateNoteInput): Promise<Result<Note>>;
  delete(id: NoteId): Promise<Result<void>>;
}

export interface ToduRecurringApi {
  list(filter?: RecurringFilter): Promise<Result<RecurringTemplate[]>>;
  get(id: RecurringId): Promise<Result<RecurringTemplate>>;
  create(input: CreateRecurringInput): Promise<Result<RecurringTemplate>>;
  update(id: RecurringId, input: UpdateRecurringInput): Promise<Result<RecurringTemplate>>;
  delete(id: RecurringId): Promise<Result<void>>;
  pause(id: RecurringId): Promise<Result<RecurringTemplate>>;
  resume(id: RecurringId): Promise<Result<RecurringTemplate>>;
  upcoming(options?: { templateId?: RecurringId; days?: number }): Promise<
    Result<UpcomingOccurrence[]>
  >;
  generate(templateId: RecurringId, date: string): Promise<Result<Task>>;
  process(): Promise<Result<Task[]>>;
}

export interface ToduHabitApi {
  list(filter?: HabitFilter): Promise<Result<Habit[]>>;
  get(id: HabitId): Promise<Result<Habit>>;
  create(input: CreateHabitInput): Promise<Result<Habit>>;
  update(id: HabitId, input: UpdateHabitInput): Promise<Result<Habit>>;
  delete(id: HabitId): Promise<Result<void>>;
  pause(id: HabitId): Promise<Result<Habit>>;
  resume(id: HabitId): Promise<Result<Habit>>;
  check(id: HabitId): Promise<Result<HabitEntry>>;
  uncheck(id: HabitId): Promise<Result<void>>;
  streak(id: HabitId): Promise<Result<HabitStreak>>;
  history(id: HabitId, days?: number): Promise<Result<HabitHistoryEntry[]>>;
}

export interface OAuthStatus {
  id: string;
  name: string;
  connected: boolean;
  expired: boolean;
}

export interface OAuthEvent {
  type: "auth-opened" | "prompt" | "progress" | "login-complete" | "login-error";
  providerId: string;
  url?: string;
  message?: string;
  placeholder?: string;
}

export interface ToduOAuthApi {
  login(providerId: string): Promise<void>;
  promptResponse(code: string): Promise<void>;
  cancel(): Promise<void>;
  status(): Promise<OAuthStatus[]>;
  disconnect(providerId: string): Promise<void>;
}

export interface ToduAgentApi {
  send(message: string): Promise<void>;
  abort(): Promise<void>;
  clear(): Promise<void>;
  setModel(provider: string, modelId: string): Promise<void>;
}

export interface AgentSettings {
  provider: string;
  modelId: string;
}

export interface ProviderInfo {
  id: string;
  label: string;
  models: { id: string; label: string }[];
}

export interface ToduSettingsApi {
  get(): Promise<AgentSettings>;
  save(settings: AgentSettings): Promise<void>;
  setApiKey(provider: string, key: string): Promise<void>;
  removeApiKey(provider: string): Promise<void>;
  storedProviders(): Promise<Record<string, boolean>>;
  providers(): Promise<ProviderInfo[]>;
}

export interface ToduApi {
  project: ToduProjectApi;
  task: ToduTaskApi;
  label: ToduLabelApi;
  note: ToduNoteApi;
  recurring: ToduRecurringApi;
  habit: ToduHabitApi;
  agent: ToduAgentApi;
  oauth: ToduOAuthApi;
  settings: ToduSettingsApi;
  on(channel: string, callback: (data: unknown) => void): () => void;
}

declare global {
  interface Window {
    todu: ToduApi;
  }
}
