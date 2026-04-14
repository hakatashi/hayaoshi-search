export function GET() {
	if (!import.meta.env.DEV) {
		return new Response(null, {status: 404});
	}

	return fetch('http://localhost:5000/__/firebase/init.json');
}
