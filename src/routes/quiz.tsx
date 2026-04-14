import {
	For,
	Show,
	createEffect,
	createMemo,
	createSignal,
	type Component,
} from 'solid-js';
import {useFirestore} from 'solid-firebase';
import {orderBy, query} from 'firebase/firestore';
import {Questions} from '~/lib/firebase';
import {DIFFICULTY_LABELS, type Question} from '~/lib/types';
import styles from './quiz.module.css';

type Phase = 'setup' | 'question' | 'answer' | 'results';

function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

const QuizPage: Component = () => {
	const allQuestions = useFirestore(
		query(Questions, orderBy('createdAt', 'desc')),
	);

	// Setup filters
	const [majorCategory, setMajorCategory] = createSignal('');
	const [minorCategory, setMinorCategory] = createSignal('');
	const [difficulty, setDifficulty] = createSignal(0);

	// Quiz state
	const [phase, setPhase] = createSignal<Phase>('setup');
	const [deck, setDeck] = createSignal<Question[]>([]);
	const [current, setCurrent] = createSignal(0);
	const [correct, setCorrect] = createSignal(0);
	const [incorrect, setIncorrect] = createSignal(0);
	const [_revealed, setRevealed] = createSignal(false);

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

	createEffect(() => {
		majorCategory();
		setMinorCategory('');
	});

	const matchingQuestions = createMemo(() => {
		const data = allQuestions.data ?? [];
		return data.filter((q: Question) => {
			if (majorCategory() && q.majorCategory !== majorCategory()) return false;
			if (minorCategory() && q.minorCategory !== minorCategory()) return false;
			if (difficulty() && q.difficulty !== difficulty()) return false;
			return true;
		});
	});

	const currentQuestion = createMemo(() => deck()[current()]);

	const startQuiz = () => {
		const shuffled = shuffle(matchingQuestions());
		setDeck(shuffled);
		setCurrent(0);
		setCorrect(0);
		setIncorrect(0);
		setRevealed(false);
		setPhase('question');
	};

	const revealAnswer = () => {
		setRevealed(true);
		setPhase('answer');
	};

	const advance = (result: 'correct' | 'incorrect' | 'skip') => {
		if (result === 'correct') setCorrect((n) => n + 1);
		else if (result === 'incorrect') setIncorrect((n) => n + 1);

		const next = current() + 1;
		if (next >= deck().length) {
			setPhase('results');
		} else {
			setCurrent(next);
			setRevealed(false);
			setPhase('question');
		}
	};

	const endQuiz = () => setPhase('results');
	const restart = () => setPhase('setup');

	const answered = createMemo(() => correct() + incorrect());
	const total = createMemo(() => deck().length);
	const progressPct = createMemo(() =>
		total() ? Math.round((current() / total()) * 100) : 0,
	);

	return (
		<div class={styles.page}>
			<Show
				when={!allQuestions.loading}
				fallback={
					<div class={styles.loadingPage}>
						<div class={styles.spinner} />
					</div>
				}
			>
				{/* Setup phase */}
				<Show when={phase() === 'setup'}>
					<h1 class={styles.title}>クイズモード</h1>
					<div class={styles.setup}>
						<div class={styles.setupCard}>
							<h2 class={styles.setupTitle}>出題範囲を選択</h2>

							<div class={styles.filterRow}>
								<div class={styles.filterGroup}>
									<label class={styles.filterLabel} for="quiz-major-cat">
										大カテゴリ
									</label>
									<select
										id="quiz-major-cat"
										class={styles.filterSelect}
										value={majorCategory()}
										onChange={(e) => setMajorCategory(e.currentTarget.value)}
									>
										<option value="">すべて</option>
										<For each={majorCategories()}>
											{(cat) => <option value={cat}>{cat}</option>}
										</For>
									</select>
								</div>
								<div class={styles.filterGroup}>
									<label class={styles.filterLabel} for="quiz-minor-cat">
										小カテゴリ
									</label>
									<select
										id="quiz-minor-cat"
										class={styles.filterSelect}
										value={minorCategory()}
										onChange={(e) => setMinorCategory(e.currentTarget.value)}
									>
										<option value="">すべて</option>
										<For each={minorCategories()}>
											{(cat) => <option value={cat}>{cat}</option>}
										</For>
									</select>
								</div>
							</div>

							<div class={styles.filterGroup}>
								<label class={styles.filterLabel} for="quiz-difficulty">
									難易度
								</label>
								<select
									id="quiz-difficulty"
									class={styles.filterSelect}
									value={difficulty()}
									onChange={(e) => setDifficulty(Number(e.currentTarget.value))}
								>
									<option value={0}>すべて</option>
									<For each={[1, 2, 3, 4, 5]}>
										{(level) => (
											<option value={level}>
												{level} - {DIFFICULTY_LABELS[level]}
											</option>
										)}
									</For>
								</select>
							</div>

							<div class={styles.matchCount}>
								対象問題数: <strong>{matchingQuestions().length} 件</strong>
							</div>

							<button
								type="button"
								class={styles.startBtn}
								disabled={matchingQuestions().length === 0}
								onClick={startQuiz}
							>
								クイズを開始する
							</button>
						</div>
					</div>
				</Show>

				{/* Question / Answer phase */}
				<Show when={phase() === 'question' || phase() === 'answer'}>
					<div class={styles.playing}>
						{/* Progress bar */}
						<div class={styles.progressBar}>
							<span class={styles.progressText}>
								{current() + 1} / {total()}
							</span>
							<div class={styles.progressTrack}>
								<div
									class={styles.progressFill}
									style={`width: ${progressPct()}%`}
								/>
							</div>
							<span class={styles.scoreText}>
								正解: {correct()} / 不正解: {incorrect()}
							</span>
						</div>

						<Show when={currentQuestion()}>
							{(q) => (
								<div class={styles.quizCard}>
									{/* Question */}
									<div class={styles.questionLabel}>問題</div>
									<div class={styles.questionText}>{q().question}</div>

									{/* Reveal button or Answer */}
									<Show
										when={phase() === 'answer'}
										fallback={
											<>
												<button
													type="button"
													class={styles.revealBtn}
													onClick={revealAnswer}
												>
													回答を見る
												</button>
												<div class={styles.waitActions}>
													<button
														type="button"
														class={styles.endBtn}
														onClick={endQuiz}
													>
														終了する
													</button>
												</div>
											</>
										}
									>
										<div class={styles.answerSection}>
											<div class={styles.answerLabel}>答え</div>
											<div class={styles.answerBox}>{q().answer}</div>

											<Show when={q().alternativeAnswers?.length > 0}>
												<div class={styles.alternativesRow}>
													<span class={styles.altLabel}>別解:</span>
													{q().alternativeAnswers.map((alt) => (
														<span class={styles.altTag}>{alt}</span>
													))}
												</div>
											</Show>

											<Show when={q().explanation}>
												<div class={styles.explanation}>{q().explanation}</div>
											</Show>

											<div class={styles.quizActions}>
												<button
													type="button"
													class={styles.correctBtn}
													onClick={() => advance('correct')}
												>
													⭕ 正解
												</button>
												<button
													type="button"
													class={styles.incorrectBtn}
													onClick={() => advance('incorrect')}
												>
													❌ 不正解
												</button>
												<button
													type="button"
													class={styles.skipBtn}
													onClick={() => advance('skip')}
												>
													スキップ
												</button>
											</div>
										</div>
									</Show>
								</div>
							)}
						</Show>
					</div>
				</Show>

				{/* Results phase */}
				<Show when={phase() === 'results'}>
					<div class={styles.results}>
						<div class={styles.resultsCard}>
							<h2 class={styles.resultsTitle}>クイズ終了！</h2>
							<div class={styles.scoreBig}>
								{answered() > 0
									? Math.round((correct() / answered()) * 100)
									: 0}
								%
							</div>
							<p class={styles.scoreDetail}>
								{total()} 問中 {answered()} 問解答、{correct()} 問正解 （
								{incorrect()} 問不正解、{total() - answered()} 問スキップ）
							</p>
							<button type="button" class={styles.restartBtn} onClick={restart}>
								もう一度
							</button>
						</div>
					</div>
				</Show>
			</Show>
		</div>
	);
};

export default QuizPage;
