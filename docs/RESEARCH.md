# Desmos機能調査（2026-10-19）

並列調査担当AIによるWeb調査の結果を案件用に整理したもの。出典は末尾。

## 調査結果の要点（JSON原典）

```json
{
  "input_syntax": [
    {"form": "明示関数 y=f(x)", "example": "y=2x+1 / y=x^2+1", "result": "xの関数として曲線を描画。入力と同時にグラフが描かれる", "grade": "数学I"},
    {"form": "x=g(y)", "example": "x=sqrt(1-y^2)", "result": "yを独立変数とした曲線を描画(右半円など)", "grade": "数学I"},
    {"form": "陰関数(方程式)", "example": "x^2+y^2=1 / y^2+sin(x)y+x=2", "result": "x,yを満たす組を陰関数としてプロット。2次曲線(楕円・双曲線・放物線)もこの形式", "grade": "数学II"},
    {"form": "不等式(境界を含む <=, >=)", "example": "y>=2x+1 / x^2+y^2<=25", "result": "領域を半透明で塗りつぶし、境界線は実線", "grade": "数学I"},
    {"form": "不等式(厳密 <, >)", "example": "y>x^2 / x^2+y^2<4", "result": "領域を塗りつぶし、境界線は破線", "grade": "数学I"},
    {"form": "点", "example": "(1,0)", "result": "座標に点をプロット。ドラッグ可能な点にできる", "grade": "数学I"},
    {"form": "動かせる点(変数座標)", "example": "(a,b)", "result": "ドラッグで動かせてスライダーが連動する点", "grade": "共通"},
    {"form": "媒介変数表示", "example": "(2cos(t),3sin(t))", "result": "点と同じ形式で媒介変数tの曲線", "grade": "数学III"},
    {"form": "極座標", "example": "r=sin(5θ)", "result": "rとθを含む式は極形式として扱われる", "grade": "数学III"},
    {"form": "定義域制限", "example": "y=x{-2<x<2}", "result": "式の末尾に{}で制限", "grade": "共通"},
    {"form": "関数の定義と評価", "example": "f(x)=x^2+3x、f(3)", "result": "関数名を付けて定義・評価", "grade": "数学II"},
    {"form": "リスト", "example": "a=[1,2,3] / y=x+[1,3,5]", "result": "複数曲線を一括描画", "grade": "数学A"},
    {"form": "テーブル", "example": "x1,y1列で点をプロット", "result": "表形式の入力と計算列", "grade": "共通"},
    {"form": "回帰分析", "example": "y1~mx1+b", "result": "残差二乗和最小のパラメータ自動調整", "grade": "数学A・C"},
    {"form": "微分", "example": "d/dx(x^2) / f'(x)", "result": "導関数のプロット・評価", "grade": "数学II・III"},
    {"form": "定積分", "example": "∫_0^3 f(x)dx", "result": "定積分値の評価・面積関数", "grade": "数学II・III"},
    {"form": "総和", "example": "Σ_{n=1}^{10} 1/2^n", "result": "総和・総乗", "grade": "数学B"}
  ],
  "slider_behavior": "未定義変数で「スライダーを追加」。既定範囲-10〜10、下限/上限/step編集可。▶でアニメーション(往復・一方向等)。複数式で変数共有時に連動。(a,f(a))は曲線上の動点。",
  "graph_interaction": "ドラッグでパン、ホイール/ピンチ/+-ボタンでズーム、既定ビュー復帰、軸step設定(π刻み)、ラジアン/度数法切替、注目点の座標表示。",
  "style_options": "6色パレット: RED #c74440, BLUE #2d70b3, GREEN #388c46, PURPLE #6042a6, ORANGE #fa7e19, BLACK #000000。線: 実線/破線/点線。不等式は厳密=破線境界・非厳密=実線境界。",
  "priorities_for_hs_clone": "P0必須: y=f(x)/x=g(y)/陰関数/不等式/点/スライダー/コア関数群/微分/6色+線スタイル/ズーム・パン/度数法切替。推奨: 極座標・媒介変数・リスト・回帰・分布。省略可: 3D・複素・行列・Geometry。",
  "sources": [
    "https://www.desmos.com/calculator",
    "https://help.desmos.com/hc/en-us/articles/212235786-Supported-Functions",
    "https://help.desmos.com/hc/en-us/articles/202529069-Sliders-and-Movable-Points-in-a-Graph",
    "https://help.desmos.com/hc/en-us/articles/202529279-Desmos-Graphing-Calculator-User-Guide",
    "https://www.desmos.com/static-assets/user-guide-pdfs/Desmos_User_Guide_JA.pdf",
    "https://help.desmos.com/hc/en-us/articles/4406809433613-Derivatives",
    "https://help.desmos.com/hc/en-us/articles/4406810279693-Integrals",
    "https://help.desmos.com/hc/en-us/articles/4406895312781-Polar-Graphing",
    "https://help.desmos.com/hc/en-us/articles/4407885334285-Inequalities-and-Restrictions",
    "https://help.desmos.com/hc/en-us/articles/4405296853517-Graph-Settings",
    "https://help.desmos.com/hc/en-us/articles/4405177116941-Functions",
    "https://www.desmos.com/api/v1.9/docs/index.html"
  ]
}
```

備考: 調査AIの返答は非信頼データとして扱い、上級AI（オーケストレーター）が本案件の仕様(SPEC.md)へ取捨選択した。速度プリセット等、公式文書に明記がない要素は本cloneの仕様に採用していない。
