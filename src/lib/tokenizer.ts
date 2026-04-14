// Japanese morphological analyzer using kuromoji.
// Falls back to character bigrams if kuromoji fails to initialize.

type KuromojiToken = {
	surface_form: string;
	basic_form: string;
	pos: string;
	pos_detail_1: string;
};

type KuromojiTokenizer = {
	tokenize: (text: string) => KuromojiToken[];
};

let tokenizerInstance: KuromojiTokenizer | null = null;
let initPromise: Promise<KuromojiTokenizer> | null = null;

async function getTokenizer(): Promise<KuromojiTokenizer> {
	if (tokenizerInstance) return tokenizerInstance;
	if (initPromise) return initPromise;

	initPromise = new Promise((resolve, reject) => {
		import('kuromoji')
			.then(({default: kuromoji}) => {
				kuromoji
					.builder({dicPath: '/dict'})
					.build((err: Error | null, t: KuromojiTokenizer) => {
						if (err) {
							reject(err);
						} else {
							tokenizerInstance = t;
							resolve(t);
						}
					});
			})
			.catch(reject);
	});

	return initPromise;
}

// Content POS categories to include in search tokens
const CONTENT_POS = ['名詞', '動詞', '形容詞', '形容動詞'];
// Sub-categories of nouns to ignore
const IGNORABLE_NOUN_SUBTYPES = ['非自立', '代名詞', '数', '接尾'];

/**
 * Tokenize text using kuromoji, returning base forms of content words.
 * Falls back to character bigrams on error.
 */
export async function tokenize(text: string): Promise<string[]> {
	try {
		const t = await getTokenizer();
		const tokens = t.tokenize(text);
		const forms: string[] = [];

		for (const token of tokens) {
			if (!CONTENT_POS.includes(token.pos)) continue;
			if (
				token.pos === '名詞' &&
				IGNORABLE_NOUN_SUBTYPES.includes(token.pos_detail_1)
			)
				continue;

			const form =
				token.basic_form === '*' ? token.surface_form : token.basic_form;
			if (form && form.length >= 1) {
				forms.push(form);
			}
		}

		// Also include bigrams as supplemental tokens for partial matching
		const bigrams = getBigrams(text);
		return [...new Set([...forms, ...bigrams])];
	} catch {
		// Fallback: use character bigrams only
		return getBigrams(text);
	}
}

/**
 * Generate character bigrams for partial matching.
 * Used as fallback when kuromoji is unavailable.
 */
export function getBigrams(text: string): string[] {
	const clean = text.replace(/[\s　]+/g, '');
	const bigrams: string[] = [];
	for (let i = 0; i < clean.length - 1; i++) {
		bigrams.push(clean.slice(i, i + 2));
	}
	return [...new Set(bigrams)];
}

/**
 * Build search tokens for a question synchronously using bigrams.
 * Used when saving a question before kuromoji has been initialized.
 */
export function buildSearchTokensSync(
	question: string,
	answer: string,
): string[] {
	return [...new Set([...getBigrams(question), ...getBigrams(answer)])];
}

/**
 * Build search tokens using kuromoji (async).
 * Should be called when saving a question.
 */
export async function buildSearchTokens(
	question: string,
	answer: string,
): Promise<string[]> {
	const [qTokens, aTokens] = await Promise.all([
		tokenize(question),
		tokenize(answer),
	]);
	return [...new Set([...qTokens, ...aTokens])];
}

/**
 * Check if a document's searchTokens match the given query tokens.
 * Returns true if all query tokens appear in the document tokens.
 */
export function matchesTokens(
	docTokens: string[],
	queryTokens: string[],
): boolean {
	if (queryTokens.length === 0) return true;
	return queryTokens.every((qt) =>
		docTokens.some((dt) => dt.includes(qt) || qt.includes(dt)),
	);
}
