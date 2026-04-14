import {FirebaseProvider} from 'solid-firebase';
import {Router} from '@solidjs/router';
import {FileRoutes} from '@solidjs/start/router';
import app from '~/lib/firebase';
import Layout from '~/components/Layout';
import './app.css';

export default function App() {
	return (
		<FirebaseProvider app={app}>
			<Router root={Layout}>
				<FileRoutes />
			</Router>
		</FirebaseProvider>
	);
}
