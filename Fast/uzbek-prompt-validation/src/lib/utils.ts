import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function slugifyLabel(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeComparableText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

export function tokenizeComparableText(value: string | null | undefined) {
  return normalizeComparableText(value)
    .split(" ")
    .filter(Boolean);
}

export function jaccardSimilarity(left: string | null | undefined, right: string | null | undefined) {
  const a = new Set(tokenizeComparableText(left));
  const b = new Set(tokenizeComparableText(right));

  if (a.size === 0 && b.size === 0) {
    return 1;
  }

  const intersection = new Set([...a].filter((token) => b.has(token))).size;
  const union = new Set([...a, ...b]).size;

  return union === 0 ? 0 : intersection / union;
}

export function deterministicPercentBucket(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash) % 100;
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
