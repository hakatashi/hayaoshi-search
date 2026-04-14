import type {Component} from 'solid-js';
import {Tasks} from '~/lib/firebase';
import {useFirestore} from 'solid-firebase';
import Collection from '~/lib/Collection';
import {deleteDoc, doc, orderBy, query} from 'firebase/firestore';

import styles from './admin.module.css';

const Admin: Component = () => {
	const tasks = useFirestore(query(Tasks, orderBy('createdAt', 'asc')));

	const onClickDeleteTask = async (taskId: string) => {
		const taskDoc = doc(Tasks, taskId);
		await deleteDoc(taskDoc);
	};

	return (
		<ul class={styles.tasks}>
			<Collection data={tasks}>
				{(taskData) => (
					<li class={styles.task}>
						{taskData.task}
						<button
							onClick={() => onClickDeleteTask(taskData.id)}
							type="button"
							class={styles.deleteTask}
						>
							Delete
						</button>
					</li>
				)}
			</Collection>
		</ul>
	);
};

export default Admin;
