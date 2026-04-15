import {test, expect, describe} from 'vitest';
import {getBigrams, buildSearchTokensSync, matchesTokens} from './tokenizer.js';

describe('getBigrams', () => {
	test('generates bigrams from a simple string', () => {
		const result = getBigrams('abc');
		expect(result).toEqual(['ab', 'bc']);
	});

	test('generates bigrams from Japanese text', () => {
		const result = getBigrams('東京都');
		expect(result).toEqual(['東京', '京都']);
	});

	test('returns empty array for single character', () => {
		const result = getBigrams('a');
		expect(result).toEqual([]);
	});

	test('returns empty array for empty string', () => {
		const result = getBigrams('');
		expect(result).toEqual([]);
	});

	test('deduplicates repeated bigrams', () => {
		// "abab" produces ab, ba, ab — "ab" appears twice
		const result = getBigrams('abab');
		expect(result).toEqual(['ab', 'ba']);
	});

	test('strips whitespace before generating bigrams', () => {
		const withSpaces = getBigrams('東京 都');
		const withoutSpaces = getBigrams('東京都');
		expect(withSpaces).toEqual(withoutSpaces);
	});

	test('strips full-width spaces', () => {
		const withSpaces = getBigrams('東京　都');
		const withoutSpaces = getBigrams('東京都');
		expect(withSpaces).toEqual(withoutSpaces);
	});
});

describe('buildSearchTokensSync', () => {
	test('returns bigrams from both question and answer', () => {
		const tokens = buildSearchTokensSync('東京都', '京都');
		expect(tokens).toContain('東京');
		expect(tokens).toContain('京都');
	});

	test('deduplicates tokens across question and answer', () => {
		const tokens = buildSearchTokensSync('東京', '東京');
		// '東京' is only 2 chars → no bigrams; but verify no duplicates
		const unique = [...new Set(tokens)];
		expect(tokens).toEqual(unique);
	});

	test('returns empty array for empty inputs', () => {
		const tokens = buildSearchTokensSync('', '');
		expect(tokens).toEqual([]);
	});
});

describe('matchesTokens', () => {
	test('returns true when all query tokens are in document tokens', () => {
		expect(matchesTokens(['東京', '大阪', '名古屋'], ['東京', '大阪'])).toBe(
			true,
		);
	});

	test('returns false when a query token is missing', () => {
		expect(matchesTokens(['東京', '大阪'], ['東京', '福岡'])).toBe(false);
	});

	test('returns true for empty query tokens', () => {
		expect(matchesTokens(['東京'], [])).toBe(true);
	});

	test('returns true for empty doc tokens with empty query', () => {
		expect(matchesTokens([], [])).toBe(true);
	});

	test('returns false for empty doc tokens with non-empty query', () => {
		expect(matchesTokens([], ['東京'])).toBe(false);
	});

	test('matches when doc token contains query token (partial match)', () => {
		// dt.includes(qt): '東京都' includes '東京'
		expect(matchesTokens(['東京都'], ['東京'])).toBe(true);
	});

	test('matches when query token contains doc token (partial match)', () => {
		// qt.includes(dt): query '東京都' includes doc '東京'
		expect(matchesTokens(['東京'], ['東京都'])).toBe(true);
	});
});
