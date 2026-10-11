"use client";

import { useCallback, useEffect, useState } from "react";
import {
  forgetChoice,
  mergeProfiles,
  profileEntryCount,
  profileKeyFor,
  recordSelection,
  sanitizeProfile,
  setAlwaysApply as setAlwaysApplyChoice,
  type LearningContext,
} from "@/engine/learning";
import type { LearningProfile } from "@/engine/types";

/**
 * Browser-local storage for the personal learning profile. Uses IndexedDB
 * (structured, no size squeeze) and falls back to localStorage when
 * IndexedDB is unavailable, e.g. in tests or hardened browsers.
 */

const DB_NAME = "sac-learning";
const DB_VERSION = 1;
const STORE = "profiles";
const LOCAL_KEY = "sac:learning-profile:v1";


function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
  });
}

async function idbLoadAll(): Promise<LearningProfile> {
  const database = await openDatabase();
  try {
    const profile: LearningProfile = {};
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      const keysRequest = tx.objectStore(STORE).getAllKeys();
      request.onerror = () => reject(request.error);
      keysRequest.onerror = () => reject(keysRequest.error);
      request.onsuccess = () => {
        keysRequest.onsuccess = () => {
          const keys = keysRequest.result;
          request.result.forEach((value, index) => {
            const key = keys[index];
            if (typeof key === "string") {
              profile[key] = sanitizeProfile({ [key]: value })[key];
            }
          });
          resolve();
        };
      };
    });
    return profile;
  } finally {
    database.close();
  }
}

async function idbPut(key: string, value: LearningProfile[string]): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
}

async function idbDelete(key: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
}

async function idbClear(): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
}

function localRead(): LearningProfile {
  try {
    return sanitizeProfile(JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

function localWrite(profile: LearningProfile): void {
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(profile));
}

export interface LearningProfileApi {
  /** Undefined while loading from storage. */
  profile?: LearningProfile;
  storageMode: "indexeddb" | "localstorage" | "loading";
  record: (
    context: LearningContext,
    choiceId: string,
    confirmed: boolean,
    datasetVersion?: string,
  ) => Promise<void>;
  /** The user's explicit "Always use this meaning in this context" switch. */
  setAlwaysApply: (context: LearningContext, choiceId: string, value: boolean) => Promise<void>;
  forget: (context: LearningContext, choiceId: string) => Promise<void>;
  resetAll: () => Promise<void>;
  exportProfile: () => string;
  importProfile: (json: string) => { entries: number };
}

export function useLearningProfile(): LearningProfileApi {
  const [profile, setProfile] = useState<LearningProfile | undefined>(undefined);
  const [storageMode, setStorageMode] = useState<LearningProfileApi["storageMode"]>("loading");
  const [useIdb, setUseIdb] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await idbLoadAll();
        if (!cancelled) {
          setProfile(loaded);
          setStorageMode("indexeddb");
        }
      } catch {
        if (!cancelled) {
          setProfile(localRead());
          setUseIdb(false);
          setStorageMode("localstorage");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const record = useCallback(
    async (context: LearningContext, choiceId: string, confirmed: boolean, datasetVersion?: string) => {
      if (!profile) return;
      const key = profileKeyFor(context);
      const next = recordSelection(profile, context, choiceId, confirmed, datasetVersion);
      setProfile(next);
      try {
        if (useIdb) await idbPut(key, next[key]);
        else localWrite(next);
      } catch {
        localWrite(next);
      }
    },
    [profile, useIdb],
  );

  const setAlwaysApply = useCallback(
    async (context: LearningContext, choiceId: string, value: boolean) => {
      if (!profile) return;
      const key = profileKeyFor(context);
      const next = setAlwaysApplyChoice(profile, context, choiceId, value);
      setProfile(next);
      try {
        if (useIdb) await idbPut(key, next[key]);
        else localWrite(next);
      } catch {
        localWrite(next);
      }
    },
    [profile, useIdb],
  );

  const forget = useCallback(
    async (context: LearningContext, choiceId: string) => {
      if (!profile) return;
      const key = profileKeyFor(context);
      const next = forgetChoice(profile, context, choiceId);
      setProfile(next);
      try {
        if (useIdb) {
          if (next[key]) await idbPut(key, next[key]);
          else await idbDelete(key);
        } else {
          localWrite(next);
        }
      } catch {
        localWrite(next);
      }
    },
    [profile, useIdb],
  );

  const resetAll = useCallback(async () => {
    setProfile({});
    try {
      if (useIdb) await idbClear();
    } catch {
      // Fall through — the local mirror is cleared below as well.
    }
    localWrite({});
  }, [useIdb]);

  const exportProfile = useCallback(() => JSON.stringify(profile ?? {}, null, 2), [profile]);

  const importProfile = useCallback(
    (json: string) => {
      const incoming = sanitizeProfile(JSON.parse(json));
      const base = profile ?? {};
      const next = mergeProfiles(base, incoming);
      setProfile(next);
      if (useIdb) {
        for (const [key, entry] of Object.entries(next)) {
          void idbPut(key, entry).catch(() => localWrite(next));
        }
      } else {
        localWrite(next);
      }
      return { entries: profileEntryCount(next) };
    },
    [profile, useIdb],
  );

  return { profile, storageMode, record, setAlwaysApply, forget, resetAll, exportProfile, importProfile };
}
