import {algoliasearch} from 'algoliasearch';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {defineSecret} from 'firebase-functions/params';
import {onDocumentWritten} from 'firebase-functions/v2/firestore';

initializeApp();

const ALGOLIA_APP_ID = 'CVBOBUD00F';
const ALGOLIA_INDEX_NAME = 'questions';
const algoliaApiKey = defineSecret('ALGOLIA_API_KEY');

/**
 * questions コレクションへの書き込み (作成・更新・削除) をトリガーに:
 * 1. 全問題からユニークな大カテゴリ・小カテゴリ・出典を集計して metadata/options に保存する
 * 2. Algolia インデックスを同期する
 */
export const updateQuestionOptions = onDocumentWritten(
	{document: 'questions/{questionId}', secrets: [algoliaApiKey]},
	async (event) => {
		const db = getFirestore();
		const questionId = event.params.questionId;
		const algolia = algoliasearch(ALGOLIA_APP_ID, algoliaApiKey.value());

		// Algolia 同期
		if (event.data?.after.exists) {
			const data = event.data.after.data();
			if (data) {
				await algolia.saveObject({
					indexName: ALGOLIA_INDEX_NAME,
					body: {
						objectID: questionId,
						...data,
						createdAt: data.createdAt?.toMillis?.() ?? null,
					},
				});
			}
		} else {
			await algolia.deleteObject({
				indexName: ALGOLIA_INDEX_NAME,
				objectID: questionId,
			});
		}

		// metadata/options を更新
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
