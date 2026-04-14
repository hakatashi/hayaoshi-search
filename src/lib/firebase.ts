import {isServer} from 'solid-js/web';
import {initializeApp} from 'firebase/app';
import {connectAuthEmulator, getAuth, signInAnonymously} from 'firebase/auth';
import {
	getFirestore,
	connectFirestoreEmulator,
	collection,
	type CollectionReference,
} from 'firebase/firestore';
import type {Task} from './schema.ts';

const firebaseConfigResponse = await fetch('/__/firebase/init.json');
const firebaseConfig = await firebaseConfigResponse.json();

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

if (import.meta.env.DEV && !isServer) {
	connectFirestoreEmulator(db, 'localhost', 8080);
	connectAuthEmulator(auth, 'http://localhost:9099');
}

const Tasks = collection(db, 'tasks') as CollectionReference<Task>;

await signInAnonymously(auth);

export {app as default, auth, db, Tasks};
