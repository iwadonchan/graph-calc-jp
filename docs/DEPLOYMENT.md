# デプロイ手順と証拠（GitHub → Cloudflare Pages）

根拠: 利用者指定「github経由で、claudflareにデプロイします」＋ 09_operations/policies/WEB_DELIVERY.md。
制作AIと配信基盤は分離。配信物は `app/` のみ（静的ファイル、依存ゼロ、ビルド不要）。

## 構成

- リポジトリ: github.com/iwadonchan/graph-calc-jp（公開）
- 配信: Cloudflare Pages（静的アセット、ルート = リポジトリの `app/` ディレクトリ）
- ビルドコマンド: なし（静的配信）
- 出力ディレクトリ: `app`

## 手順（実施記録は evidence/deployment-evidence.md に追記）

1. `app/` を配信正本とし、社内資料(docs/, tests/, evidence/)はリポジトリに含めるが配信ルートから分離
2. GitHubにリポジトリを作成しpush
3. Cloudflare Pagesへ接続（wrangler CLI またはダッシュボードのGit連携）
4. デプロイ結果のURLと対象リビジョンを記録

## 公開報告の要件（WEB_DELIVERY.md）

- 公開済みと報告するときは対象リビジョン（commit hash）と配信結果の証拠（URL・ステータス）を添える
- ローカル検証を公開成功と報告しない

## 実施記録

（実施後に追記する）
