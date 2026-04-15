import {beforeEach, vi} from 'vitest';
import '@testing-library/jest-dom';

const originalFetch = global.fetch;
const fetchMock = vi.fn<typeof fetch>((...args) => {
	const [url] = args;
	if (url === '/__/firebase/init.json') {
		return Promise.resolve(
			new Response(
				JSON.stringify({
					apiKey: 'fakeApiKey',
					projectId: 'hayaoshi-search',
				}),
			),
		);
	}
	return originalFetch(...args);
});
vi.stubGlobal('fetch', fetchMock);

beforeEach(async () => {
	// Reset firestore data
	await originalFetch(
		'http://localhost:8080/emulator/v1/projects/hayaoshi-search/databases/(default)/documents',
		{
			method: 'DELETE',
		},
	);
	// Wait a bit for the deletion to complete
	await new Promise((resolve) => setTimeout(resolve, 1000));
});
