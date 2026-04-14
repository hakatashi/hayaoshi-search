// @refresh reload
import {mount, StartClient} from '@solidjs/start/client';

const rootElement = document.getElementById('app');
if (!rootElement) {
	throw new Error('Root element not found');
}

mount(() => <StartClient />, rootElement);
