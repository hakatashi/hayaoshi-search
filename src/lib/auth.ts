import {createSignal, onCleanup} from 'solid-js';
import {type User, onAuthStateChanged} from 'firebase/auth';
import {auth} from './firebase';
import {AUTHORIZED_EMAIL} from './types';

/**
 * Returns reactive auth state signals.
 * Must be called inside a component or reactive scope.
 */
export function createAuthState() {
	const [user, setUser] = createSignal<User | null | undefined>(undefined);

	const unsubscribe = onAuthStateChanged(auth, (u) => {
		setUser(u);
	});

	onCleanup(unsubscribe);

	const loading = () => user() === undefined;
	const isAuthorized = () =>
		user() !== null &&
		user() !== undefined &&
		user()?.email === AUTHORIZED_EMAIL;

	return {user, loading, isAuthorized};
}
