# VideoDigitizer

動画をフレーム単位で確認しながら、身体計測点を手動でデジタイズするmacOS向け研究補助アプリです。

## ダウンロード

[最新版のVideoDigitizerをダウンロード](https://github.com/okutetsu0317/VideoDigitizer/releases/latest/download/VideoDigitizer-macos-arm64.dmg)

現在の配布版はApple Silicon搭載Mac向けです。Developer IDで署名し、Appleの公証を受けています。

## インストール

1. ダウンロードした `VideoDigitizer-macos-arm64.dmg` を開きます。
2. `VideoDigitizer.app` を任意の場所へコピーします。
3. `VideoDigitizer.app` をダブルクリックします。
4. ブラウザに表示された画面で `動画を開く` を押します。

## 特徴

- 元動画解像度基準のフレーム単位デジタイズ
- 編集可能な標準23点の初期マーカー構成
- 軌跡、骨格線、カーソル位置ズーム
- Excelライクな座標表のコピー・貼り付け
- 4点法による実長換算
- プロジェクト保存、CSV出力、品質チェック
- 距離、角度、速度、加速度、イベント区間の分析
- 動画と処理データを外部サーバーへ送らないローカル実行

## プライバシー

動画と座標は外部サーバーへ送信されません。アプリはユーザーのMac内で `127.0.0.1` に限定して動作します。

## 注意

VideoDigitizerは研究作業を補助するツールです。解析前に、動画、打点位置、欠測、較正条件、出力CSVを利用者自身で確認してください。

本アプリは独立して開発されており、既存の商用動作解析ソフトウェアとは提携、公認、互換保証の関係にありません。

ソースコードの利用条件は現在整理中です。この公開リポジトリは、署名済みアプリと利用文書の配布を目的としています。

## 文書

- [使い方](docs/user_guide_ja.md)
- [配布時の注意](docs/distribution_notes_ja.md)
- [第三者ソフトウェア](docs/THIRD_PARTY_NOTICES.md)
- [独立開発方針](docs/independent_development_ja.md)
