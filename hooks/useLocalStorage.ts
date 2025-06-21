import { useEffect, useState } from "preact/hooks";

export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      if (item === null) {
        return defaultValue;
      }
      try {
        return JSON.parse(item);
      } catch {
        return item as T;
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      const valueToStore =
        typeof value === "string" ? value : JSON.stringify(value);
      localStorage.setItem(key, valueToStore);
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, value]);

  const removeStoredValue = () => {
    try {
      setValue(defaultValue);
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`Error removing localStorage key "${key}":`, error);
    }
  };

  return [value, setValue, removeStoredValue];
}