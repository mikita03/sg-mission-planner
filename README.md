# SG MISSION PLANNER v4

シンガポール出張スケジュール管理アプリ — React + Firebase Realtime DB

## クイックスタート

```bash
npm install
npm run dev     # → http://localhost:5173
```

Firebase未設定でもローカルモード（localStorage保存）で動作します。

---

## Firebase セットアップ（同時編集を有効にする）

### 1. Firebaseプロジェクト作成

1. [Firebase Console](https://console.firebase.google.com) にアクセス
2. 「プロジェクトを追加」→ プロジェクト名を入力（例: `sg-mission-2026`）
3. Google Analytics は OFF でOK → 「プロジェクトを作成」

### 2. Webアプリを追加

1. プロジェクトの概要画面で「</>」（ウェブ）アイコンをクリック
2. アプリ名を入力 → 「アプリを登録」
3. 表示される `firebaseConfig` の値をメモ

### 3. Anonymous認証を有効化

1. 左メニュー「Authentication」→「始める」
2. 「Sign-in method」タブ → 「匿名」→ 有効にする → 保存

### 4. Realtime Database を作成

1. 左メニュー「Realtime Database」→「データベースを作成」
2. ロケーション: `asia-southeast1`（シンガポール）推奨
3. セキュリティルール: 「テストモードで開始」を選択
4. 作成後、ルールを以下に書き換え:

```json
{
  "rules": {
    "blocks": {
      ".read": true,
      ".write": "auth != null"
    },
    "presence": {
      ".read": true,
      "$uid": {
        ".write": "$uid === auth.uid"
      }
    },
    "budget": {
      ".read": true,
      ".write": "auth != null"
    },
    "review": {
      ".read": true,
      ".write": "auth != null"
    }
  }
}
```

### 5. 環境変数を設定

```bash
cp .env.example .env
```

`.env` を編集して Firebase のconfig値を貼り付け:

```
VITE_FB_API_KEY=AIzaSy...
VITE_FB_AUTH_DOMAIN=sg-mission-2026.firebaseapp.com
VITE_FB_DATABASE_URL=https://sg-mission-2026-default-rtdb.asia-southeast1.firebasedatabase.app
VITE_FB_PROJECT_ID=sg-mission-2026
VITE_FB_STORAGE_BUCKET=sg-mission-2026.appspot.com
VITE_FB_MESSAGING_SENDER_ID=123456789
VITE_FB_APP_ID=1:123456789:web:abcdef
```

### 6. 起動確認

```bash
npm run dev
```

ヘッダーに「SYNCED」バッジが表示されれば接続成功。
複数ブラウザタブで開くと同時編集が確認できます。

---

## デプロイ

### GitHub Pages

```bash
# vite.config.ts の base をリポ名に変更
npm run build
npx gh-pages -d dist
```

**重要**: `.env` を設定してからビルドしてください（値がバンドルに埋め込まれます）

### Notion 埋め込み

1. `/embed` → デプロイURL を貼り付け
2. 埋め込みブロックの高さを 700px以上 に広げる

---

## 実装済み機能

- **Phase 1+2** ✅ タブ、ドロワー、空きクリック追加、フィルター、訪問リスト、サマリー、複製
- **Phase 3** ✅ Firebase同期、匿名認証、プレゼンス、編集ロック
- **Phase 4** 予定: 予算タブ、振り返りタブ
