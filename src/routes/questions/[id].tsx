import {A, useNavigate, useParams} from '@solidjs/router';
import {deleteDoc, doc, updateDoc} from 'firebase/firestore';
import {useFirestore} from 'solid-firebase';
import {type Component, createSignal, Show} from 'solid-js';
import QuestionForm from '~/components/QuestionForm';
import {db, Questions} from '~/lib/firebase';
import type {QuestionInput} from '~/lib/types';
import {DIFFICULTY_COLORS, DIFFICULTY_LABELS} from '~/lib/types';
import styles from './[id].module.css';

const QuestionDetail: Component = () => {
	const params = useParams<{id: string}>();
	const navigate = useNavigate();

	const questionDoc = useFirestore(doc(db, 'questions', params.id));
	const [editing, setEditing] = createSignal(false);
	const [revealed, setRevealed] = createSignal(false);
	const [error, setError] = createSignal('');

	const handleUpdate = async (values: QuestionInput) => {
		setError('');
		try {
			await updateDoc(doc(Questions, params.id), {...values});
			setEditing(false);
		} catch (err) {
			console.error(err);
			setError('保存に失敗しました。もう一度お試しください。');
		}
	};

	const handleDelete = async () => {
		if (!confirm('この問題を削除しますか？この操作は取り消せません。')) return;
		try {
			await deleteDoc(doc(Questions, params.id));
			navigate('/');
		} catch (err) {
			console.error(err);
			setError('削除に失敗しました。');
		}
	};

	return (
		<div>
			<Show
				when={!questionDoc.loading}
				fallback={
					<div class={styles.loadingPage}>
						<div class={styles.spinner} />
					</div>
				}
			>
				<Show
					when={questionDoc.data}
					fallback={
						<div class={styles.notFound}>
							<p>問題が見つかりませんでした。</p>
							<A href="/">一覧に戻る</A>
						</div>
					}
				>
					{(q) => (
						<>
							<div class={styles.nav}>
								<A href="/" class={styles.backLink}>
									← 一覧に戻る
								</A>
								<div class={styles.actions}>
									<button
										type="button"
										class={styles.editBtn}
										onClick={() => {
											setEditing((v) => !v);
											setRevealed(false);
										}}
									>
										{editing() ? '編集をキャンセル' : '編集'}
									</button>
									<button
										type="button"
										class={styles.deleteBtn}
										onClick={handleDelete}
									>
										削除
									</button>
								</div>
							</div>

							{error() && <div class={styles.errorMsg}>{error()}</div>}

							<Show
								when={!editing()}
								fallback={
									<div class={styles.editSection}>
										<h2 class={styles.editTitle}>問題を編集</h2>
										<QuestionForm
											initialValues={{
												question: q().question,
												answer: q().answer,
												explanation: q().explanation,
												alternativeAnswers: q().alternativeAnswers,
												majorCategory: q().majorCategory,
												minorCategory: q().minorCategory,
												difficulty: q().difficulty,
												source: q().source,
												sourceNumber: q().sourceNumber,
											}}
											onSubmit={handleUpdate}
											onCancel={() => setEditing(false)}
											submitLabel="更新する"
										/>
									</div>
								}
							>
								<div class={styles.card}>
									{/* Question text */}
									<div class={styles.questionSection}>
										<div class={styles.sectionLabel}>問題文</div>
										<div class={styles.questionText}>{q().question}</div>
									</div>

									{/* Answer */}
									<div class={styles.section}>
										<div class={styles.sectionLabel}>答え</div>
										<Show
											when={revealed()}
											fallback={
												<button
													type="button"
													class={styles.revealBtn}
													onClick={() => setRevealed(true)}
												>
													クリックして答えを表示
												</button>
											}
										>
											<div class={styles.answerBox}>{q().answer}</div>
										</Show>
									</div>

									{/* Explanation */}
									<Show when={q().explanation}>
										<div class={styles.section}>
											<div class={styles.sectionLabel}>解説</div>
											<div class={styles.explanationText}>
												{q().explanation}
											</div>
										</div>
									</Show>

									{/* Alternative answers */}
									<Show when={q().alternativeAnswers?.length > 0}>
										<div class={styles.section}>
											<div class={styles.sectionLabel}>別解</div>
											<div class={styles.alternativesTags}>
												{q().alternativeAnswers.map((alt: string) => (
													<span class={styles.alternativeTag}>{alt}</span>
												))}
											</div>
										</div>
									</Show>

									{/* Metadata */}
									<div class={styles.section}>
										<div class={styles.metaGrid}>
											<Show when={q().majorCategory}>
												<div class={styles.metaItem}>
													<div class={styles.metaLabel}>大カテゴリ</div>
													<div class={styles.metaValue}>
														{q().majorCategory}
													</div>
												</div>
											</Show>
											<Show when={q().minorCategory}>
												<div class={styles.metaItem}>
													<div class={styles.metaLabel}>小カテゴリ</div>
													<div class={styles.metaValue}>
														{q().minorCategory}
													</div>
												</div>
											</Show>
											<Show when={q().difficulty}>
												<div class={styles.metaItem}>
													<div class={styles.metaLabel}>難易度</div>
													<span
														class={`${styles.badge} ${styles.difficultyBadge}`}
														style={`background: ${DIFFICULTY_COLORS[q().difficulty]}`}
													>
														{q().difficulty} -{' '}
														{DIFFICULTY_LABELS[q().difficulty]}
													</span>
												</div>
											</Show>
											<Show when={q().source}>
												<div class={styles.metaItem}>
													<div class={styles.metaLabel}>出典</div>
													<div class={styles.metaValue}>{q().source}</div>
												</div>
											</Show>
											<Show when={q().sourceNumber}>
												<div class={styles.metaItem}>
													<div class={styles.metaLabel}>出典番号</div>
													<div class={styles.metaValue}>{q().sourceNumber}</div>
												</div>
											</Show>
											<Show when={q().createdAt}>
												<div class={styles.metaItem}>
													<div class={styles.metaLabel}>追加日</div>
													<div class={styles.metaValue}>
														{q().createdAt.toDate().toLocaleDateString('ja-JP')}
													</div>
												</div>
											</Show>
										</div>
									</div>
								</div>
							</Show>
						</>
					)}
				</Show>
			</Show>
		</div>
	);
};

export default QuestionDetail;
