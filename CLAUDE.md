# hayaoshi-search

早押しクイズの問題を記録・検索するための個人用ウェブアプリ。

## 技術スタック

- **フロントエンド**: SolidJS + SolidStart (SSR無効、SPAモード)
- **データベース**: Firebase Firestore
- **認証**: Firebase Authentication (Googleログイン)
- **ホスティング**: Firebase Hosting
- **日本語形態素解析**: kuromoji (辞書ファイルは `public/dict/` に配置)
- **CSV/TSVパース**: papaparse
- **スタイル**: CSS Modules (各コンポーネント・ルートごとに `.module.css`)
- **Linter/Formatter**: Biome
- **型チェック**: TypeScript (`tsc --noEmit`)

## 開発コマンド

```bash
npm run dev          # 開発サーバー + Firebase エミュレーター + Functions を同時起動
npm run build        # 本番ビルド (.output/public に出力)
npm run fix          # format + lint を一括実行 (Biome)
npx tsc --noEmit     # 型チェック
```

## デプロイ

```bash
firebase deploy --only hosting,firestore
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
│   ├── firebase.ts                # Firebase初期化、Questions コレクション参照
│   ├── types.ts                   # Question インターフェース、定数
│   ├── tokenizer.ts               # kuromoji ラッパー (バイグラムフォールバック付き)
│   └── auth.ts                    # createAuthState() リアクティブヘルパー
├── components/
│   ├── AuthGuard.tsx / .module.css   # Googleサインイン認証ゲート
│   ├── Layout.tsx / .module.css      # ナビゲーションヘッダー付きレイアウト
│   └── QuestionForm.tsx / .module.css # 問題追加・編集フォーム（共有）
└── routes/
    ├── index.tsx / .module.css        # 検索・一覧ページ
    ├── import.tsx / .module.css       # CSV/TSV一括インポート
    ├── quiz.tsx / .module.css         # クイズモード
    └── questions/
        ├── index.tsx                  # / にリダイレクト
        ├── new.tsx / .module.css      # 問題追加
        └── [id].tsx / .module.css     # 問題詳細・編集・削除
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
  searchTokens: string[];     // 検索インデックス（保存時に自動生成）
}
```

## 日本語あいまい検索

問題保存時に `buildSearchTokens()` を呼び出し、kuromoji で形態素解析した語基形 + バイグラムを `searchTokens` フィールドに格納する。検索時はクエリを同様にトークン化し、クライアントサイドでフィルタリングする。kuromoji が利用不可の場合はバイグラム検索にフォールバックする。

辞書ファイルは `app.config.ts` の Vite プラグインがビルド時に `node_modules/kuromoji/dict/` から `public/dict/` へ自動コピーする。

## CSV/TSVインポート形式

ヘッダー行必須。カラム名: `問題文`, `答え`, `解説`, `別解`, `大カテゴリ`, `小カテゴリ`, `難易度`, `出典`, `出典番号`。別解は `;`（セミコロン）区切りで複数指定可能。カラムのマッピングはインポート画面で変更できる。
