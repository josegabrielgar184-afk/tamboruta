import { Platform } from 'react-native';
import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyAwnzysIaVPTJ4ccJE8FMKFnqyssmz0kQ8',
  authDomain: 'e-rincondedos.firebaseapp.com',
  projectId: 'e-rincondedos',
  storageBucket: 'e-rincondedos.firebasestorage.app',
  messagingSenderId: '233474352081',
  appId: '1:233474352081:web:d1a9d70b9d8c05a291b6f0',
  measurementId: 'G-HJ0D8WH9NH',
};

export const app = initializeApp(firebaseConfig);

let firestoreDb;
if (Platform.OS === 'web') {
  try {
    firestoreDb = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    firestoreDb = getFirestore(app);
  }
} else {
  try {
    firestoreDb = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    firestoreDb = getFirestore(app);
  }
}

export const db = firestoreDb;
export const auth = getAuth(app);
export const storage = getStorage(app);
