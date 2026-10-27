# 楓之谷跑跑 MapleRun

楓之谷風格的跑酷小遊戲（玩法類似跑跑薑餅人）。三個頻道對應三種難度，關卡越後面速度越快、難度越高；
GM 可以在網頁上調整各頻道的強度並發佈給所有玩家。可部署到 GitHub Pages，並安裝成 PWA 離線玩。

規劃與設計說明見 [docs/PLAN.md](docs/PLAN.md)。

## 操作

| 動作 | 鍵盤 | 手機 |
|------|------|------|
| 跳躍／二段跳 | 空白鍵、↑、W | 右下「跳躍」 |
| 滑行 | 按住 ↓、S | 按住左下「滑行」 |
| 攻擊（按住連打） | Ctrl、J、F | 右下「攻擊」 |
| 暫停 | P、Esc | 右上 ❚❚ |

## 本機執行

```bash
python3 -m http.server 8000   # 開 http://localhost:8000
npm test                      # 單元測試＋自動玩家測試（Node 22，無相依套件）
```

ES modules 需要透過 http 開啟，不能直接雙擊 `index.html`。

## 部署到 GitHub Pages

1. repo **Settings → Pages → Source** 選 **GitHub Actions**（只需設定一次）
2. push 到 `main`，`.github/workflows/pages.yml` 會跑測試並部署
3. 網址：`https://<帳號>.github.io/maple-run/`

## GM 設定

開 `https://<帳號>.github.io/maple-run/#gm`：

- 調整三個頻道的速度、HP、障礙、坑洞、BOSS 等參數，並預覽第 1～16 關的成長曲線
- 「這台裝置先用草稿設定玩」可以先自己試玩
- 「發佈」會用 GitHub API 把 `config.json` commit 到 repo，Pages 重新部署後所有玩家套用
  - 需要 [fine-grained token](https://github.com/settings/personal-access-tokens/new)：只選這個 repo，權限 **Contents: Read and write**
  - token 只存在瀏覽器分頁（sessionStorage）
- 也可以「匯出 config.json」後手動 commit

## 素材

- 角色與怪物的逐格動畫：用 `scripts/fetch_sprites.py` 從 [maplestory.io](https://maplestory.io) 抓取並打包成
  `assets/sprites/`（已 commit，遊戲執行時不需連外）。要換裝備或怪物，改腳本裡的 ID 後執行
  `python3 scripts/fetch_sprites.py`（需要 Pillow）。
- 道具圖示與 PWA 圖示：取自 [rms-data](https://github.com/louis70109/rms-data)（MapleRoyals 攻略備份）。

楓之谷相關素材版權屬 NEXON 所有，本專案為非商業的同人作品。
