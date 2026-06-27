# Attention Diff Rubric

## 中核となる区別

間違えた場合のリスクと、人間の確認必要度は同じではない。

間違えた場合のリスク:

> この変更が間違っていた場合、どれくらい悪い影響があるか？

人間の確認必要度:

> この変更をapproveするために、どれくらい人間の判断が必要か？

UIのヒートマップは、主に人間の確認必要度を表現する。

## 人間の確認必要度スコア

```text
1: 軽く見ればよい
2: 軽いレビュー
3: 通常レビュー
4: 注意深いレビュー
5: 必ず見るべき
```

UIではこのスコアを file、hunk、attention group に使う。

- file score はナビゲーションに使う。
- hunk score は説明とレビュー判断に使う。
- group score は行の濃淡に使う。

## 人間の確認必要度を上げる変更

以下に影響する変更は、人間の確認必要度を上げる。

- 誰が何をできるか
- 誰が何を受け取るか
- 誰に課金されるか
- 誰が除外されるか
- ユーザーが対象条件を満たすかどうか
- デフォルト挙動
- fallback挙動
- 閾値や境界値の挙動
- 状態遷移
- エラー処理
- public API契約
- event / webhook payload
- データ移行の意味
- rollbackやrecoveryの挙動
- idempotencyやtransactionの境界
- pricing、discount、tax、quota、entitlementのロジック

## 人間の確認必要度を下げる変更

以下の変更は、人間の確認必要度を下げる。

- 生成コード
- importのみ
- formattingのみ
- renameのみ
- 型だけの変更
- lockfileのみ
- 繰り返しのcodemod
- 既存パターンの高信頼なコピー
- 強いテストでカバーされている変更
- 機械的に検証しやすい変更
- 入出力が明確な局所的な純粋関数の変更

## 重要な例

### 高注意度の例

```diff
- if (plan === "enterprise") {
+ if (plan === "enterprise" || isTrialUser) {
    applyVolumeDiscount()
  }
```

理由:

- discountの対象条件が変わっている
- 業務判断が必要
- trialユーザーがenterprise相当の挙動を受ける可能性がある

### billingファイル内の低注意度の例

```diff
+ import { formatCurrency } from "@/utils/currency"
```

理由:

- importのみ
- 挙動変更は検出されていない

### 既存パターンのコピーにおける高注意度の例

新しいrouteが既存のadmin-only routeと92%似ているが、この行だけ異なる場合:

```diff
- requireAdmin(user)
+ requireMember(user)
```

理由:

- コピーされたパターンの大部分は一致している
- 権限要件だけが逸脱している
- 意図したaccess levelかどうか、人間が確認すべき

## 強調ルール

- 行を強調し、hunkで説明する。
- センシティブなファイル内の全行を強調しない。
- 意味のある最小範囲を強調する。
- 条件式が複数行にまたがる場合、それらの行をグループ化する。
- 削除行も追加行と同じくらい重要になり得る。
- 個々の行が無害に見えても、順序変更が重要な場合がある。
- 軽く見てよい行群も `deemphasized` として理由を示す。
- 濃くする行群は `highlighted` として理由を示す。

`attentionGroups.kind` はMVPでは2種類だけにする。

```text
highlighted: 人間の確認が必要
deemphasized: 軽く見てよい
```

## 推奨する表現

慎重な表現を使う。

推奨:

- 人間による確認が必要
- 人間の判断が必要
- 挙動変更の可能性
- 対象条件が変更されている
- 権限境界が変更されている
- 根拠が見つからない
- 次の理由により軽く見てよい

避ける:

- バグ発見
- これは間違っている
- 修正必須
- 脆弱性
- ロジックが壊れている

強い表現は、証拠が非常に強い場合にのみ使う。
