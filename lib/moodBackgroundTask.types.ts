// Structural types for the lazily-required `expo-task-manager` /
// `expo-background-fetch` native modules. Kept as a sibling so the
// background-task orchestrator stays focused on control flow.

export type TaskManagerLike = {
  defineTask?: (name: string, handler: () => Promise<unknown>) => void;
  isTaskRegisteredAsync?: (name: string) => Promise<boolean>;
  unregisterTaskAsync?: (name: string) => Promise<void>;
};

export type BackgroundFetchLike = {
  BackgroundFetchResult?: {
    NewData?: unknown;
    NoData?: unknown;
    Failed?: unknown;
  };
  registerTaskAsync?: (
    name: string,
    options: { minimumInterval: number; stopOnTerminate?: boolean; startOnBoot?: boolean },
  ) => Promise<void>;
  unregisterTaskAsync?: (name: string) => Promise<void>;
  getStatusAsync?: () => Promise<number | null>;
};
