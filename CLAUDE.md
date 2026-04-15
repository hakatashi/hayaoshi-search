# hayaoshi-search

早押しクイズの問題を記録・検索するための個人用ウェブアプリ。

## 技術スタック

- **フロントエンド**: SolidJS + SolidStart (SSR無効、SPAモード)
- **データベース**: Firebase Firestore
- **認証**: Firebase Authentication (Googleログイン)
- **ホスティング**: Firebase Hosting
- **バックエンド**: Firebase Cloud Functions (カテゴリ・出典のメタデータ集計)
- **CSV/TSVパース**: papaparse
- **スタイル**: CSS Modules (各コンポーネント・ルートごとに `.module.css`)
- **Linter/Formatter**: Biome
- **型チェック**: TypeScript (`tsc --noEmit`)
- **テスト**: Vitest + jsdom + @solidjs/testing-library (Firebase エミュレーター使用)

## 開発コマンド

```bash
npm run dev          # 開発サーバー + Firebase エミュレーター + Functions ビルドウォッチ を同時起動
npm run build        # 本番ビルド (.output/public に出力)
npm run fix          # format + lint を一括実行 (Biome)
npm run test         # Functions ビルド後、Firebase エミュレーターを起動して Vitest を実行
npx tsc --noEmit     # 型チェック
```

## デプロイ

```bash
firebase deploy --only hosting,firestore,functions
```

`firebase.json` の `predeploy` で `npm run build` が自動実行される。

## 認証

- Googleログインのみ対応
- `hakatasiloving@gmail.com` のみアクセス可能
- Firestoreセキュリティルールでサーバーサイドでも強制 (`firestore.rules`)
- ローカル開発時は Firebase Emulator UI (localhost:4000) でテストユーザーを作成する

## ディレクトリ構成

```
src/
├── app.tsx                        # ルートコンポーネント (FirebaseProvider + Router)
├── app.css                        # グローバルCSS変数・リセットのみ
├── lib/
│   ├── firebase.ts                # Firebase初期化、Questions・OptionsDoc 参照
│   ├── types.ts                   # Question・QuestionOptions インターフェース、定数
│   └── auth.ts                    # createAuthState() リアクティブヘルパー
├── components/
│   ├── AuthGuard.tsx / .module.css   # Googleサインイン認証ゲート
│   ├── Layout.tsx / .module.css      # ナビゲーションヘッダー付きレイアウト
│   └── QuestionForm.tsx / .module.css # 問題追加・編集フォーム（共有）
└── routes/
    ├── index.tsx / .module.css        # 検索・一覧ページ（サーバーサイドフィルタリング、カーソルページネーション）
    ├── import.tsx / .module.css       # CSV/TSV一括インポート（upsert対応）
    ├── quiz.tsx / .module.css         # クイズモード
    └── questions/
        ├── index.tsx                  # / にリダイレクト
        ├── new.tsx / .module.css      # 問題追加
        └── [id].tsx / .module.css     # 問題詳細・編集・削除
functions/
└── src/
    └── index.ts                   # Cloud Function: 問題書き込み時にカテゴリ・出典を metadata/options に集計
```

## 問題データ構造

```typescript
interface Question {
  id?: string;
  question: string;           // 問題文
  answer: string;             // 答え
  explanation: string;        // 解説
  alternativeAnswers: string[]; // 別解
  majorCategory: string;      // 大カテゴリ
  minorCategory: string;      // 小カテゴリ
  difficulty: 1 | 2 | 3 | 4 | 5; // 難易度
  createdAt: Timestamp;       // 追加日
  source: string;             // 出典
  sourceNumber: string;       // 出典番号
}

interface QuestionOptions {
  majorCategories: string[];
  minorCategoriesByMajor: Record<string, string[]>;
  sources: string[];
}
```

`QuestionOptions` は `metadata/options` ドキュメントに格納され、Cloud Function が問題の書き込みをトリガーとして自動更新する。

## サーバーサイドフィルタリングと検索

- フィルター（大カテゴリ・小カテゴリ・難易度・出典）は Firestore の `where()` クエリでサーバーサイドに処理する
- フィルターの組み合わせに対応する複合インデックスが `firestore.indexes.json` に定義されている
- カーソルベースのページネーション（`limit` + `startAfter`）で100件ずつ表示
- ドロップダウンの選択肢は `metadata/options` ドキュメントから取得し、全件スキャンを避ける
- キーワード検索機能は廃止済み（kuromoji・searchTokens・tokenizer.ts は削除）

## CSV/TSVインポート形式

ヘッダー行必須。カラム名: `問題文`, `答え`, `解説`, `別解`, `大カテゴリ`, `小カテゴリ`, `難易度`, `出典`, `出典番号`。別解は `;`（セミコロン）区切りで複数指定可能。カラムのマッピングはインポート画面で変更できる。

`source` + `sourceNumber` の組み合わせで重複チェックを行い、既存ドキュメントは上書き（upsert）する。書き込みは Firestore の `writeBatch` を500件単位で実行する。
