# mamolii グラフ電卓（graph-calc-jp）

Desmos風のグラフ電卓を、日本の高校数学（数学I・II・III・A・B）で使える範囲に絞って実装したWebアプリ。日本人学生向けに日本語UI・日本語チュートリアルを完備。

案件: T-20261019-DESMOS（05_projects/graph-calc-jp）

## 特長

- **高校数学レベルのグラフ**: y=f(x)、x=g(y)、円や放物線などの陰関数、不等式の領域、点、導関数 d/dx
- **スライダー変数 a, b**: 式に書くだけでスライダーが現れ、▶でアニメーション
- **別名表示（独自機能）**: a, b に「x」「p」「n」などの別名を設定して表示できる（内部計算はa,bのまま）。変数は x, y, a, b だけという本アプリの規則の上で、教材や単元に合わせた見た目を実現
- **日本語UI**: エラーメッセージまで日本語。入力は自動保存
- **依存ゼロ・ビルド不要**: 素のHTML/CSS/JS。静的配信ならどこでも動く

## 実行方法（ローカル）

```sh
cd app
python3 -m http.server 8080
# ブラウザで http://localhost:8080/ を開く
```

（ES Modulesを使用するため `file://` 直接オープンではなくHTTP経由で開く）

## テスト

```sh
node tests/test-parser.mjs     # パーサ・評価器 13件
node tests/test-classify.mjs   # 式種別判定 15件
```

## 構成

```
graph-calc-jp/
├── app/            配信物の正本（Cloudflare Pagesのルート）
│   ├── index.html
│   ├── css/style.css
│   ├── js/         parser / evaluator / classify / grapher / pretty / app
│   └── tutorial/   日本語チュートリアル
├── docs/           SPEC / RESEARCH / DEPLOYMENT
├── tests/          単体テスト(node)
└── evidence/       検証証拠(スクリーンショット・実行記録)
```

## 公開

GitHubでソース管理し、Cloudflare Pagesへデプロイする。手順と証拠は docs/DEPLOYMENT.md。

設計方針: 09_operations/policies/WEB_DELIVERY.md に従い、制作AIと配信基盤を分離、依存ゼロで他配信先（GitHub Pages等）にも移設可能な構成。
