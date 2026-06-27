# Attention Diff Plugin Design

## 目的

Attention Diff は、GitHub Pull Request の diff の中で、人間の判断が必要な箇所と軽く見てよい箇所を視覚的に分ける。

MVP は Claude Code / Codex のプラグインコマンドとして起動する。CLI だけで score を完結させず、Codex / Claude Code がレビュー文脈を読んで `attention.json` を生成することを価値の中心に置く。

## 非目的

- 人間のレビューを置き換えない。
- AIレビューコメントをPRへ大量投稿しない。
- コード本文をAI出力JSONに再生成させない。
- 最初からGitHub Appや常設サービスを作らない。
- センシティブなファイル名だけを理由にファイル全体を強調しない。

## 全体アーキテクチャ

```text
/attention-diff 190
  ↓
gh pr view / gh pr diff
  ↓
diff.json 生成
  ↓
Codex / Claude Code が attention.json 生成
  ↓
validation
  ↓
local viewer server
  ↓
diff.json + attention.json を join して表示
```

`diff.json` は機械生成される diff の正本であり、コード本文、file、hunk、line、行番号を保持する。

`attention.json` はAIが生成する評価データであり、コード本文を持たず、`diff.json` のIDを参照する。

MVPでは `scoring-input.json` を生成しない。`diff.json` をviewerの正本兼AI scoring入力として扱う。

## 成果物ディレクトリ

MVPでは workspace 配下に `.attention-diff/` を作る。

```text
.attention-diff/
  server.json
  current-run.json
  runs/
    pr-190-def4567-a1b2c3d4/
      diff.json
      attention.json
```

通常runでは `diff.json` と `attention.json` だけを残す。parserやpromptの調査が必要な場合だけ `--keep-artifacts` を指定し、`pr.json`, `raw.diff`, `scoring-prompt.md` を追加で保存する。

`runId` は次の形式にする。

```text
pr-<number>-<headSha7>-<diffId8>
```

PRが更新されて `headSha` または `diffId` が変わった場合は別runとして保存する。

`server.json` は workspace viewer server の再利用に使う。MVPでは `pid`, `host`, `port`, `startedAt` を保存し、`/health` が `attention-diff-viewer` として応答する場合だけ既存serverを再利用する。応答しない場合は stale とみなし、新しいserverを起動して上書きする。

## ID設計

IDは diff 内の出現順に基づく。MVPではPR更新をまたぐ安定性は保証しない。

```text
fileId:  file_0001
hunkId:  file_0001_hunk_0001
lineId:  file_0001_hunk_0001_line_0001
groupId: file_0001_hunk_0001_group_0001
```

index は1始まり、4桁ゼロ埋めとする。

## diff.json

`diff.json` は viewer と validation の正本である。

必須フィールド:

```text
root:
- schemaVersion
- diffId
- generatedAt
- source
- files

source:
- provider
- repo
- prNumber
- baseRef
- headRef
- baseSha
- headSha
- title
- url

file:
- id
- path
- oldPath
- status
- additions
- deletions
- hunks

hunk:
- id
- header
- oldStart
- oldLines
- newStart
- newLines
- section
- lines

line:
- id
- type
- oldLine
- newLine
- content
```

nullable:

```text
file.oldPath: string | null
hunk.section: string | null
line.oldLine: number | null
line.newLine: number | null
```

`line.type` は `context`, `add`, `remove`, `meta` のいずれかにする。

## AI input

AIには `diff.json` と rubric と `attention.json` schema を渡す。AIはコードを読むが、出力にはコード本文を含めない。

## attention.json

`attention.json` はAIが生成するscoreと理由である。`diff.json` のIDのみを参照する。

必須フィールド:

```text
root:
- schemaVersion
- targetDiffId
- rubricVersion
- scoringPromptVersion
- agent.name
- agent.model
- files

file:
- fileId
- attention
- hunks

hunk:
- hunkId
- attention
- reviewReason
- skimReason
- question
- attentionGroups

group:
- id
- kind
- attention
- lineIds
- label
- reason
```

`question` は必須フィールドだが、値は `string | null` とする。`hunk.attention >= 4` の場合は原則として質問文を入れる。

`attention` は1から5の整数にする。

```text
1: かなり薄い
2: 薄い
3: 普通
4: 濃い
5: 最濃
```

`attentionGroups.kind` は2種類だけにする。

```text
highlighted    人間の確認が必要
deemphasized   軽く見てよい
```

groupに含まれない行は通常表示とする。

## UI方針

viewer は固定のWebアプリとして動き、`diff.json` と `attention.json` を読み込んで表示する。HTMLをrunごとに生成しない。

MVPの表示方針:

- file score はナビゲーションに使う。
- hunk score は理由とレビュー判断に使う。
- line/group score は視覚的な濃淡に使う。
- hunk上部に `reviewReason`, `skimReason`, `question` を表示する。
- 行には短い `label` を表示する。
- 詳細な `reason` は hover、click、または詳細表示で見せる。
- `highlighted` は濃く表示する。
- `deemphasized` は薄く表示する。
- 同じ薄い理由が連続する場合はラベルを間引いてよい。
- unified view と split view を切り替え可能にする。
- 追加行は緑系、削除行は赤系の濃淡で表示する。

## Validation

validation は2段階に分ける。

```text
Schema Validation:
  attention.json 単体の型、必須項目、値域を見る。

Reference Validation:
  diff.json と突き合わせて fileId / hunkId / lineId を検証する。
```

error:

- JSON parse不可
- 必須フィールド欠落
- 未知フィールド混入
- 型不一致
- attention範囲外
- kind不正
- targetDiffId不一致
- 存在しない fileId / hunkId / lineId
- 重複 fileId / hunkId
- missing fileId / hunkId
- lineIds空
- 同一hunk内で同じ lineId が複数groupに所属

warning:

- labelが長すぎる
- reasonが長すぎる
- questionが `attention >= 4` なのに null
- highlighted なのに attention が 1 または 2
- deemphasized なのに attention が 3 以上
- file/hunk attention が子要素の最大値とズレている
- attentionGroupsが空

validation error がある場合、AIに `attention.json` の修正を依頼する。repair は最大2回までにする。2回失敗した場合、viewerは `attention.json` なしで通常diff表示にフォールバックする。

## プラグインコマンド責務

プラグインコマンドはユーザー体験の入口であり、`score` の価値はCodex / Claude Codeが担う。

プラグインコマンドの責務:

1. `gh` が利用可能か確認する。
2. PR番号またはURLを解決する。
3. `gh pr view` と `gh pr diff` を実行する。
4. run directoryを作る。
5. `diff.json` を作る。
6. Codex / Claude Code に scoring prompt を実行させる。
7. `attention.json` を validation する。
8. 必要ならrepairを最大2回実行する。
9. local viewer server を起動または再利用する。
10. run URLを表示する。

## 設計判断

この設計では、コード本文の正本を `diff.json` に閉じ込め、AIにはscoreと理由だけを出力させる。これにより、コード本文をAIに再出力させるトークンコストと忠実性リスクを避けつつ、AIによる「人間の判断が必要な箇所」の評価をプロダクト価値として活かす。

薄い理由も `deemphasized` group として表現する。これにより、レビュー対象を強調するだけでなく、レビュアーが安心して読み飛ばせる根拠も提示できる。
