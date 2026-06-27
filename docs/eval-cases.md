# Eval Cases

これらのケースは、Attention Diffの期待挙動を定義する。

目的は、すべてのバグを完璧に検出することではない。
目的は、人間の判断が必要な変更を強調し、軽く見てよい変更を目立たせないこと。

期待値は `attention.json` の考え方で記述する。

- 人間の確認が必要な行群は `highlighted` group とする。
- 軽く見てよい行群は `deemphasized` group とする。
- `attention` は1から5の整数とする。
- コード本文は `attention.json` に含めず、`lineId` を参照する。

## Case 001: billingファイルのimportのみ

入力:

```diff
diff --git a/src/billing/formatter.ts b/src/billing/formatter.ts
index 1111111..2222222 100644
--- a/src/billing/formatter.ts
+++ b/src/billing/formatter.ts
@@ -1,3 +1,4 @@
+import { formatCurrency } from "@/utils/currency"

 export function renderAmount(amountCents: number) {
   return `${amountCents}`
 }
```

期待:

- human_attention: 1
- hunk attention: 1
- `deemphasized` group: import追加行
- label: importのみ
- reason: importのみで、挙動変更は検出されていない
- `highlighted` groupは作らない
- 業務ロジック行は強調しない
- 軽く見てよい

## Case 002: trialユーザーがenterprise discountを受ける

入力:

```diff
diff --git a/src/billing/discountPolicy.ts b/src/billing/discountPolicy.ts
index 1111111..2222222 100644
--- a/src/billing/discountPolicy.ts
+++ b/src/billing/discountPolicy.ts
@@ -10,7 +10,7 @@ export function shouldApplyVolumeDiscount(user: User, plan: Plan) {
-  if (plan === "enterprise") {
+  if (plan === "enterprise" || user.isTrial) {
     return true
   }

   return false
 }
```

期待:

- human_attention: 5
- hunk attention: 5
- `highlighted` group: 変更された条件行
- label: discount対象条件の変更
- 理由で「対象条件が変わった」ことに触れる
- 理由で「業務判断が必要」なことに触れる
- レビュアー向け質問で、trialユーザーがenterprise discountを受けてよいのか確認する

## Case 003: auth policyへのalias追加

入力:

```diff
diff --git a/src/auth/teamPolicy.ts b/src/auth/teamPolicy.ts
index 1111111..2222222 100644
--- a/src/auth/teamPolicy.ts
+++ b/src/auth/teamPolicy.ts
@@ -20,3 +20,5 @@ export function canReadTeamSettings(user: User, team: Team) {
   return user.teamId === team.id
 }

+export const canReadTeamBilling = canReadTeamSettings
+
```

期待:

- human_attention: 2
- hunk attention: 2
- `deemphasized` group: alias追加行
- label: 既存policyのalias
- `highlighted` groupは原則作らない
- 理由で、既存policyへのaliasであることに触れる
- 理由で、新しいpredicateが導入されていないことに触れる
- 安全、またはほぼ安全に軽く見てよい

## Case 004: コピーされたroute内の権限逸脱

入力:

```diff
diff --git a/src/routes/teamBilling.ts b/src/routes/teamBilling.ts
index 1111111..2222222 100644
--- a/src/routes/teamBilling.ts
+++ b/src/routes/teamBilling.ts
@@ -1,8 +1,8 @@
 export async function updateTeamBillingLimit(req: Request, res: Response) {
   const user = await requireUser(req)
   const team = await requireTeam(req.params.teamId)

-  await requireTeamAdmin(user, team)
+  await requireTeamMember(user, team)

   const limit = parseLimit(req.body.limit)
   await billingService.updateLimit(team.id, limit)
```

期待:

- 類似routeパターンが存在するなら、コピーされたブロックの大部分は低注意度にする
- `deemphasized` group: 既存routeパターンと一致する周辺行
- `highlighted` group: 権限行
- 変更された権限行の human_attention: 5
- label: 権限要件の変更
- 理由で、権限要件が既存パターンから逸脱していることに触れる
- レビュアー向け質問で、team memberがbilling limitを更新してよいのか確認する

## Case 005: 強いテストがある純粋アルゴリズム変更

入力:

```diff
diff --git a/src/utils/search.ts b/src/utils/search.ts
index 1111111..2222222 100644
--- a/src/utils/search.ts
+++ b/src/utils/search.ts
@@ -1,5 +1,5 @@
 export function findIndex(items: number[], target: number): number {
-  return items.findIndex((item) => item === target)
+  return binarySearch(items, target)
 }
```

期待:

- human_attention: 2 または 3
- hunk attention: 2 または 3
- `deemphasized` group: 変更行または周辺行
- label: 局所的アルゴリズム
- 理由で、局所的なアルゴリズム変更であることに触れる
- 業務判断として扱わない
- empty、found、not found、boundary caseがテストされている場合、注意度を下げてもよい

## Case 006: アルゴリズムに見えるが業務判断が必要な変更

入力:

```diff
diff --git a/src/recommendation/ranking.ts b/src/recommendation/ranking.ts
index 1111111..2222222 100644
--- a/src/recommendation/ranking.ts
+++ b/src/recommendation/ranking.ts
@@ -8,7 +8,7 @@ export function rankProjects(projects: Project[]) {
   return projects.sortBy((project) => {
-    return project.createdAt
+    return project.estimatedRevenue
   })
 }
```

期待:

- human_attention: 5
- hunk attention: 5
- `highlighted` group: sort key変更行
- label: ランキング基準の変更
- 理由で、ランキング挙動が変わったことに触れる
- 理由で、プロダクトまたは業務上の意図が必要なことに触れる
- レビュアー向け質問で、売上見込みベースの並び順が意図したものか確認する

## Case 007: デフォルト挙動の変更

入力:

```diff
diff --git a/src/billing/limits.ts b/src/billing/limits.ts
index 1111111..2222222 100644
--- a/src/billing/limits.ts
+++ b/src/billing/limits.ts
@@ -2,7 +2,7 @@ const DEFAULT_LIMIT = 100

 export function getLimit(team: Team) {
-  return team.limit ?? DEFAULT_LIMIT
+  return team.limit ?? 0
 }
```

期待:

- human_attention: 5
- hunk attention: 5
- `highlighted` group: fallback値変更行
- label: デフォルト挙動の変更
- 理由で、デフォルト挙動が変わったことに触れる
- 理由で、未設定の既存値の挙動が変わる可能性に触れる
- レビュアー向け質問で、missing limitが今後は0を意味してよいのか確認する

## Case 008: 繰り返しのcodemod

入力:

```diff
diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,3 @@
-const name = user && user.name
+const name = user?.name

diff --git a/src/b.ts b/src/b.ts
index 1111111..2222222 100644
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,3 +1,3 @@
-const email = user && user.email
+const email = user?.email
```

期待:

- 繰り返しの機械的変換として human_attention: 1 または 2
- hunk attention: 1 または 2
- `deemphasized` group: 同型のcodemod行
- label: 繰り返しのcodemod
- `highlighted` groupは、意味のある逸脱がない限り作らない
- 理由で、codemod的な繰り返し変更であることに触れる
- 代表例だけ表示してよい
- 残りの同一変換は折りたたみ可能にする
