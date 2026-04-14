import {isServer} from 'solid-js/web';
import {initializeApp} from 'firebase/app';
import {GoogleAuthProvider, connectAuthEmulator, getAuth} from 'firebase/auth';
import {
	type CollectionReference,
	collection,
	connectFirestoreEmulator,
	getFirestore,
} from 'firebase/firestore';
import type {Question} from './types.ts';

const firebaseConfigResponse = await fetch('/__/firebase/init.json');
const firebaseConfig = await firebaseConfigResponse.json();

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

if (import.meta.env.DEV && !isServer) {
	connectFirestoreEmulator(db, 'localhost', 8080);
	// Note: Google sign-in popup does not work with the auth emulator.
	// To test locally, create a user via the Firebase Emulator UI (localhost:4000).
	connectAuthEmulator(auth, 'http://localhost:9099');
}

const googleProvider = new GoogleAuthProvider();

const Questions = collection(db, 'questions') as CollectionReference<Question>;

export {app as default, auth, db, googleProvider, Questions};
