import type {DocumentData, Timestamp} from 'firebase/firestore';

export const AUTHORIZED_EMAIL = 'hakatasiloving@gmail.com';

export const DIFFICULTY_LABELS: Record<number, string> = {
	1: '易',
	2: 'やや易',
	3: '普通',
	4: 'やや難',
	5: '難',
};

export const DIFFICULTY_COLORS: Record<number, string> = {
	1: '#10b981',
	2: '#84cc16',
	3: '#f59e0b',
	4: '#f97316',
	5: '#ef4444',
};

export interface Question extends DocumentData {
	id?: string;
	question: string;
	answer: string;
	explanation: string;
	alternativeAnswers: string[];
	majorCategory: string;
	minorCategory: string;
	difficulty: 1 | 2 | 3 | 4 | 5;
	createdAt: Timestamp;
	source: string;
	sourceNumber: string;
	searchTokens: string[];
}

export type QuestionInput = Omit<Question, 'id' | 'createdAt' | 'searchTokens'>;

export interface SearchFilters {
	query: string;
	majorCategory: string;
	minorCategory: string;
	difficulty: number; // 0 = all
}
