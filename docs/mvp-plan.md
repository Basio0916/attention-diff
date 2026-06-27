# MVP Plan

## 前提

MVPは Claude Code / Codex のプラグインコマンドとして起動する。

scoreはCLIだけで完結させない。GitHub CLIで取得したdiffを機械的に `diff.json` へ変換し、Codex / Claude Code が `attention.json` を生成する。

HTMLはrunごとに静的生成しない。固定viewerが `diff.json` と `attention.json` を読み込んでrenderする。

## マイルストーン1: プラグインコマンドとrun成果物

`/attention-diff 190` のようなコマンドで対象PRを解析する。

実行時に以下を行う。

- `gh` が利用可能か確認する
- PR番号またはURLを解決する
- `gh pr view` を取得する
- `gh pr diff` を取得する
- `.attention-diff/runs/<runId>/` を作る
- `diff.json` を保存する
- `--keep-artifacts` 指定時だけ `pr.json`, `raw.diff`, `scoring-prompt.md` を保存する

`runId` は以下の形式にする。

```text
pr-<number>-<headSha7>-<diffId8>
```

## マイルストーン2: diff.json

`gh pr diff` の結果から `diff.json` を生成する。

`diff.json` は以下を保持する。

- file / hunk / line の構造
- old/newの行番号
- コード本文
- 順序ベースのID
- `diffId`
- AI scoringに必要なコード本文

ID形式:

```text
file_0001
file_0001_hunk_0001
file_0001_hunk_0001_line_0001
```

MVPでは別のAI入力JSONを作らない。`diff.json` をviewerの正本兼AI scoring入力として扱う。

## マイルストーン3: AI scoring と attention.json

Codex / Claude Code が `diff.json` とrubricを読み、`attention.json` を生成する。

`attention.json` はコード本文を持たない。`diff.json` のIDを参照する。

必須要素:

- file attention
- hunk attention
- `reviewReason`
- `skimReason`
- `question`
- `attentionGroups`

`attentionGroups.kind` は2種類だけにする。

```text
highlighted
deemphasized
```

`attention` は1から5の整数とする。

## マイルストーン4: validation と repair

validationは2段階にする。

```text
Schema Validation:
  attention.json 単体の型、必須項目、値域、未知フィールド混入を見る。

Reference Validation:
  diff.json と突き合わせて fileId / hunkId / lineId を検証する。
  duplicate fileId / hunkId と missing fileId / hunkId もerrorにする。
```

validation error がある場合はAIにrepairを依頼する。repairは最大2回までとする。

2回失敗した場合はvalidation結果を表示し、viewerは通常diff表示にフォールバックする。validation結果は通常runの成果物としては保存しない。

## マイルストーン5: 固定viewer server

workspaceごとに1つのローカルviewer serverを起動または再利用する。

viewerは以下を行う。

- `diff.json` と `attention.json` を読み込む
- `hunkId` / `lineId` でjoinする
- file scoreをナビゲーションに使う
- hunk reasonを説明に使う
- `highlighted` / `deemphasized` groupを濃淡とラベルで表示する
- unified view / split view を切り替える
- 追加行は緑系、削除行は赤系の濃淡で表示する
- ローカル同梱のhighlight.jsを使い、file pathから推定した言語で控えめにシンタックスハイライトする
- `System` / `Light` / `Dark` のテーマ切り替えを提供し、手動選択はブラウザに記憶する

## マイルストーン6: 評価セット

`docs/eval-cases.md` にgolden PR風の例を作る。

各ケースには以下を含める。

- 入力diff
- 期待される `highlighted` group
- 期待される `deemphasized` group
- 期待されるhunk理由
- 必要に応じて、期待されるレビュアー向け質問

評価では、すべてのバグ発見ではなく、人間の判断が必要な箇所と軽く見てよい箇所の切り分けを確認する。

## 手動MVPフロー

実装後の手動確認手順は `docs/plugin-command-flow.md` に置く。

このフローは、プラグインコマンドの内部処理を分解したものとして扱う。
