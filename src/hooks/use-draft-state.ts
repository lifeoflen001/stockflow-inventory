import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

const DRAFT_PREFIX = "stockflow:draft:";

function readDraft<T>(key: string, initialValue: T): T {
  try {
    const stored = sessionStorage.getItem(`${DRAFT_PREFIX}${key}`);
    return stored ? (JSON.parse(stored) as T) : initialValue;
  } catch {
    return initialValue;
  }
}

function isInitialValue<T>(value: T, initialValue: T) {
  try {
    return JSON.stringify(value) === JSON.stringify(initialValue);
  } catch {
    return false;
  }
}

/** Keeps unfinished operational form values available across a lock/remount. */
export function useDraftState<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(() => readDraft(key, initialValue));

  useEffect(() => {
    try {
      const storageKey = `${DRAFT_PREFIX}${key}`;
      if (isInitialValue(value, initialValue)) sessionStorage.removeItem(storageKey);
      else sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Draft persistence is best effort when storage is unavailable or full.
    }
  }, [key, value, initialValue]);

  return [value, setValue];
}
