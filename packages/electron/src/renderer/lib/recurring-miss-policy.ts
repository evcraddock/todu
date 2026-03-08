import type { RecurringMissPolicy } from "@todu/core/browser";

export const RECURRING_MISS_POLICY_OPTIONS: Array<{
  value: RecurringMissPolicy;
  label: string;
}> = [
  {
    value: "accumulate",
    label: "accumulate — missed occurrences stack and catch up",
  },
  {
    value: "rollForward",
    label: "rollForward — only the latest due occurrence stays actionable",
  },
];

const RECURRING_MISS_POLICY_EXPLANATIONS: Record<RecurringMissPolicy, string> = {
  accumulate: "Missed occurrences stack and catch up.",
  rollForward: "Only the latest due occurrence stays actionable.",
};

const RECURRING_MISS_POLICY_SHORT_LABELS: Record<RecurringMissPolicy, string> = {
  accumulate: "stacks missed occurrences",
  rollForward: "latest due only",
};

export function getRecurringMissPolicy(value: {
  missPolicy?: RecurringMissPolicy;
}): RecurringMissPolicy {
  return value.missPolicy ?? "accumulate";
}

export function getRecurringMissPolicyExplanation(policy: RecurringMissPolicy): string {
  return RECURRING_MISS_POLICY_EXPLANATIONS[policy];
}

export function getRecurringMissPolicyShortLabel(policy: RecurringMissPolicy): string {
  return RECURRING_MISS_POLICY_SHORT_LABELS[policy];
}
