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
| Google DeepMind TAPNext++ source / optional checkpoint | 2026-06取得 | `third_party_licenses/TAPNet-Apache-2.0.txt` |
| PyTorch | 2.10.0 | `third_party_licenses/PyTorch-BSD-3-Clause.txt` |
| TorchVision | 0.25.0 | `third_party_licenses/TorchVision-BSD-3-Clause.txt` |
| einops | 0.8.2 | `third_party_licenses/einops-MIT.txt` |
| NetworkX | 3.6 | `third_party_licenses/NetworkX-BSD-3-Clause.txt` |
| SymPy | 1.14.0 | `third_party_licenses/SymPy-BSD-3-Clause.txt` |
| fsspec | 2026.7.0 | `third_party_licenses/fsspec-BSD-3-Clause.txt` |
| mpmath | 1.3.0 | `third_party_licenses/mpmath-BSD-3-Clause.txt` |
| Jinja2 / MarkupSafe | 3.1.6 / 3.0.3 | `third_party_licenses/Jinja2-BSD-3-Clause.txt`, `third_party_licenses/MarkupSafe-BSD-3-Clause.txt` |
| filelock | 3.32.2 | `third_party_licenses/filelock-Unlicense.txt` |
| Pillow | 12.3.0 | `third_party_licenses/Pillow-HPND.txt` |
| typing_extensions | 4.16.0 | `third_party_licenses/typing_extensions-PSF-2.0.txt` |

VideoDigitizerは、上記プロジェクトからの公認、提携、保証を受けるものではありません。

macOS配布版は、GPL版FFmpeg、x264/x265、GNU Readlineを同梱しません。XZ Utilsからは0BSDの`liblzma`のみを同梱します。リリース工程で実行時設定、アプリ内バイナリ、外部参照、ライセンス原文を検査します。

ライセンス通知と原文は、DMG内の文書に加え、`VideoDigitizer.app/Contents/Resources/legal` にも格納します。

`OpenCV-LICENSE-3RD-PARTY.txt` は上流プロジェクトが提供する包括的な通知であり、このビルドに含まれない任意コンポーネントの条件も記載されています。実際の同梱有無はアプリ内バイナリの監査結果を基準にします。
