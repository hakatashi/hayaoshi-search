import {test, expect} from 'vitest';
import {render, waitFor} from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import Index from './index.js';

const user = userEvent.setup();

test('has add task button', async () => {
	const {getByRole} = render(() => <Index />);
	const addTaskButton = getByRole('button');
	expect(addTaskButton).toHaveTextContent('Add Task');
});

test('is able to add task', async () => {
	const {getByRole, getByText, getAllByRole} = render(() => <Index />);

	// Wait for initial render and Firebase connection
	await waitFor(
		() => {
			const tasks = getAllByRole('listitem');
			expect(tasks).toHaveLength(1);
		},
		{timeout: 5000},
	);

	const taskInput = getByRole('textbox');
	expect(taskInput).toHaveValue('');

	const addTaskButton = getByText('Add Task');
	expect(addTaskButton).not.toBeDisabled();

	// Type the task
	await user.type(taskInput, 'Hello, World!');

	// Click add task button
	await user.click(addTaskButton);

	// Wait for the input to be cleared (indicating successful save)
	await waitFor(
		() => {
			const taskInput = getByRole('textbox');
			expect(taskInput).toHaveValue('');
		},
		{
			timeout: 10000,
		},
	);

	// Wait for the new task to appear in the list
	await waitFor(
		() => {
			const tasks = getAllByRole('listitem');
			expect(tasks).toHaveLength(2);
		},
		{
			timeout: 10000,
		},
	);

	// Check the task content
	const tasks = getAllByRole('listitem');
	const newTask = tasks.find((task) =>
		task.textContent?.includes('Hello, World!'),
	);
	expect(newTask).toBeTruthy();
	expect(newTask).toHaveTextContent('Hello, World!');
});
