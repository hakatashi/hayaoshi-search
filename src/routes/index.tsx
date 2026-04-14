import {
	For,
	Show,
	createEffect,
	createMemo,
	createSignal,
	type Component,
} from 'solid-js';
import {A} from '@solidjs/router';
import {useFirestore} from 'solid-firebase';
import {orderBy, query} from 'firebase/firestore';
import {Questions} from '~/lib/firebase';
import {DIFFICULTY_COLORS, DIFFICULTY_LABELS, type Question} from '~/lib/types';
import {getBigrams, matchesTokens, tokenize} from '~/lib/tokenizer';
import styles from './index.module.css';

const PAGE_SIZE = 100;

const Index: Component = () => {
	const allQuestions = useFirestore(
		query(Questions, orderBy('createdAt', 'desc')),
	);

	const [keyword, setKeyword] = createSignal('');
	const [debouncedKeyword, setDebouncedKeyword] = createSignal('');
	const [majorCategory, setMajorCategory] = createSignal('');
	const [minorCategory, setMinorCategory] = createSignal('');
	const [difficulty, setDifficulty] = createSignal(0);
	const [source, setSource] = createSignal('');
	const [queryTokens, setQueryTokens] = createSignal<string[]>([]);
	const [page, setPage] = createSignal(1);

	// Debounce keyword input
	let keywordTimer: ReturnType<typeof setTimeout>;
	createEffect(() => {
		const kw = keyword();
		clearTimeout(keywordTimer);
		keywordTimer = setTimeout(() => setDebouncedKeyword(kw), 300);
	});

	// Tokenize debounced keyword (kuromoji, async)
	createEffect(async () => {
		const kw = debouncedKeyword().trim();
		if (!kw) {
			setQueryTokens([]);
			return;
		}
		const tokens = await tokenize(kw);
		setQueryTokens(tokens);
	});

	const majorCategories = createMemo(() =>
		[
			...new Set(
				(allQuestions.data ?? []).map((q) => q.majorCategory).filter(Boolean),
			),
		].sort(),
	);

	const minorCategories = createMemo(() => {
		const data = allQuestions.data ?? [];
		const filtered = majorCategory()
			? data.filter((q) => q.majorCategory === majorCategory())
			: data;
		return [
			...new Set(filtered.map((q) => q.minorCategory).filter(Boolean)),
		].sort();
	});

	const sources = createMemo(() =>
		[
			...new Set(
				(allQuestions.data ?? []).map((q) => q.source).filter(Boolean),
			),
		].sort(),
	);

	// Reset page and minor category when parent filters change
	createEffect(() => {
		majorCategory();
		setMinorCategory('');
		setPage(1);
	});
	createEffect(() => {
		debouncedKeyword();
		minorCategory();
		difficulty();
		source();
		setPage(1);
	});

	const filteredQuestions = createMemo(() => {
		const data = allQuestions.data ?? [];
		const kw = debouncedKeyword().trim();
		const tokens = queryTokens();
		const maj = majorCategory();
		const min = minorCategory();
		const diff = difficulty();
		const src = source();

		return data.filter((q: Question) => {
			if (maj && q.majorCategory !== maj) return false;
			if (min && q.minorCategory !== min) return false;
			if (diff && q.difficulty !== diff) return false;
			if (src && q.source !== src) return false;

			if (kw) {
				if (tokens.length > 0 && q.searchTokens?.length) {
					if (!matchesTokens(q.searchTokens, tokens)) return false;
				} else {
					const docText = `${q.question} ${q.answer} ${q.explanation ?? ''}`;
					const docBigrams = getBigrams(docText);
					const kwBigrams = getBigrams(kw);
					if (kwBigrams.length > 0 && !matchesTokens(docBigrams, kwBigrams))
						return false;
				}
			}

			return true;
		});
	});

	const totalPages = createMemo(() =>
		Math.max(1, Math.ceil(filteredQuestions().length / PAGE_SIZE)),
	);

	const pagedQuestions = createMemo(() => {
		const p = page();
		return filteredQuestions().slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
	});

	const hasActiveFilter = createMemo(
		() =>
			majorCategory() ||
			minorCategory() ||
			difficulty() ||
			keyword() ||
			source(),
	);

	return (
		<div>
			<div class={styles.header}>
				<h1 class={styles.title}>問題一覧</h1>
				<A href="/questions/new" class={styles.addBtn}>
					+ 問題追加
				</A>
			</div>

			<div class={styles.searchBar}>
				<div class={styles.searchInputWrapper}>
					<svg
						class={styles.searchIcon}
						width="16"
						height="16"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<title>検索</title>
						<path
							fill-rule="evenodd"
							d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
							clip-rule="evenodd"
						/>
					</svg>
					<input
						type="text"
						class={styles.searchInput}
						placeholder="キーワードで検索（日本語あいまい検索対応）"
						value={keyword()}
						onInput={(e) => setKeyword(e.currentTarget.value)}
					/>
				</div>
			</div>

			<div class={styles.filters}>
				<select
					class={styles.filterSelect}
					value={majorCategory()}
					onChange={(e) => setMajorCategory(e.currentTarget.value)}
				>
					<option value="">大カテゴリ: すべて</option>
					<For each={majorCategories()}>
						{(cat) => <option value={cat}>{cat}</option>}
					</For>
				</select>

				<select
					class={styles.filterSelect}
					value={minorCategory()}
					onChange={(e) => setMinorCategory(e.currentTarget.value)}
				>
					<option value="">小カテゴリ: すべて</option>
					<For each={minorCategories()}>
						{(cat) => <option value={cat}>{cat}</option>}
					</For>
				</select>

				<select
					class={styles.filterSelect}
					value={difficulty()}
					onChange={(e) => setDifficulty(Number(e.currentTarget.value))}
				>
					<option value={0}>難易度: すべて</option>
					<For each={[1, 2, 3, 4, 5]}>
						{(level) => (
							<option value={level}>
								{level} - {DIFFICULTY_LABELS[level]}
							</option>
						)}
					</For>
				</select>

				<select
					class={styles.filterSelect}
					value={source()}
					onChange={(e) => setSource(e.currentTarget.value)}
				>
					<option value="">出典: すべて</option>
					<For each={sources()}>
						{(src) => <option value={src}>{src}</option>}
					</For>
				</select>

				<Show when={hasActiveFilter()}>
					<button
						type="button"
						class={styles.clearBtn}
						onClick={() => {
							setKeyword('');
							setDebouncedKeyword('');
							setMajorCategory('');
							setMinorCategory('');
							setDifficulty(0);
							setSource('');
						}}
					>
						クリア
					</button>
				</Show>
			</div>

			<Show
				when={!allQuestions.loading}
				fallback={
					<div class={styles.loadingPage}>
						<div class={styles.spinner} />
					</div>
				}
			>
				<Show
					when={!allQuestions.error}
					fallback={
						<div class={styles.errorMsg}>データの読み込みに失敗しました。</div>
					}
				>
					<p class={styles.resultCount}>
						{filteredQuestions().length} 件
						{allQuestions.data &&
						allQuestions.data.length !== filteredQuestions().length
							? ` / ${allQuestions.data.length} 件中`
							: ''}
					</p>

					<Show
						when={filteredQuestions().length > 0}
						fallback={
							<div class={styles.emptyState}>
								<p>条件に一致する問題がありません。</p>
								<A href="/questions/new" class={styles.addBtn}>
									問題を追加する
								</A>
							</div>
						}
					>
						<div class={styles.list}>
							<For each={pagedQuestions()}>
								{(q) => (
									<A href={`/questions/${q.id}`} class={styles.questionCard}>
										<div class={styles.questionText}>{q.question}</div>
										<div class={styles.answerPreview}>
											答え: <strong>{q.answer}</strong>
										</div>
										<div class={styles.meta}>
											<Show when={q.majorCategory}>
												<span class={`${styles.badge} ${styles.categoryBadge}`}>
													{q.majorCategory}
												</span>
											</Show>
											<Show when={q.minorCategory}>
												<span class={`${styles.badge} ${styles.categoryBadge}`}>
													{q.minorCategory}
												</span>
											</Show>
											<Show when={q.difficulty}>
												<span
													class={`${styles.badge} ${styles.difficultyBadge}`}
													style={`background: ${DIFFICULTY_COLORS[q.difficulty]}`}
												>
													{DIFFICULTY_LABELS[q.difficulty]}
												</span>
											</Show>
											<Show when={q.source}>
												<span class={`${styles.badge} ${styles.sourceBadge}`}>
													{q.source}
													{q.sourceNumber ? ` #${q.sourceNumber}` : ''}
												</span>
											</Show>
										</div>
									</A>
								)}
							</For>
						</div>

						<Show when={totalPages() > 1}>
							<div class={styles.pagination}>
								<button
									type="button"
									class={styles.pageBtn}
									disabled={page() === 1}
									onClick={() => setPage((p) => p - 1)}
								>
									← 前
								</button>
								<span class={styles.pageInfo}>
									{page()} / {totalPages()} ページ
								</span>
								<button
									type="button"
									class={styles.pageBtn}
									disabled={page() === totalPages()}
									onClick={() => setPage((p) => p + 1)}
								>
									次 →
								</button>
							</div>
						</Show>
					</Show>
				</Show>
			</Show>
		</div>
	);
};

export default Index;
