import {createSignal, type Component, type JSX} from 'solid-js';
import {auth, Tasks} from '~/lib/firebase';
import {useAuth, useFirestore} from 'solid-firebase';
import Collection from '~/lib/Collection';
import {addDoc, orderBy, query, Timestamp} from 'firebase/firestore';

import styles from './index.module.css';

const Index: Component = () => {
	const tasks = useFirestore(query(Tasks, orderBy('createdAt', 'asc')));
	const authState = useAuth(auth);
	const [newTask, setNewTask] = createSignal('');

	const onSubmitTask: JSX.EventHandler<HTMLFormElement, SubmitEvent> = async (
		event,
	) => {
		event.preventDefault();
		const form = event.currentTarget;

		if (!(authState.data && form)) {
			return;
		}

		await addDoc(Tasks, {
			task: newTask(),
			uid: authState.data.uid,
			createdAt: Timestamp.now(),
		});

		setNewTask('');
	};

	return (
		<ul class={styles.tasks}>
			<Collection data={tasks}>
				{(taskData) => <li class={styles.task}>{taskData.task}</li>}
			</Collection>
			<li class={styles.addTask}>
				<form onSubmit={onSubmitTask}>
					<input
						type="text"
						name="task"
						value={newTask()}
						onChange={(event) => setNewTask(event.currentTarget?.value)}
					/>
					<button type="submit" disabled={!authState.data}>
						Add Task
					</button>
				</form>
			</li>
		</ul>
	);
};

export default Index;
