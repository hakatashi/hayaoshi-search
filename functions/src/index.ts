import {onRequest} from 'firebase-functions/https';
import {info as loggerInfo} from 'firebase-functions/logger';
import {initializeApp} from 'firebase-admin/app';
import {
	type CollectionReference,
	getFirestore,
	Timestamp,
} from 'firebase-admin/firestore';
import {defineString} from 'firebase-functions/params';
import type {Task} from '../../src/lib/schema.ts';
import {onSchedule} from 'firebase-functions/scheduler';

if (process.env.FUNCTIONS_EMULATOR === 'true') {
	process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
}

const app = initializeApp();
const db = getFirestore(app);

const Tasks = db.collection('tasks') as CollectionReference<Task>;

const apiKey = defineString('API_KEY');

export const getTasks = onRequest(async (request, response) => {
	if (request.query.apiKey !== apiKey.value()) {
		response.status(403).send('Unauthorized');
		return;
	}

	const tasks = await Tasks.get();
	const taskList = tasks.docs.map((task) => task.data());
	response.json(taskList);
});

export const resetTasksCronJob = onSchedule('every 24 hours', async () => {
	loggerInfo('Resetting tasks');

	await db.runTransaction(async (transaction) => {
		const tasks = await transaction.get(Tasks);
		for (const task of tasks.docs) {
			transaction.delete(task.ref);
		}
		transaction.set(Tasks.doc(), {
			task: 'task1',
			uid: 'system',
			createdAt: Timestamp.now(),
		});
		transaction.set(Tasks.doc(), {
			task: 'task2',
			uid: 'system',
			createdAt: Timestamp.now(),
		});
	});

	loggerInfo('Tasks reset');
});
