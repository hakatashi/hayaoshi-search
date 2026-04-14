import {copyFileSync, existsSync, mkdirSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from '@solidjs/start/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function copyKuromojiDict() {
	return {
		name: 'kuromoji-dict-copy',
		buildStart() {
			const srcDir = path.resolve(__dirname, 'node_modules/kuromoji/dict');
			const destDir = path.resolve(__dirname, 'public/dict');
			if (!existsSync(srcDir)) return;
			if (!existsSync(destDir)) {
				mkdirSync(destDir, {recursive: true});
			}
			for (const file of readdirSync(srcDir)) {
				copyFileSync(path.join(srcDir, file), path.join(destDir, file));
			}
		},
	};
}

export default defineConfig({
	vite: {
		plugins: [copyKuromojiDict()],
		build: {
			target: 'esnext',
		},
		optimizeDeps: {
			include: ['kuromoji', 'papaparse'],
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
