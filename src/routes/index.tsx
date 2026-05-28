import {A} from '@solidjs/router';
import {
	type DocumentSnapshot,
	limit,
	onSnapshot,
	orderBy,
	type QueryConstraint,
	query,
	startAfter,
	where,
} from 'firebase/firestore';
import {useFirestore} from 'solid-firebase';
import {
	batch,
	type Component,
	createEffect,
	createMemo,
	createSignal,
	For,
	onCleanup,
	Show,
	untrack,
} from 'solid-js';
import {createStore} from 'solid-js/store';
import {OptionsDoc, Questions} from '~/lib/firebase';
import {algoliaClient, ALGOLIA_INDEX_NAME} from '~/lib/algolia';
import {DIFFICULTY_COLORS, DIFFICULTY_LABELS, type Question} from '~/lib/types';
import styles from './index.module.css';

const PAGE_SIZE = 100;

type SearchMode = 'question' | 'all';

const Index: Component = () => {
	const optionsDoc = useFirestore(OptionsDoc);

	const [displayState, setDisplayState] = createStore<{
		loading: boolean;
		error: Error | null;
		data: Question[];
	}>({loading: true, error: null, data: []});

	const [majorCategory, setMajorCategory] = createSignal('');
	const [minorCategory, setMinorCategory] = createSignal('');
	const [difficulty, setDifficulty] = createSignal(0);
	const [source, setSource] = createSignal('');

	// 検索クエリとモード
	const [searchInput, setSearchInput] = createSignal('');
	const [debouncedQuery, setDebouncedQuery] = createSignal('');
	const [searchMode, setSearchMode] = createSignal<SearchMode>('question');

	// 検索入力を 300ms デバウンス
	createEffect(() => {
		const q = searchInput();
		const timer = setTimeout(() => setDebouncedQuery(q), 300);
		onCleanup(() => clearTimeout(timer));
	});

	// カーソルベースのページネーション状態
	const [pageIndex, setPageIndex] = createSignal(0);
	const [pageCursors, setPageCursors] = createSignal<
		(DocumentSnapshot | undefined)[]
	>([undefined]);
	const [hasNextPage, setHasNextPage] = createSignal(false);

	// フィルタまたは検索クエリが変わったらページネーションをリセット
	createEffect(() => {
		majorCategory();
		minorCategory();
		difficulty();
		source();
		debouncedQuery();
		batch(() => {
			setPageIndex(0);
			setPageCursors([undefined]);
			setHasNextPage(false);
		});
	});

	// Algolia 検索 (debouncedQuery が空でない場合)
	createEffect(() => {
		const q = debouncedQuery();
		if (!q) return;

		const mode = searchMode();
		const maj = majorCategory();
		const min = minorCategory();
		const diff = difficulty();
		const src = source();

		setDisplayState('loading', true);

		const filterParts: string[] = [];
		if (maj) filterParts.push(`majorCategory:"${maj}"`);
		if (min) filterParts.push(`minorCategory:"${min}"`);
		if (src) filterParts.push(`source:"${src}"`);

		const numericFilters: string[] = [];
		if (diff) numericFilters.push(`difficulty=${diff}`);

		algoliaClient
			.searchSingleIndex({
				indexName: ALGOLIA_INDEX_NAME,
				searchParams: {
					query: q,
					restrictSearchableAttributes:
						mode === 'question' ? ['question'] : undefined,
					filters:
						filterParts.length > 0 ? filterParts.join(' AND ') : undefined,
					numericFilters:
						numericFilters.length > 0 ? numericFilters : undefined,
					hitsPerPage: PAGE_SIZE,
				},
			})
			.then((result) => {
				setDisplayState({
					loading: false,
					error: null,
					data: result.hits.map((h) => ({
						...(h as unknown as Question),
						id: h.objectID,
					})),
				});
				setHasNextPage(false);
			})
			.catch((err: Error) => {
				setDisplayState({loading: false, error: err, data: []});
			});
	});

	// Firestore クエリ (debouncedQuery が空の場合)
	createEffect(() => {
		const q = debouncedQuery();
		if (q) return; // Algolia 側で処理

		const constraints: QueryConstraint[] = [];
		const maj = majorCategory();
		const min = minorCategory();
		const diff = difficulty();
		const src = source();
		const pi = pageIndex();
		const cursor = untrack(pageCursors)[pi];

		if (maj) constraints.push(where('majorCategory', '==', maj));
		if (min) constraints.push(where('minorCategory', '==', min));
		if (diff) constraints.push(where('difficulty', '==', diff));
		if (src) constraints.push(where('source', '==', src));
		constraints.push(orderBy('createdAt', 'desc'));
		if (cursor) constraints.push(startAfter(cursor));
		constraints.push(limit(PAGE_SIZE + 1));

		setDisplayState('loading', true);

		const firestoreQuery = query(Questions, ...constraints);
		const unsubscribe = onSnapshot(
			firestoreQuery,
			(snapshot) => {
				const docs = snapshot.docs;
				const hasMore = docs.length > PAGE_SIZE;
				const pageDocs = docs.slice(0, PAGE_SIZE);

				setDisplayState({
					loading: false,
					error: null,
					data: pageDocs.map((d) => ({id: d.id, ...d.data()})) as Question[],
				});
				setHasNextPage(hasMore);

				if (hasMore) {
					setPageCursors((prev) => {
						if (prev.length <= pi + 1) {
							return [...prev, docs[PAGE_SIZE - 1]];
						}
						return prev;
					});
				}
			},
			(err) => {
				setDisplayState({loading: false, error: err as Error, data: []});
			},
		);

		onCleanup(unsubscribe);
	});

	const majorCategories = createMemo(
		() => optionsDoc.data?.majorCategories ?? [],
	);

	const minorCategories = createMemo(() => {
		const options = optionsDoc.data;
		if (!options) return [];
		const maj = majorCategory();
		if (maj) return options.minorCategoriesByMajor[maj] ?? [];
		return Object.values(options.minorCategoriesByMajor).flat().sort();
	});

	const sources = createMemo(() => optionsDoc.data?.sources ?? []);

	createEffect(() => {
		majorCategory();
		setMinorCategory('');
	});

	const hasActiveFilter = createMemo(
		() => majorCategory() || minorCategory() || difficulty() || source(),
	);

	const isAlgoliaMode = createMemo(() => debouncedQuery().length > 0);

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
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<circle cx="11" cy="11" r="8" />
						<line x1="21" y1="21" x2="16.65" y2="16.65" />
					</svg>
					<input
						type="text"
						class={styles.searchInput}
						placeholder="キーワードで検索..."
						value={searchInput()}
						onInput={(e) => setSearchInput(e.currentTarget.value)}
					/>
				</div>
				<select
					class={styles.searchModeSelect}
					value={searchMode()}
					onChange={(e) => setSearchMode(e.currentTarget.value as SearchMode)}
				>
					<option value="question">問題文のみ</option>
					<option value="all">全フィールド</option>
				</select>
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
				when={!displayState.loading}
				fallback={
					<div class={styles.loadingPage}>
						<div class={styles.spinner} />
					</div>
				}
			>
				<Show
					when={!displayState.error}
					fallback={
						<div class={styles.errorMsg}>データの読み込みに失敗しました。</div>
					}
				>
					<p class={styles.resultCount}>
						{displayState.data.length} 件
						{!isAlgoliaMode() && hasNextPage() ? '以上' : ''}
						<Show when={isAlgoliaMode()}>
							<span class={styles.algoliaNote}> (Algolia 検索)</span>
						</Show>
					</p>

					<Show
						when={displayState.data.length > 0}
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
							<For each={displayState.data}>
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

						<Show when={!isAlgoliaMode() && (pageIndex() > 0 || hasNextPage())}>
							<div class={styles.pagination}>
								<button
									type="button"
									class={styles.pageBtn}
									disabled={pageIndex() === 0}
									onClick={() => setPageIndex((p) => p - 1)}
								>
									← 前
								</button>
								<span class={styles.pageInfo}>{pageIndex() + 1} ページ</span>
								<button
									type="button"
									class={styles.pageBtn}
									disabled={!hasNextPage()}
									onClick={() => setPageIndex((p) => p + 1)}
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
