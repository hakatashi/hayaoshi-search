import {afterAll, afterEach, beforeAll, expect, test} from 'vitest';
import {cleanup, render, waitFor} from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import {fireEvent} from '@testing-library/dom';
import {Route, Router} from '@solidjs/router';
import {
	createUserWithEmailAndPassword,
	onAuthStateChanged,
	signInWithEmailAndPassword,
	signOut,
} from 'firebase/auth';
import {Timestamp, addDoc} from 'firebase/firestore';
import {Questions, auth} from '~/lib/firebase.js';
import {buildSearchTokensSync} from '~/lib/tokenizer.js';
import Index from './index.js';

const user = userEvent.setup();

// ---------------------------------------------------------------------------
// Auth setup — Firestore rules require hakatasiloving@gmail.com
// ---------------------------------------------------------------------------
beforeAll(async () => {
	try {
		await createUserWithEmailAndPassword(
			auth,
			'hakatasiloving@gmail.com',
			'testpassword123',
		);
	} catch {
		// User already exists in the emulator
	}
	await signInWithEmailAndPassword(
		auth,
		'hakatasiloving@gmail.com',
		'testpassword123',
	);
	// Wait for auth state to propagate so Firestore picks up the token
	await new Promise<void>((resolve) => {
		const unsub = onAuthStateChanged(auth, (u) => {
			if (u?.email === 'hakatasiloving@gmail.com') {
				unsub();
				// Small extra delay for Firestore gRPC to apply the new token
				setTimeout(resolve, 300);
			}
		});
	});
});

afterAll(async () => {
	await signOut(auth);
});

// Explicitly clean up rendered components between tests
afterEach(cleanup);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderIndex() {
	return render(() => (
		<Router>
			<Route path="*" component={Index} />
		</Router>
	));
}

async function addQuestion(data: {
	question: string;
	answer: string;
	explanation?: string;
	majorCategory?: string;
	minorCategory?: string;
	difficulty?: 1 | 2 | 3 | 4 | 5;
	source?: string;
	sourceNumber?: string;
}) {
	await addDoc(Questions, {
		question: data.question,
		answer: data.answer,
		explanation: data.explanation ?? '',
		alternativeAnswers: [],
		majorCategory: data.majorCategory ?? '',
		minorCategory: data.minorCategory ?? '',
		difficulty: (data.difficulty ?? 3) as 1 | 2 | 3 | 4 | 5,
		source: data.source ?? '',
		sourceNumber: data.sourceNumber ?? '',
		searchTokens: buildSearchTokensSync(data.question, data.answer),
		createdAt: Timestamp.now(),
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test('問題がない場合は 0 件と空状態が表示される', async () => {
	const {getByText} = renderIndex();
	await waitFor(
		() => {
			expect(getByText('0 件')).toBeInTheDocument();
			expect(getByText('条件に一致する問題がありません。')).toBeInTheDocument();
		},
		{timeout: 10000},
	);
});

test('追加した問題が一覧に表示される', async () => {
	const {getByText} = renderIndex();

	// Wait for the component to finish its initial load before writing
	await waitFor(() => expect(getByText('0 件')).toBeInTheDocument(), {
		timeout: 10000,
	});

	await addQuestion({
		question: '日本の首都はどこ？',
		answer: '東京',
		majorCategory: '地理',
		difficulty: 2,
		source: 'クイズ大会',
	});

	// Real-time listener should pick up the new document
	await waitFor(
		() => expect(getByText('日本の首都はどこ？')).toBeInTheDocument(),
		{timeout: 10000},
	);
	// Check card content via the closest ancestor to avoid select-option collisions
	const card = getByText('日本の首都はどこ？').closest('a');
	expect(card).toHaveTextContent('地理');
	expect(card).toHaveTextContent('クイズ大会');
});

test('複数の問題が件数とともに表示される', async () => {
	await Promise.all([
		addQuestion({question: '問題A', answer: '答えA'}),
		addQuestion({question: '問題B', answer: '答えB'}),
		addQuestion({question: '問題C', answer: '答えC'}),
	]);

	const {getByText} = renderIndex();

	await waitFor(
		() => {
			expect(getByText('3 件')).toBeInTheDocument();
			expect(getByText('問題A')).toBeInTheDocument();
			expect(getByText('問題B')).toBeInTheDocument();
			expect(getByText('問題C')).toBeInTheDocument();
		},
		{timeout: 10000},
	);
});

test('大カテゴリで絞り込むと該当問題だけ表示される', async () => {
	await Promise.all([
		addQuestion({
			question: '地理の問題',
			answer: '答え1',
			majorCategory: '地理',
		}),
		addQuestion({
			question: '歴史の問題',
			answer: '答え2',
			majorCategory: '歴史',
		}),
	]);

	const {getByText, queryByText, container} = renderIndex();

	await waitFor(() => expect(getByText('2 件')).toBeInTheDocument(), {
		timeout: 10000,
	});

	const selects = container.querySelectorAll('select');
	fireEvent.change(selects[0], {target: {value: '地理'}});

	await waitFor(
		() => {
			// Filtered: shows "1 件 / 2 件中"
			expect(getByText(/^1 件/)).toBeInTheDocument();
			expect(getByText('地理の問題')).toBeInTheDocument();
			expect(queryByText('歴史の問題')).not.toBeInTheDocument();
		},
		{timeout: 10000},
	);
});

test('キーワード検索で絞り込める', async () => {
	await Promise.all([
		addQuestion({question: '東京都の都庁所在地は？', answer: '新宿区'}),
		addQuestion({question: '大阪城を建てたのは誰？', answer: '豊臣秀吉'}),
	]);

	const {getByText, queryByText, getByPlaceholderText} = renderIndex();

	await waitFor(() => expect(getByText('2 件')).toBeInTheDocument(), {
		timeout: 10000,
	});

	const input = getByPlaceholderText(
		'キーワードで検索（日本語あいまい検索対応）',
	);
	await user.type(input, '東京都');

	// Debounce is 300 ms; waitFor polls until the filter applies
	await waitFor(
		() => {
			// Filtered: shows "1 件 / 2 件中"
			expect(getByText(/^1 件/)).toBeInTheDocument();
			expect(getByText('東京都の都庁所在地は？')).toBeInTheDocument();
			expect(queryByText('大阪城を建てたのは誰？')).not.toBeInTheDocument();
		},
		{timeout: 10000},
	);
});

test('クリアボタンでフィルターをリセットできる', async () => {
	await Promise.all([
		addQuestion({
			question: '地理の問題',
			answer: '答え1',
			majorCategory: '地理',
		}),
		addQuestion({
			question: '歴史の問題',
			answer: '答え2',
			majorCategory: '歴史',
		}),
	]);

	const {getByText, queryByText, container} = renderIndex();

	await waitFor(() => expect(getByText('2 件')).toBeInTheDocument(), {
		timeout: 10000,
	});

	const selects = container.querySelectorAll('select');
	fireEvent.change(selects[0], {target: {value: '地理'}});
	await waitFor(() => expect(getByText('クリア')).toBeInTheDocument());

	await user.click(getByText('クリア'));

	await waitFor(() => {
		expect(queryByText('クリア')).not.toBeInTheDocument();
		expect(getByText('2 件')).toBeInTheDocument();
		expect(getByText('地理の問題')).toBeInTheDocument();
		expect(getByText('歴史の問題')).toBeInTheDocument();
	});
});
