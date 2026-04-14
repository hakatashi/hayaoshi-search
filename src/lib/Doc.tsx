import type {DocumentData} from 'firebase/firestore';
import {type JSX, Match, Show, Switch} from 'solid-js';
import type {UseFireStoreReturn} from './schema.ts';

interface Props<T extends DocumentData | DocumentData[]> {
	data: UseFireStoreReturn<T | null | undefined> | null | undefined;
	fallback?: JSX.Element;
	children: (item: T) => JSX.Element;
}

const Skeleton = (_props: {variant: 'text'}) => <span>Loading...</span>;

const Doc = <T extends DocumentData | DocumentData[]>(props: Props<T>) => (
	<Switch>
		<Match when={props.data === null}>
			<Skeleton variant="text" />
		</Match>
		<Match when={props.data?.loading}>
			<Skeleton variant="text" />
		</Match>
		<Match when={props.data?.error}>
			<span class="load-error">{props.data?.error?.toString()}</span>
		</Match>
		<Match when={props.data?.data} keyed={true}>
			{(data) => props.children(data)}
		</Match>
		<Match when={true}>
			<Show when={props.fallback} keyed={true}>
				{(fallback) => fallback}
			</Show>
		</Match>
	</Switch>
);

export default Doc;
