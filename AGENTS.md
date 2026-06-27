# AGENTS.md

## プロジェクト概要

GitHub Pull Request向けのリッチdiffビューアを作る。

このプロジェクトの目的は、人間によるコードレビューを置き換えることではない。
目的は、人間のレビュアーが「どこに注意を向けるべきか」を判断しやすくすること。

特に、diffの中で **人間の判断が必要な箇所** を強調する。

中核となる考え方:

> 一般的なリスクではなく、人間に残された判断を強調する。

## プロダクト原則

1. auth、billing、migration、permissions などのセンシティブな領域にあるという理由だけで、ファイル全体を強調しない。
2. 正しさの判断に、プロダクト・業務・セキュリティ・運用・アーキテクチャ上の判断が必要なhunkや行を強調する。
3. 機械的変更、生成コード、既存パターンとの高い一致、十分にテストされた変更、機械的に検証しやすい変更は目立たせない。
4. なぜ強調されているのかを必ず説明する。
5. なぜ軽く見てよいのかも説明する。
6. 強い根拠がない限り、「バグ発見」ではなく「人間による確認が必要」という表現を使う。
7. コメントは、最初からPRに大量投稿するのではなく、まずは下書きやインライン注釈として表示する。

## 重要な設計ドキュメント

プロダクト仕様やスコアリングロジックを変更する前に、以下を読むこと。

- `docs/product-brief.md`
- `docs/attention-diff-rubric.md`
- `docs/mvp-plan.md`
- `docs/eval-cases.md`
- `docs/superpowers/specs/2026-06-27-attention-diff-plugin-design.md`

## スコアリングの考え方

人間の確認必要度は、リスクそのものではない。

billingファイルの中にも、低注意度の変更はある。
authファイルの中にも、低注意度の変更はある。
一見小さな条件式の変更でも、対象者・権限・デフォルト・状態遷移・業務ルールが変わるなら高注意度になり得る。

基本的には、次の考え方を使う。

```text
human_attention =
  human_judgment_need
  + semantic_novelty
  + evidence_gap
  + non_local_impact
  + irreversibility
  - pattern_confidence
  - machine_verifiability
```

## 高注意度にするシグナル

以下を変更するhunkを優先的に強調する。

- 対象者
- 権限
- role や plan ごとの挙動
- 閾値
- デフォルト値
- fallbackの挙動
- エラー時の挙動
- 状態遷移
- pricing、discount、tax、quota、entitlement などの業務ルール
- API契約
- event payload
- データ移行の意味
- transaction や idempotency の境界
- テスト、ドキュメント、issueリンク、PR説明で根拠が示されていない挙動

## 低注意度にするシグナル

以下のhunkは目立たせない。

- 生成コード
- importのみの変更
- formattingのみの変更
- renameのみの変更
- 型だけの変更
- lockfileのみの変更
- snapshotのみの変更。ただしsnapshot差分が挙動変更を示している場合は例外
- 繰り返しのcodemod的変更
- 既存パターンの高信頼なコピー
- 明確な入出力を持ち、十分なテストがある局所的な純粋アルゴリズム変更

## パターン一致の原則

新しいコードが既存パターンのコピーである場合、コピーされたブロック全体を強調しない。

代わりに以下を行う。

1. 最も近い既存パターンを特定する。
2. 類似度を計算または説明する。
3. 意味のある逸脱だけを強調する。
4. その逸脱が意図的に見えるのか、人間の確認が必要なのかを説明する。

## UI原則

主要UIはdiffヒートマップとする。

- ファイル単位のスコアは、ナビゲーション用途に使う。
- hunk単位のスコアは、説明とレビュー理由に使う。
- 行単位のスコアは、視覚的な強調に使う。
- 理由は主にhunkに紐づける。
- 強調行は、人間の注意が必要な実際の変更行を指す。
- 薄く表示する行にも、軽く見てよい理由を示す。
- 追加行は緑系、削除行は赤系の濃淡で表示する。
- unified view と split view を切り替え可能にする。
- シンタックスハイライトは補助情報として扱い、赤緑の濃淡より強く見せない。
- テーマはブラウザ設定に従う `System` を初期値とし、`Light` / `Dark` の手動選択を記憶できるようにする。

## 出力モデル

内部的には構造化JSONを優先する。

MVPでは、表示用の正本とAI評価を分離する。

- `diff.json`: 機械生成するdiffの正本。コード本文、file、hunk、line、行番号を持ち、AI scoring入力も兼ねる。
- `attention.json`: AIが生成するscoreと理由。コード本文は持たず、`diff.json` のIDを参照する。

各hunkは、少なくとも以下の情報を表現できるようにする。

- ファイルパス
- 行範囲
- 人間の確認必要度
- 間違えた場合のリスク
- 機械的検証のしやすさ
- パターン一致度
- 根拠の強さ
- 意味的な変更
- レビューすべき理由
- 軽く見てよい理由
- レビュアー向けの確認質問
- 強調行
- 軽く見てよい行群

`attention.json` の行群は `attentionGroups` として表現する。

- `highlighted`: 人間の確認が必要な行群
- `deemphasized`: 軽く見てよい行群

## 開発方針

最初は、Claude Code / Codex のプラグインコマンドとして、GitHub CLIで対象PRを取得し、ローカルviewerで表示する。

いきなりGitHub AppやVS Code拡張から始めない。HTMLをPRごとに静的生成するのではなく、固定viewerがJSONを読み込んでrenderする。

最初のマイルストーンは以下。

1. `gh pr view` / `gh pr diff` を実行する。
2. `raw.diff` から `diff.json` を生成する。
3. Codex / Claude Code が `diff.json` とrubricを読み、`attention.json` を生成する。
4. `attention.json` をschema validation / reference validationする。
5. 固定viewer serverで `diff.json` と `attention.json` をjoinして表示する。
6. hunk単位の理由、濃い行、薄い行の理由を含める。
7. 評価用のサンプルケースを含める。

## コーディング方針

- 実装は小さく、テストしやすく保つ。
- diff parse、ID付与、JSON validation、viewer renderは決定的に実装する。
- `attention.json` は未知フィールドを許可しない。`diff.json` のfile/hunkを重複なく全て参照する。
- hunk/lineのscoreと理由付けは、プラグインコマンド上のCodex / Claude Codeが担う。
- 例示以上に、特定ドメイン固有の単語をハードコードしすぎない。
- スコアリング挙動にはテストを追加する。
- スコアリングロジックを変更したら、`docs/eval-cases.md` を更新する。
