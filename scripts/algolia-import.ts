#!/usr/bin/env node
/**
 * Firestore の questions コレクションを Algolia に一括インポートするスクリプト。
 * Algolia インデックスの設定（検索可能属性・ファセット）も同時に行う。
 *
 * 使用方法:
 *   npx tsx scripts/algolia-import.ts
 */

import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {algoliasearch} from 'algoliasearch';
import {cert, initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const ALGOLIA_APP_ID = 'CVBOBUD00F';
const ALGOLIA_API_KEY = '18070b5d1e89e28b1ca3920fffdd2f11';
const ALGOLIA_INDEX_NAME = 'questions';
const ADMIN_KEY_FILE = join(
	__dirname,
	'..',
	'hayaoshi-search-firebase-adminsdk-fbsvc-03cdc81e23.json',
);

async function main() {
	// Firebase Admin 初期化
	const serviceAccount = require(ADMIN_KEY_FILE);
	initializeApp({credential: cert(serviceAccount)});
	const db = getFirestore();

	// Algolia クライアント初期化
	const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_API_KEY);

	// Algolia インデックス設定
	console.log('Configuring Algolia index settings...');
	await client.setSettings({
		indexName: ALGOLIA_INDEX_NAME,
		indexSettings: {
			searchableAttributes: [
				'question',
				'answer',
				'explanation',
				'alternativeAnswers',
				'majorCategory',
				'minorCategory',
				'source',
				'sourceNumber',
			],
			attributesForFaceting: [
				'filterOnly(majorCategory)',
				'filterOnly(minorCategory)',
				'filterOnly(source)',
			],
			numericAttributesForFiltering: ['difficulty'],
			// 日本語テキストの分かち書きを有効化
			ignorePlurals: ['ja'],
		},
	});
	console.log('Index settings configured.');

	// Firestore から全問題を取得
	console.log('Fetching questions from Firestore...');
	const snapshot = await db.collection('questions').get();
	console.log(`  Fetched ${snapshot.docs.length} documents.`);

	if (snapshot.docs.length === 0) {
		console.log('No documents to import.');
		return;
	}

	// Algolia オブジェクトに変換
	const objects = snapshot.docs.map((doc) => {
		const data = doc.data();
		return {
			objectID: doc.id,
			...data,
			// Firestore Timestamp を epoch ミリ秒に変換
			createdAt: data.createdAt?.toMillis?.() ?? null,
		};
	});

	// 1000件ずつバッチでインポート
	const BATCH_SIZE = 1000;
	let imported = 0;
	for (let i = 0; i < objects.length; i += BATCH_SIZE) {
		const batch = objects.slice(i, i + BATCH_SIZE);
		await client.saveObjects({
			indexName: ALGOLIA_INDEX_NAME,
			objects: batch,
		});
		imported += batch.length;
		console.log(`  Imported ${imported}/${objects.length}...`);
	}

	console.log(
		`\nDone. ${objects.length} questions imported to Algolia index "${ALGOLIA_INDEX_NAME}".`,
	);
}

main().catch((err) => {
	console.error('Error:', err);
	process.exit(1);
});
