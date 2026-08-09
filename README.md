# VideoDigitizer

動画をフレーム単位で確認しながら、身体計測点を手動でデジタイズする研究補助アプリです。インストール不要のWeb版と、特殊な動画形式にも対応しやすいmacOS版があります。

## Web版を使う

[VideoDigitizer Webを開く](https://okutetsu0317.github.io/VideoDigitizer/)

Web版では、選択した動画をGitHubや外部サーバーへアップロードせず、ブラウザ内でフレームを処理します。MP4/H.264を推奨します。プロジェクトはブラウザ内にも自動保存されますが、重要な作業は `プロジェクト保存` でファイルとして残してください。

## macOS版をダウンロード

[最新版のVideoDigitizerをダウンロード](https://github.com/okutetsu0317/VideoDigitizer/releases/latest/download/VideoDigitizer-macos-arm64.dmg)

現在の配布版はApple Silicon搭載Mac、macOS 15以降向けです。Developer IDで署名し、Appleの公証を受けています。

## インストール

1. ダウンロードした `VideoDigitizer-macos-arm64.dmg` を開きます。
2. `VideoDigitizer.app` を任意の場所へコピーします。
3. `VideoDigitizer.app` をダブルクリックします。
4. ブラウザに表示された画面で `動画を開く` を押します。

## 特徴

- 元動画解像度基準のフレーム単位デジタイズ
- 端末内AIによる姿勢候補と、採用・却下・信頼度記録
- 編集可能な標準23点の初期マーカー構成
- 軌跡、骨格線、カーソル位置ズーム
- Excelライクな座標表のコピー・貼り付け
- 4点法による実長換算
- プロジェクト保存、CSV出力、品質チェック
- 距離、角度、速度、加速度、イベント区間の分析
- 動画と処理データを外部サーバーへ送らないローカル実行

## プライバシー

Web版で選択した動画、座標、AI推論結果は外部サーバーへ送信されません。Webアプリ本体、同梱AIモデル、JavaScript、CSS、画像だけをGitHub Pagesから取得し、CSPとAIワーカー内の通信制限で外部通信を遮断します。macOS版はユーザーのMac内で `127.0.0.1` に限定して動作します。

AI姿勢候補は阿江式23点のうちモデルと定義が対応する18点が対象です。採用するまで座標表や分析値には入らず、研究者による確認を前提とします。

## 注意

VideoDigitizerは研究作業を補助するツールです。解析前に、動画、打点位置、欠測、較正条件、出力CSVを利用者自身で確認してください。

本アプリは独立して開発されており、既存の商用動作解析ソフトウェアとは提携、公認、互換保証の関係にありません。

ソースコードの利用条件は現在整理中です。この公開リポジトリは、Webアプリ、署名済みmacOSアプリ、利用文書の配布を目的としています。

## 文書

- [使い方](docs/user_guide_ja.md)
- [配布時の注意](docs/distribution_notes_ja.md)
- [第三者ソフトウェア](docs/THIRD_PARTY_NOTICES.md)
- [独立開発方針](docs/independent_development_ja.md)
- [技術実装の来歴](docs/technical_provenance_ja.md)
