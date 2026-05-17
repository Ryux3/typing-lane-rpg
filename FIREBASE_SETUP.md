# Firebase セットアップ

## 1. Firebaseプロジェクトを作る

Firebase Consoleで新しいプロジェクトを作成します。

https://console.firebase.google.com/

## 2. Webアプリを追加する

プロジェクト設定からWebアプリを追加し、表示されたFirebase設定値を `.env` に入れます。

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_ADMIN_EMAILS=your-email@example.com
```

`.env.example` をコピーして `.env` を作ると楽です。

Netlifyにデプロイする場合も、Netlifyの環境変数に同じ値を入れます。
環境変数のスコープは少なくとも **Builds** を含めてください。Viteはビルド時に `VITE_` から始まる値をアプリへ埋め込みます。
`VITE_FIREBASE_AUTH_DOMAIN` はNetlifyのドメインではなく、Firebaseの値を使ってください。

```env
VITE_FIREBASE_AUTH_DOMAIN=typinglanerpg.firebaseapp.com
```

Firebase Consoleの Authentication → Settings → Authorized domains には、Netlifyの公開ドメインを追加します。
`https://` は付けず、`xxxxx.netlify.app` のようにドメインだけを追加します。
ここで追加するだけで、`authDomain` 自体は Firebase の `firebaseapp.com` のままにします。
Netlify側の値を変更したあとは、必ず本番を再デプロイしてください。

## 3. Googleログインを有効にする

Firebase Consoleで以下を開きます。

Authentication → Sign-in method → Google

Googleを有効にして保存します。

## 4. Firestoreを作る

Firebase Consoleで以下を開きます。

Firestore Database → Create database

本番モードで作成して問題ありません。

## 5. セキュリティルールを設定する

Firestore Database → Rules に、このリポジトリの `firestore.rules` の中身を貼り付けて公開します。

## 6. 管理者を登録する

アプリで `/#admin` を開き、Googleログインします。

画面に表示されたユーザーIDを使って、Firestoreに以下を作ります。

```text
collection: admins
document id: 画面に表示されたユーザーID
field: role = owner
```

フィールド名は何でもよく、ドキュメントが存在することだけを管理者判定に使っています。

## 7. 技データをクラウドへ保存する

管理者登録後に `/#admin` を開き直すと技編集画面が使えます。

「クラウド保存」を押すと、`techniques/{command}` に技データが保存されます。
