# Product Brief: Attention Diff

## 問題

AI支援によるコーディングによって、Pull Requestの数やサイズが増えている。
AIはコードを素早く生成できるが、人間のレビュアーは依然としてボトルネックになっている。

既存のPR diffツールは「何が変わったか」は見せてくれる。
しかし、「どこに人間の判断が必要か」は十分に示してくれない。

## 目的

人間のレビュアーが、PRの中で人間の判断が必要な箇所に集中できるリッチdiffビューアを作る。

このプロダクトは、次の問いに答える。

- まず何を見るべきか？
- どのhunkに人間の判断が必要か？
- なぜこのhunkが強調されているのか？
- どの変更は軽く見てもよさそうか？
- hunk内のどの行に注意すべきか？
- 確認が必要な場合、authorにどの質問をすべきか？

## 非目的

- 人間のレビューを置き換えない。
- AIレビューコメントをPRに大量投稿しない。
- 強い根拠がない限り、コードを「間違っている」と断定しない。
- 危険そうなドメインに属しているという理由だけで、ファイル全体を強調しない。
- ローカルのプラグインコマンドとviewerで価値検証する前に、完全なGitHub Appを作らない。
- コード本文をAI出力JSONに再生成させない。

## 中核コンセプト

一般的なリスクではなく、人間に残された判断を強調する。

例:

- billingファイルでも、変更が機械的なら大部分は低注意度になり得る。
- authファイルでも、既存policyへのalias追加なら低注意度になり得る。
- 小さな条件式変更でも、対象者や権限が変わるなら高注意度になり得る。
- 既存パターンのコピーは大部分を低注意度にし、逸脱部分だけを強調する。

## 初期ユーザー

AI生成PRの量が増えているコードベースで、GitHub PRをレビューしている人間のレビュアー。

## MVP

入力:

- GitHub Pull Request番号またはURL
- GitHub CLIで取得したPR metadataとdiff

出力:

- `.attention-diff/runs/<runId>/diff.json`
- `.attention-diff/runs/<runId>/attention.json`
- ローカルviewer URL

MVP機能:

1. Claude Code / Codex のプラグインコマンドで起動する。
2. `gh pr view` / `gh pr diff` から `diff.json` を機械生成する。
3. Codex / Claude Code が `diff.json` をAI scoring入力として読み、`attention.json` を生成する。
5. `attention.json` をschema validation / reference validationする。
6. 固定viewerが `diff.json` と `attention.json` をjoinして表示する。
7. レビュー優先度順のファイル一覧を表示する。
8. hunk単位の人間確認必要度スコアを表示する。
9. `highlighted` / `deemphasized` の行群を濃淡と理由つきで表示する。
10. 自動投稿ではなく、コメント下書きや確認質問を表示する。
11. MVPでは理由、確認質問、行ラベルを日本語で表示する。
