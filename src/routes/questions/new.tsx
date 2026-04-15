import {A, useNavigate} from '@solidjs/router';
import {addDoc, Timestamp} from 'firebase/firestore';
import {type Component, createSignal} from 'solid-js';
import QuestionForm from '~/components/QuestionForm';
import {Questions} from '~/lib/firebase';
import type {Question, QuestionInput} from '~/lib/types';
import styles from './new.module.css';

const NewQuestion: Component = () => {
	const navigate = useNavigate();
	const [error, setError] = createSignal('');

	const handleSubmit = async (values: QuestionInput) => {
		setError('');
		try {
			const docRef = await addDoc(Questions, {
				...values,
				createdAt: Timestamp.now(),
			} as Question);
			navigate(`/questions/${docRef.id}`);
		} catch (err) {
			console.error(err);
			setError('問題の保存に失敗しました。もう一度お試しください。');
		}
	};

	return (
		<div>
			<div class={styles.header}>
				<A href="/" class={styles.backLink}>
					← 一覧に戻る
				</A>
				<h1 class={styles.title}>問題追加</h1>
			</div>

			{error() && <div class={styles.errorMsg}>{error()}</div>}

			<QuestionForm onSubmit={handleSubmit} submitLabel="追加する" />
		</div>
	);
};

export default NewQuestion;
