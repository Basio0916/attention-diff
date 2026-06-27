# Attention Diff Editor Link Design

## 目的

Attention Diff viewer からローカルエディタの該当ファイルへ戻れる導線を追加する。

短期実装では VS Code だけを開ければよい。ただし、将来 Cursor、Zed、JetBrains IDE、Xcode、terminal などを追加しやすいように、データモデルと行解決はエディタ非依存にする。

この変更は GitHub Pull Requests VS Code 拡張を置き換えない。Attention Diff は「注意マップ」として、どの hunk や行を人間が確認すべきかを示し、詳細確認は IDE やローカルツールに戻って行えるようにする。

## 非目的

- VS Code companion extension や他エディタ向け extension は作らない。
- GitHub Pull Requests VS Code 拡張とは統合しない。
- 定義ジャンプ、関数ジャンプ、参照検索、AI問い合わせ導線は入れない。
- PR comment 投稿や suggested change 作成は入れない。
- `attention.json` にローカルファイルパスやエディタ情報を入れない。

## データモデル

`diff.json.source` に任意フィールドとして `workspacePath` を追加する。

```text
source.workspacePath?: string
```

`workspacePath` は Attention Diff を実行したローカル workspace の絶対パスを表す。

互換性のため必須にはしない。`workspacePath` がない既存 run や、別環境で生成された run ではエディタ導線を表示しない。

`attention.json` は変更しない。エディタリンク生成は viewer が `diff.json.source.workspacePath`, `file.path`, `line.newLine`, `hunk.lines` から決定的に行う。

## Opener設計

viewer 内では、行解決と opener URL 生成を分ける。

```text
resolvedLocation:
- absolutePath
- line
- column

openTarget:
- id
- label
- createUrl(resolvedLocation)
```

短期実装の `openTarget` は `vscode` だけにする。

```text
id: vscode
label: VS Code
url: vscode://file/<absolute-path>:<line>:1
```

将来別のエディタやツールを追加するときは、`openTarget` registry に provider を足す。行解決、fallback、`workspacePath`、`file.path` の扱いは再利用する。

provider ごとに URL scheme やパラメータ形式が違う可能性があるため、短期実装では VS Code 以外の scheme を仮実装しない。追加時に公式仕様または実機挙動を確認して provider を増やす。

## URL生成

viewer は、選択された `openTarget` の `createUrl` で URL を生成する。短期実装の VS Code provider は次の形式を使う。

```text
vscode://file/<absolute-path>:<line>:1
```

absolute path は `workspacePath` と `file.path` を結合して作る。`file.path` が `/dev/null` の場合や、対象行を決められない場合はリンクを生成しない。

URL内のパスは provider 側でURL安全にする。行番号は 1 以上の整数だけを許可する。列番号は短期実装では常に `1` とする。

## 行ジャンプルール

`add` と `context` 行は `line.newLine` へ飛ぶ。

`remove` 行は新しい作業ツリー上に存在しないため、同じ hunk 内で近い `newLine` へ fallback する。

fallback の優先順:

1. 対象 `remove` 行より後ろにある最初の `newLine`
2. 対象 `remove` 行より前にある最後の `newLine`
3. 候補がない場合はリンク非表示

削除ファイルや `newLine` を持つ行がない hunk ではリンクを出さない。

## UI

短期 UI は B 案にする。

- hunk ヘッダーに `VS Codeで開く` ボタンを出す。
- unified view と split view の両方で行番号をクリック可能にする。
- hunk ボタンは、その hunk 内で最初に開ける有効な new line へ飛ぶ。
- 行番号だけをクリック対象にする。コード本文、ラベル、理由カードはクリック対象にしない。
- リンクは控えめな見た目にし、diff の濃淡や attention label より目立たせない。
- `workspacePath` がない場合は、hunk ボタンも行番号リンクも表示しない。

短期実装では open target が VS Code 1つだけなので、ドロップダウンは出さない。将来 provider が2つ以上になったら、hunk ヘッダーは `次で開く` split button または menu に拡張する。行番号クリックは既定 target で開き、既定 target は localStorage などに保存できるようにする。

## エラーとフォールバック

対象エディタがインストールされていない、または URL scheme が OS に登録されていない場合、ブラウザ側で開けない可能性がある。短期実装では viewer 内で検出しない。

リンクを生成できない file/hunk/line は通常のテキスト表示に戻す。部分的にリンクを出せないことは viewer の読み込み失敗にしない。

## テスト方針

次の挙動をテストする。

- `prepareRun` が `workspacePath` を任意フィールドとして `diff.json.source` に入れる。
- `workspacePath` がない `diff.json` でも既存 viewer 表示が壊れない。
- hunk ヘッダーに VS Code provider のリンクが出る。
- add/context 行は `newLine` を使った VS Code URL になる。
- remove 行は同じ hunk 内の直後の `newLine`、なければ直前の `newLine` に fallback する。
- 削除ファイルや `/dev/null` ではリンクを出さない。
- 行解決 helper は provider に依存しない。

## 実装境界

実装は小さく分ける。

1. `diff.json.source.workspacePath` の生成を `prepareRun` / `parseUnifiedDiff` に追加する。
2. viewer に provider 非依存の行ジャンプ解決 helper と、VS Code open target を追加する。
3. hunk ヘッダーと行番号セルの rendering を更新する。
4. CSS で控えめなリンク表示を追加する。
5. テストで既存 run 互換性と fallback ルールを確認する。
