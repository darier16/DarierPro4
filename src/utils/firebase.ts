import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  getDocFromServer,
  query,
  type DocumentData,
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase App singleton
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// CRITICAL: Must pass firestoreDatabaseId from config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Startup connection validation
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("the client is offline")
    ) {
      console.warn("Firebase client appears to be offline. Local cache will be used.");
      return false;
    }
    // Expected if test/connection doesn't exist yet, but server was reached
    return true;
  }
}

// Automatically test connection on module load
testConnection().catch(() => {});

// Cloud Sync Helpers
export interface SyncedUserSettings {
  intervalsAthleteId?: string;
  intervalsApiKey?: string;
  userFtp?: number;
  userWeight?: number;
  openrouterApiKey?: string;
  shiftSchedule?: string;
  theme?: "light" | "dark";
}

export interface CloudGearComponent {
  id: string;
  userId: string;
  bikeId: string;
  bikeName: string;
  name: string;
  category?: string;
  trackingType: "distance_km" | "hours" | "days";
  currentValue: number;
  maxValue: number;
  baseValue: number;
  installedAt: string;
  lastServicedAt?: string;
  brandModel?: string;
  notes?: string;
  updatedAt: string;
}

export interface CloudServiceRecord {
  id: string;
  userId: string;
  componentId?: string;
  componentName: string;
  bikeName?: string;
  serviceDate: string;
  serviceType: string;
  mileageAtService?: number;
  costPln?: number;
  notes?: string;
  createdAt: string;
}

export async function saveUserSettingsToCloud(
  userId: string,
  settings: SyncedUserSettings
): Promise<void> {
  const path = `users/${userId}/settings/default`;
  try {
    await setDoc(
      doc(db, "users", userId, "settings", "default"),
      {
        userId,
        ...settings,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function loadUserSettingsFromCloud(
  userId: string
): Promise<SyncedUserSettings | null> {
  const path = `users/${userId}/settings/default`;
  try {
    const snap = await getDoc(doc(db, "users", userId, "settings", "default"));
    if (snap.exists()) {
      return snap.data() as SyncedUserSettings;
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveComponentsToCloud(
  userId: string,
  components: CloudGearComponent[]
): Promise<void> {
  for (const comp of components) {
    const path = `users/${userId}/components/${comp.id}`;
    try {
      await setDoc(doc(db, "users", userId, "components", comp.id), {
        ...comp,
        userId,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }
}

export async function loadComponentsFromCloud(
  userId: string
): Promise<CloudGearComponent[]> {
  const path = `users/${userId}/components`;
  try {
    const snap = await getDocs(collection(db, "users", userId, "components"));
    const list: CloudGearComponent[] = [];
    snap.forEach((d) => list.push(d.data() as CloudGearComponent));
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveServiceRecordToCloud(
  userId: string,
  record: CloudServiceRecord
): Promise<void> {
  const path = `users/${userId}/service_records/${record.id}`;
  try {
    await setDoc(doc(db, "users", userId, "service_records", record.id), {
      ...record,
      userId,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function loadServiceRecordsFromCloud(
  userId: string
): Promise<CloudServiceRecord[]> {
  const path = `users/${userId}/service_records`;
  try {
    const snap = await getDocs(collection(db, "users", userId, "service_records"));
    const list: CloudServiceRecord[] = [];
    snap.forEach((d) => list.push(d.data() as CloudServiceRecord));
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveActivitiesPayloadToCloud(
  userId: string,
  payloadJson: string
): Promise<void> {
  const path = `users/${userId}/data/cache`;
  try {
    // Limit to 450KB to respect Firestore single document bounds
    const safeJson = payloadJson.length > 450000 ? payloadJson.slice(0, 450000) : payloadJson;
    await setDoc(doc(db, "users", userId, "data", "cache"), {
      userId,
      syncedAt: new Date().toISOString(),
      dataJson: safeJson,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function loadActivitiesPayloadFromCloud(
  userId: string
): Promise<string | null> {
  const path = `users/${userId}/data/cache`;
  try {
    const snap = await getDoc(doc(db, "users", userId, "data", "cache"));
    if (snap.exists()) {
      return (snap.data().dataJson as string) || null;
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export {
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  firebaseSignOut,
  onAuthStateChanged,
  type User,
};
