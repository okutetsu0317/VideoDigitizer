# 知的財産・配布監査記録

確認日: 2026-08-10

この記録は開発上の確認であり、弁護士・弁理士による法的意見ではありません。

## 確認結果

- 公開画面、配布文書、ソースコードに、特定の商用動作解析製品の名称、ロゴ、スクリーンショット、マニュアル文言、独自ファイル形式名を使用していない
- 動画のフレーム操作、2次元座標入力、CSV、4点平面較正などは一般的な研究機能・技術用語として独自実装している
- 第三者製品の非公開仕様を互換仕様として実装していない
- 主要計算式、公開API、AI実装の取得元とコミットを `technical_provenance_ja.md` に記録している
- MediaPipe、TAPNext++、OpenCV、PyTorch、Python、PyInstallerなどの通知とライセンス原文を配布物へ同梱している
- macOS配布版はGPL版FFmpeg、x264、x265を同梱しない構成を機械監査している
- GoogleログインボタンはGoogle公式の2026年版承認済みブランド素材を使用し、独自ロゴを作成していない

## 著作権上の整理

日本の著作権法はプログラムを著作物として例示する一方、プログラム言語、規約、解法へ保護が及ばないと定めています。したがって一般的な機能や計算方法を実装すること自体と、他者のソースコード、画面素材、説明文などの具体的表現を複製することは区別して管理します。

VideoDigitizerでは、他社コードや画面素材を参照実装として取り込まず、公開API、一般数式、学術論文、ライセンスされたオープンソースを出典付きで利用します。

## 残るリスク

- 著作権とは別に、製品名・ロゴには商標権、技術には特許権が成立している可能性がある
- 画面全体が特定製品の創作的表現と実質的に近いかは、機能名の削除だけでは判断できないため、独自UIの継続が必要
- 他製品との置き換えや仕様一致、提携関係をうたう広告表現は、関係性や品質保証を誤認させる可能性がある
- 無償提供でも権利侵害が免除されるわけではない
- Google OAuth公開時はGoogle API規約、User Data Policy、ブランドガイドライン、プライバシー表示へ継続対応する必要がある

## 配布前の必須確認

1. `scripts/audit_independence.sh` を実行する
2. `scripts/audit_binary_licenses.sh` を配布アプリへ実行する
3. `docs/THIRD_PARTY_NOTICES.md` とライセンス原文をDMGへ同梱する
4. 公開ページにプライバシーポリシーを置き、OAuth同意画面へ同じURLを登録する
5. 製品名・ロゴ・画面・説明文について、広範な配布前に知的財産の専門家へ最終確認する
6. 特許クリアランスが必要な配布規模になった場合は、キーワード検索だけで結論を出さず弁理士による調査を行う

## 公的・公式資料

- e-Gov 著作権法 第2条・第10条: https://laws.e-gov.go.jp/law/345AC0000000048
- Google OAuth 2.0 Policies: https://developers.google.com/identity/protocols/oauth2/policies
- Google API Services User Data Policy: https://developers.google.com/terms/api-services-user-data-policy
- Google Sign in Branding Guidelines: https://developers.google.com/identity/branding-guidelines
