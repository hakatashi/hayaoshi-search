import {For, createSignal, type Component} from 'solid-js';
import type {QuestionInput} from '~/lib/types';
import {DIFFICULTY_LABELS} from '~/lib/types';
import styles from './QuestionForm.module.css';

interface Props {
	initialValues?: Partial<QuestionInput>;
	onSubmit: (values: QuestionInput) => Promise<void>;
	onCancel?: () => void;
	submitLabel?: string;
}

const QuestionForm: Component<Props> = (props) => {
	const iv = props.initialValues ?? {};

	const [question, setQuestion] = createSignal(iv.question ?? '');
	const [answer, setAnswer] = createSignal(iv.answer ?? '');
	const [explanation, setExplanation] = createSignal(iv.explanation ?? '');
	const [alternativeAnswers, setAlternativeAnswers] = createSignal<string[]>(
		iv.alternativeAnswers?.length ? iv.alternativeAnswers : [''],
	);
	const [majorCategory, setMajorCategory] = createSignal(
		iv.majorCategory ?? '',
	);
	const [minorCategory, setMinorCategory] = createSignal(
		iv.minorCategory ?? '',
	);
	const [difficulty, setDifficulty] = createSignal<number>(iv.difficulty ?? 3);
	const [source, setSource] = createSignal(iv.source ?? '');
	const [sourceNumber, setSourceNumber] = createSignal(iv.sourceNumber ?? '');
	const [submitting, setSubmitting] = createSignal(false);

	const addAlternative = () => setAlternativeAnswers((p) => [...p, '']);

	const removeAlternative = (index: number) =>
		setAlternativeAnswers((p) => p.filter((_, i) => i !== index));

	const updateAlternative = (index: number, value: string) =>
		setAlternativeAnswers((p) => p.map((v, i) => (i === index ? value : v)));

	const handleSubmit = async (e: SubmitEvent) => {
		e.preventDefault();
		if (submitting()) return;
		setSubmitting(true);
		try {
			await props.onSubmit({
				question: question().trim(),
				answer: answer().trim(),
				explanation: explanation().trim(),
				alternativeAnswers: alternativeAnswers()
					.map((a) => a.trim())
					.filter(Boolean),
				majorCategory: majorCategory().trim(),
				minorCategory: minorCategory().trim(),
				difficulty: difficulty() as 1 | 2 | 3 | 4 | 5,
				source: source().trim(),
				sourceNumber: sourceNumber().trim(),
			});
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<form class={styles.form} onSubmit={handleSubmit}>
			<div class={styles.group}>
				<label class={`${styles.label} ${styles.required}`} for="question">
					問題文
				</label>
				<textarea
					id="question"
					class={styles.textarea}
					rows={4}
					value={question()}
					onInput={(e) => setQuestion(e.currentTarget.value)}
					required
					placeholder="問題文を入力してください"
				/>
			</div>

			<div class={styles.group}>
				<label class={`${styles.label} ${styles.required}`} for="answer">
					答え
				</label>
				<input
					id="answer"
					type="text"
					class={styles.input}
					value={answer()}
					onInput={(e) => setAnswer(e.currentTarget.value)}
					required
					placeholder="答えを入力してください"
				/>
			</div>

			<div class={styles.group}>
				<label class={styles.label} for="explanation">
					解説
				</label>
				<textarea
					id="explanation"
					class={styles.textarea}
					rows={3}
					value={explanation()}
					onInput={(e) => setExplanation(e.currentTarget.value)}
					placeholder="解説を入力してください（任意）"
				/>
			</div>

			<div class={styles.group}>
				<div class={styles.label}>別解</div>
				<div class={styles.alternativesList}>
					<For each={alternativeAnswers()}>
						{(alt, i) => (
							<div class={styles.alternativeRow}>
								<input
									type="text"
									class={styles.input}
									value={alt}
									onInput={(e) => updateAlternative(i(), e.currentTarget.value)}
									placeholder={`別解 ${i() + 1}`}
								/>
								<button
									type="button"
									class={styles.removeBtn}
									onClick={() => removeAlternative(i())}
								>
									削除
								</button>
							</div>
						)}
					</For>
					<button type="button" class={styles.addBtn} onClick={addAlternative}>
						+ 別解を追加
					</button>
				</div>
			</div>

			<div class={styles.row}>
				<div class={styles.group}>
					<label class={styles.label} for="majorCategory">
						大カテゴリ
					</label>
					<input
						id="majorCategory"
						type="text"
						class={styles.input}
						value={majorCategory()}
						onInput={(e) => setMajorCategory(e.currentTarget.value)}
						placeholder="例: 理科、社会"
					/>
				</div>
				<div class={styles.group}>
					<label class={styles.label} for="minorCategory">
						小カテゴリ
					</label>
					<input
						id="minorCategory"
						type="text"
						class={styles.input}
						value={minorCategory()}
						onInput={(e) => setMinorCategory(e.currentTarget.value)}
						placeholder="例: 生物、地理"
					/>
				</div>
			</div>

			<div class={styles.group}>
				<label class={styles.label} for="difficulty">
					難易度
				</label>
				<select
					id="difficulty"
					class={styles.select}
					value={difficulty()}
					onChange={(e) => setDifficulty(Number(e.currentTarget.value))}
				>
					<For each={[1, 2, 3, 4, 5]}>
						{(level) => (
							<option value={level}>
								{level} - {DIFFICULTY_LABELS[level]}
							</option>
						)}
					</For>
				</select>
			</div>

			<div class={styles.row}>
				<div class={styles.group}>
					<label class={styles.label} for="source">
						出典
					</label>
					<input
						id="source"
						type="text"
						class={styles.input}
						value={source()}
						onInput={(e) => setSource(e.currentTarget.value)}
						placeholder="例: 高校選手権2023"
					/>
				</div>
				<div class={styles.group}>
					<label class={styles.label} for="sourceNumber">
						出典番号
					</label>
					<input
						id="sourceNumber"
						type="text"
						class={styles.input}
						value={sourceNumber()}
						onInput={(e) => setSourceNumber(e.currentTarget.value)}
						placeholder="例: Q42"
					/>
				</div>
			</div>

			<div class={styles.actions}>
				<button
					type="submit"
					class={styles.submitBtn}
					disabled={submitting() || !question().trim() || !answer().trim()}
				>
					{submitting() ? '保存中...' : (props.submitLabel ?? '保存')}
				</button>
				{props.onCancel && (
					<button
						type="button"
						class={styles.cancelBtn}
						onClick={props.onCancel}
						disabled={submitting()}
					>
						キャンセル
					</button>
				)}
			</div>
		</form>
	);
};

export default QuestionForm;
