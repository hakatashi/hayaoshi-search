import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from '@solidjs/start/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
	vite: {
		plugins: [],
		build: {
			target: 'esnext',
		},
		optimizeDeps: {
			exclude: [
				'firebase/firestore',
				'@firebase/firestore',
				'firebase/auth',
				'@firebase/auth',
				'firebase/storage',
				'@firebase/storage',
				'firebase/functions',
				'@firebase/functions',
			],
		},
		resolve: {
			// https://github.com/wobsoriano/solid-firebase/issues/11#issuecomment-1467538235
			alias: {
				'@firebase/auth': path.resolve(
					__dirname,
					'node_modules/@firebase/auth/dist/esm/index.js',
				),
				'@firebase/app': path.resolve(
					__dirname,
					'node_modules/@firebase/app/dist/esm/index.esm.js',
				),
			},
		},
	},
	ssr: false,
	server: {
		compatibilityDate: '2024-11-07',
		esbuild: {
			options: {
				supported: {
					'top-level-await': true,
				},
			},
		},
	},
});
