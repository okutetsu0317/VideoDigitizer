# Third-Party Software Notices

VideoDigitizerのmacOS配布物には、以下の第三者ソフトウェアが含まれます。
各ソフトウェアの利用条件は、同梱するライセンス原文を確認してください。

| Software | Version | License file |
| --- | --- | --- |
| Python | 3.13.1 | `third_party_licenses/Python-LICENSE.txt` |
| OpenCV / opencv-python (FFmpeg無効、AVFoundation有効のmacOS用ソースビルド) | 4.12.0.88 | `third_party_licenses/OpenCV-LICENSE.txt` |
| OpenCV bundled components | 4.12.0.88 | `third_party_licenses/OpenCV-LICENSE-3RD-PARTY.txt` |
| NumPy | 2.2.6 | `third_party_licenses/NumPy-LICENSE.txt` |
| PyInstaller bootloader | 6.20.0 | `third_party_licenses/PyInstaller-COPYING.txt` |
| OpenSSL (`libssl` / `libcrypto`) | 3.4.0 | `third_party_licenses/OpenSSL-LICENSE.txt` |
| XZ Utils (`liblzma`のみ) | 5.6.3 | `third_party_licenses/XZ-COPYING.txt`, `third_party_licenses/XZ-COPYING-0BSD.txt` |
| mpdecimal (`libmpdec`) | 4.0.0 | `third_party_licenses/mpdecimal-COPYRIGHT.txt` |
| MediaPipe Tasks Vision / Pose Landmarker Lite | 1.0.1 / 2026-05取得 | `third_party_licenses/MediaPipe-Apache-2.0.txt` |

VideoDigitizerは、上記プロジェクトからの公認、提携、保証を受けるものではありません。

macOS配布版は、GPL版FFmpeg、x264/x265、GNU Readlineを同梱しません。XZ Utilsからは0BSDの`liblzma`のみを同梱します。リリース工程で実行時設定、アプリ内バイナリ、外部参照、ライセンス原文を検査します。

ライセンス通知と原文は、DMG内の文書に加え、`VideoDigitizer.app/Contents/Resources/legal` にも格納します。

`OpenCV-LICENSE-3RD-PARTY.txt` は上流プロジェクトが提供する包括的な通知であり、このビルドに含まれない任意コンポーネントの条件も記載されています。実際の同梱有無はアプリ内バイナリの監査結果を基準にします。
