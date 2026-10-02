import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js';
import { connectFirestoreEmulator, getFirestore, addDoc, collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where, writeBatch } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-functions.js';
import { firebaseConfig } from './firebase-config.js';

const configured = Object.values(firebaseConfig).every(value => typeof value === 'string' && value && !value.startsWith('REPLACE_'));
const emulatorFlag = new URLSearchParams(location.search).get('emulator');
if (emulatorFlag === '1') sessionStorage.setItem('seventaEmulators', '1');
if (emulatorFlag === '0') sessionStorage.removeItem('seventaEmulators');
export const usingFirebaseEmulators = sessionStorage.getItem('seventaEmulators') === '1';
const app = configured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
const functions = app ? getFunctions(app, 'us-central1') : null;

if (usingFirebaseEmulators && auth && db && functions) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

export function requireFirebase() {
  if (!app) throw new Error('Firebase config abhi set nahi hai. firebase-config.js ko Firebase Console values se update karein.');
}

export async function saveAccountProfile({ role, profile }) {
  requireFirebase();
  if (!auth.currentUser) throw new Error('Pehle account mein sign in karein.');
  const user = auth.currentUser;
  const email = String(user.email || '').trim().toLowerCase();
  const accountRef = doc(db, 'accounts', user.uid);
  const profileRef = doc(db, role === 'customer' ? 'customers' : 'workers', user.uid);
  const [accountSnapshot, profileSnapshot] = await Promise.all([getDoc(accountRef), getDoc(profileRef)]);
  if (accountSnapshot.exists() && accountSnapshot.data().role !== role) {
    throw new Error('Is email ka account doosre account type ke liye registered hai.');
  }
  if (profileSnapshot.exists()) return;

  const batch = writeBatch(db);
  if (!accountSnapshot.exists()) {
    batch.set(accountRef, { email, role, createdAt: serverTimestamp() });
  }
  batch.set(profileRef, {
    ...profile,
    email,
    ...(role === 'worker' ? { status: 'pending' } : {}),
    createdAt: serverTimestamp()
  });
  await batch.commit();
}

export async function createAccount({ email, password, role, profile }) {
  requireFirebase();
  let user;
  try {
    user = (await createUserWithEmailAndPassword(auth, email, password)).user;
  } catch (error) {
    if (error.code !== 'auth/email-already-in-use') throw error;
    user = (await signInWithEmailAndPassword(auth, email, password)).user;
  }
  try {
    await saveAccountProfile({ role, profile });
    return user;
  } catch (error) {
    await signOut(auth);
    throw error;
  }
}

export async function reviewWorker({ workerId, status }) {
  requireFirebase();
  const review = httpsCallable(functions, 'reviewWorker');
  try {
    return (await review({ workerId, status })).data;
  } catch (error) {
    if (['functions/internal', 'functions/not-found', 'functions/unavailable'].includes(error.code)) {
      const action = usingFirebaseEmulators
        ? 'Start the local emulators with: firebase emulators:start --only auth,firestore,functions.'
        : 'Deploy it with: firebase deploy --only functions.';
      throw new Error('Worker review service (reviewWorker) is missing or unavailable. ' + action);
    }
    throw error;
  }
}

export { addDoc, collection, doc, getDoc, getDocs, onSnapshot, onAuthStateChanged, query, sendPasswordResetEmail, serverTimestamp, signInWithEmailAndPassword, signOut, updateDoc, where };
