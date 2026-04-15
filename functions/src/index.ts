import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {onDocumentWritten} from 'firebase-functions/v2/firestore';

initializeApp();

/**
 * questions コレクションへの書き込み (作成・更新・削除) をトリガーに、
 * 全問題からユニークな大カテゴリ・小カテゴリ・出典を集計して
 * metadata/options ドキュメントに保存する。
 */
export const updateQuestionOptions = onDocumentWritten(
	'questions/{questionId}',
	async (_event) => {
		const db = getFirestore();
		const snapshot = await db.collection('questions').get();

		const majorCategories = new Set<string>();
		const minorCategoriesByMajor = new Map<string, Set<string>>();
		const sources = new Set<string>();

		for (const docSnap of snapshot.docs) {
			const data = docSnap.data();
			const major = data.majorCategory as string | undefined;
			const minor = data.minorCategory as string | undefined;
			const source = data.source as string | undefined;

			if (major) {
				majorCategories.add(major);
				if (!minorCategoriesByMajor.has(major)) {
					minorCategoriesByMajor.set(major, new Set());
				}
				if (minor) {
					const minorSet = minorCategoriesByMajor.get(major);
					if (minorSet) minorSet.add(minor);
				}
			}
			if (source) {
				sources.add(source);
			}
		}

		const minorCategoriesByMajorObj: Record<string, string[]> = {};
		for (const [major, minors] of minorCategoriesByMajor.entries()) {
			minorCategoriesByMajorObj[major] = [...minors].sort();
		}

		await db.doc('metadata/options').set({
			majorCategories: [...majorCategories].sort(),
			minorCategoriesByMajor: minorCategoriesByMajorObj,
			sources: [...sources].sort(),
		});
	},
);
