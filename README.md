# Attention Diff

Attention Diff は、GitHub Pull Request の diff を、人間の確認必要度に応じた濃淡つきビューで表示するローカルプラグインです。

目的は人間のレビューを置き換えることではありません。レビュアーが「どこを先に見るべきか」を判断しやすくすることです。

## できること

1. 対象 Pull Request に対して `gh pr view` と `gh pr diff` を実行します。
2. `.attention-diff/runs/<runId>/` に決定的な実行成果物を作成します。
3. Codex または Claude Code が `diff.json` を読み、`attention.json` を生成します。
4. `attention.json` を `diff.json` と突き合わせて検証します。
5. unified view / split view 対応のローカルdiffビューアを起動します。

## 必要なもの

- Node.js 20 以上
- 対象リポジトリにアクセスできる GitHub CLI (`gh`)
- `attention.json` を生成するための Codex または Claude Code

## Codexでインストール

```bash
codex plugin marketplace add Basio0916/attention-diff --ref main
codex plugin add attention-diff@attention-diff
```

インストール後、新しいCodexスレッドを開始するとskillが読み込まれます。

## Claude Codeでインストール

```bash
claude plugin marketplace add Basio0916/attention-diff
claude plugin install attention-diff@attention-diff
```

インストール後、Claude Codeを再起動するか新しいセッションを開始するとpluginが読み込まれます。

## インストール後の使い方

GitHubリポジトリ内で、CodexまたはClaude Codeに次のように依頼します。

```text
/attention-diff 190
```

`190` には対象のPull Request番号を指定します。Pull Request URLも指定できます。

## ライセンス

MIT
