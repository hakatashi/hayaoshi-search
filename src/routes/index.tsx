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
import {DIFFICULTY_COLORS, DIFFICULTY_LABELS, type Question} from '~/lib/types';
import styles from './index.module.css';

const PAGE_SIZE = 100;

const Index: Component = () => {
	// metadata/options ドキュメントをリアルタイム取得 → ドロップダウン選択肢として使用
	const optionsDoc = useFirestore(OptionsDoc);

	// サーバーサイドフィルタを反映したリアルタイムクエリの結果
	const [displayState, setDisplayState] = createStore<{
		loading: boolean;
		error: Error | null;
		data: Question[];
	}>({loading: true, error: null, data: []});

	const [majorCategory, setMajorCategory] = createSignal('');
	const [minorCategory, setMinorCategory] = createSignal('');
	const [difficulty, setDifficulty] = createSignal(0);
	const [source, setSource] = createSignal('');

	// カーソルベースのページネーション状態
	// pageCursors[i] はページ i を読み込む際に startAfter に渡す DocumentSnapshot
	// pageCursors[0] は undefined (最初のページはカーソル不要)
	const [pageIndex, setPageIndex] = createSignal(0);
	const [pageCursors, setPageCursors] = createSignal<
		(DocumentSnapshot | undefined)[]
	>([undefined]);
	const [hasNextPage, setHasNextPage] = createSignal(false);

	// フィルタが変わったらページネーションをリセット
	createEffect(() => {
		majorCategory();
		minorCategory();
		difficulty();
		source();
		batch(() => {
			setPageIndex(0);
			setPageCursors([undefined]);
			setHasNextPage(false);
		});
	});

	// フィルタまたはページが変わるたびに Firestore クエリを再構築してリスナーを張り直す
	createEffect(() => {
		const constraints: QueryConstraint[] = [];
		const maj = majorCategory();
		const min = minorCategory();
		const diff = difficulty();
		const src = source();
		const pi = pageIndex();
		// pageCursors はリスナー内での更新でエフェクトが再実行されないよう untrack で読む
		const cursor = untrack(pageCursors)[pi];

		if (maj) constraints.push(where('majorCategory', '==', maj));
		if (min) constraints.push(where('minorCategory', '==', min));
		if (diff) constraints.push(where('difficulty', '==', diff));
		if (src) constraints.push(where('source', '==', src));
		constraints.push(orderBy('createdAt', 'desc'));
		if (cursor) constraints.push(startAfter(cursor));
		// 次ページの有無を判定するため PAGE_SIZE + 1 件を取得
		constraints.push(limit(PAGE_SIZE + 1));

		setDisplayState('loading', true);

		const q = query(Questions, ...constraints);
		const unsubscribe = onSnapshot(
			q,
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

				// 次ページのカーソルをまだ保存していなければ保存する
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

	// ドロップダウン選択肢は metadata/options から取得
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

	// 大カテゴリが変わったら小カテゴリをリセット
	createEffect(() => {
		majorCategory();
		setMinorCategory('');
	});

	const hasActiveFilter = createMemo(
		() => majorCategory() || minorCategory() || difficulty() || source(),
	);

	return (
		<div>
			<div class={styles.header}>
				<h1 class={styles.title}>問題一覧</h1>
				<A href="/questions/new" class={styles.addBtn}>
					+ 問題追加
				</A>
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
						{displayState.data.length} 件{hasNextPage() ? '以上' : ''}
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

						<Show when={pageIndex() > 0 || hasNextPage()}>
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
