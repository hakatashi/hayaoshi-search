import path from 'node:path';
import solid from 'vite-plugin-solid';
import {defineConfig} from 'vitest/config';

export default defineConfig({
	plugins: [solid({hot: false})],
	resolve: {
		conditions: ['development', 'browser'],
		alias: {
			'~': path.resolve(__dirname, 'src'),
		},
	},
	test: {
		environment: 'jsdom',
		globals: true,
		setupFiles: ['./vitest.setup.ts'],
		testTimeout: 30000,
		hookTimeout: 30000,
		// Serial execution to avoid emulator conflicts
		maxWorkers: 1,
		maxConcurrency: 1,
	},
});
