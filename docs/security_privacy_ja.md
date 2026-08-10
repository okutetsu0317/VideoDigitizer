# セキュリティ・プライバシー設計

最終確認日: 2026-08-10

## 基本方針

- 動画、画像、ローカルパス、研究メタデータ、AI推論は利用者のMac内だけで処理する
- デジタイズ座標のクラウド保存はGoogleログイン後の明示的なON操作を必須とする
- Googleログインは任意とし、`openid profile email` 以外の権限を要求しない
- クラウド保存にGoogle DriveやGoogle Workspaceの権限を使用しない
- 認証情報を `localStorage`、`sessionStorage`、IndexedDB、プロジェクトJSONへ保存しない
- 外部ページからlocalhost APIを操作できないよう、Host、Origin、一回限りbootstrap、HttpOnly Cookieを検証する

## Googleログイン

macOSデスクトップアプリ用OAuthクライアント、Authorization Code Flow、PKCE S256、ランダムな `state`、loopback redirectを使用します。アクセストークンはメモリ上だけで利用し、再ログイン用refresh tokenだけをmacOSキーチェーンへ保存します。

OAuthクライアントIDは秘密情報ではありません。GoogleのDesktopクライアントではトークン交換時にクライアントシークレットの送信も要求されますが、インストール型アプリへ同梱した値は抽出可能であり、機密情報や認証境界として扱えません。VideoDigitizerはPKCE、ランダムなstate、loopback redirectを認証保護の中心とし、OAuth設定値は公開リポジトリへ直接記述しません。開発時は次の環境変数、または端末内の `google_oauth_client.json` で設定します。

```text
VIDEO_DIGITIZER_GOOGLE_CLIENT_ID
VIDEO_DIGITIZER_GOOGLE_CLIENT_SECRET
~/Library/Application Support/VideoDigitizer/google_oauth_client.json
```

Google Cloud Consoleではアプリケーションの種類を `Desktop app` とし、OAuth同意画面へ公開プライバシーポリシーURLを登録します。

## アカウント別自動保存

アカウント固有ID `sub` のSHA-256をディレクトリ名に使用し、メールアドレスや氏名をファイルパスへ含めません。JSONは一時ファイルへ書き、`fsync` 後に置換します。ファイル権限は `0600`、1件の最大サイズは64MiBです。

これは同じMac内での再開機能です。クラウド保存とは独立して動作します。

## デジタイズデータのクラウド保存

クラウド保存はMacアプリ版、Googleログイン済み、クラウドAPI設定済み、利用者によるONの
4条件がそろった場合だけ動作します。5分ごとに明示的allowlistから作ったgzip JSONを送り、
Cloud RunでGoogle ID tokenの対象クライアントとメール確認状態を検証します。保存対象は座標、
点状態、マーカー、フレーム範囲、動画ハッシュ、FPS・解像度、較正・時刻・座標系設定です。
動画・画像・サムネイル・ファイル名・パス・研究メタデータ・AI候補・監査ログは拒否します。

Cloud Storageは非公開・世代管理、Firestoreは点数と更新時刻等の索引だけ、BigQueryは利用者が
確定操作をした座標行だけを保存します。アカウント固有IDはサーバー秘密鍵付きHMACで匿名化し、
別端末との同時更新はStorage generationによる楽観ロックで自動上書きを止めます。

## localhost API

- 127.0.0.1/localhost以外では待ち受けない
- 起動URLのbootstrap値は一回だけ受け付ける
- bootstrap後は `HttpOnly; SameSite=Strict` のセッションCookieを使用する
- APIは正しいHost、loopback Origin、セッションCookieがすべて一致した場合だけ処理する
- `frame-ancestors 'none'`、`X-Frame-Options: DENY`、Permissions Policyを付与する
- 動画は20GiB、アカウントキャッシュは64MiB、JSON操作は用途別上限を設ける

## 既知の限界

- ローカル自動保存は端末暗号化ではないため、同じmacOSユーザー権限を奪われた場合の機密性は保証できない
- ブラウザ版のIndexedDBはXSSやブラウザプロファイルへのローカルアクセスから保護されない
- OAuthクライアントの本番公開前に、Googleの同意画面、プライバシーポリシー、ブランド表示の審査要件を確認する
- セキュリティ設計は継続監査が必要であり、研究倫理審査や組織の情報管理規程を代替しない

## 参照

- Google OAuth 2.0 for Desktop Apps: https://developers.google.com/identity/protocols/oauth2/native-app
- Google OAuth Best Practices: https://developers.google.com/identity/protocols/oauth2/resources/best-practices
- Google API Services User Data Policy: https://developers.google.com/terms/api-services-user-data-policy
- OWASP HTML5 Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html
- Apple Keychain Services: https://developer.apple.com/documentation/security/keychain-services
