import { useCallback, useEffect, useMemo, useState } from "react";

/*
Инструкция:
1. Скопируйте файл в src/modules/persistent-state.js.
2. Используйте usePersistentState("key", initialValue) вместо useState.
3. Для временного состояния используйте useSessionState.
*/

const memoryStore = new Map();

const memoryStorage = {
  getItem: (key) => (memoryStore.has(key) ? memoryStore.get(key) : null),
  setItem: (key, value) => memoryStore.set(key, value),
  removeItem: (key) => memoryStore.delete(key),
};

function canUseWindow() {
  return typeof window !== "undefined";
}

function resolveInitial(initialValue) {
  return typeof initialValue === "function" ? initialValue() : initialValue;
}

function getStorage(type) {
  if (!canUseWindow()) return memoryStorage;

  try {
    const storage = type === "session" ? window.sessionStorage : window.localStorage;
    const testKey = "__react_modules_storage_test__";
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);
    return storage;
  } catch {
    return memoryStorage;
  }
}

function makeKey(key, namespace) {
  return namespace ? `${namespace}:${key}` : key;
}

function packValue(value, version) {
  return {
    value,
    version,
    updatedAt: new Date().toISOString(),
  };
}

function unpackValue(raw, initialValue, options) {
  if (raw === null || raw === undefined) return resolveInitial(initialValue);

  try {
    const parsed = options.deserialize(raw);

    if (!parsed || typeof parsed !== "object" || !Object.prototype.hasOwnProperty.call(parsed, "value")) {
      return parsed;
    }

    if (options.version !== undefined && parsed.version !== options.version) {
      return options.migrate
        ? options.migrate(parsed.value, parsed.version)
        : resolveInitial(initialValue);
    }

    return parsed.value;
  } catch {
    return resolveInitial(initialValue);
  }
}

export function usePersistentState(key, initialValue, options = {}) {
  const {
    namespace = "",
    storage: storageType = "local",
    version,
    migrate,
    syncTabs = true,
    removeOnNull = false,
    serialize = JSON.stringify,
    deserialize = JSON.parse,
  } = options;

  const storage = useMemo(() => getStorage(storageType), [storageType]);
  const storageKey = makeKey(key, namespace);
  const readOptions = useMemo(
    () => ({ version, migrate, deserialize }),
    [version, migrate, deserialize]
  );

  const readValue = useCallback(
    () => unpackValue(storage.getItem(storageKey), initialValue, readOptions),
    [initialValue, readOptions, storage, storageKey]
  );

  const [value, setValue] = useState(readValue);

  const writeValue = useCallback(
    (nextValue) => {
      setValue((current) => {
        const resolved = typeof nextValue === "function" ? nextValue(current) : nextValue;

        try {
          if (removeOnNull && (resolved === null || resolved === undefined)) {
            storage.removeItem(storageKey);
          } else {
            storage.setItem(storageKey, serialize(packValue(resolved, version)));
          }
        } catch {
          // The in-memory state still updates even if browser storage is full or blocked.
        }

        return resolved;
      });
    },
    [removeOnNull, serialize, storage, storageKey, version]
  );

  const removeValue = useCallback(() => {
    storage.removeItem(storageKey);
    setValue(resolveInitial(initialValue));
  }, [initialValue, storage, storageKey]);

  useEffect(() => {
    setValue(readValue());
  }, [readValue]);

  useEffect(() => {
    if (!syncTabs || !canUseWindow() || storage === memoryStorage) return undefined;

    const handleStorage = (event) => {
      if (event.storageArea !== storage || event.key !== storageKey) return;
      setValue(unpackValue(event.newValue, initialValue, readOptions));
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [initialValue, readOptions, storage, storageKey, syncTabs]);

  return [value, writeValue, removeValue];
}

export function useSessionState(key, initialValue, options = {}) {
  return usePersistentState(key, initialValue, { ...options, storage: "session" });
}

export function clearPersistentState(key, options = {}) {
  const storage = getStorage(options.storage || "local");
  storage.removeItem(makeKey(key, options.namespace));
}

export function createNamespacedStorage(namespace, options = {}) {
  return {
    useState(key, initialValue, hookOptions = {}) {
      return usePersistentState(key, initialValue, {
        ...options,
        ...hookOptions,
        namespace,
      });
    },
    clear(key) {
      clearPersistentState(key, { ...options, namespace });
    },
  };
}

