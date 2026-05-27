# メイプル ボス結晶管理 Firebase版

ボス結晶の収益管理だけに絞ったWebアプリです。

## 主な機能

- Googleログイン
- PC / iPhone同期
- 6キャラ初期登録、あとからキャラ追加・削除可能
- ボス結晶価格マスタ
- キャラ別の討伐チェック
- PT人数割り
- キャラごとに高い順12個だけ売却対象として集計
- EXスウ、EX暗黒、EXセレン、EXカロス、EXカリーン入り
- iPhoneの「ホーム画面に追加」でアプリ風に利用可能

## セットアップ

### 1. Firebaseでプロジェクト作成

Firebase Consoleでプロジェクトを作成します。

### 2. Authenticationを有効化

Authentication → Sign-in method → Google を有効化します。

### 3. Firestore Databaseを作成

Firestore Databaseを作成します。

### 4. Webアプリを追加

Firebaseのプロジェクト設定から Webアプリを追加し、Firebase configを取得します。

### 5. `.env` を作成

`.env.example` をコピーして `.env` に変更し、Firebase configを入れます。

### 6. 起動

```bash
npm install
npm run dev
```

## Vercel公開

GitHubにこのフォルダをアップロードし、VercelでImportします。  
Vercelの Environment Variables に `.env` と同じ値を登録してください。

## iPhoneで使う

VercelのURLをSafariで開く → 共有 → ホーム画面に追加。


## 追加修正

- 設定タブから「結晶売却キャラを追加」できます。
- 追加したキャラにも週/月ボス枠が自動作成されます。
- キャラ削除にも対応しました。
- 合計売却枠は `キャラ数 × 12個` で自動計算されます。
