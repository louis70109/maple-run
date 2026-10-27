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
| 大絕招 | K、L | 右側技能圖示按鈕（外圈是冷卻） |
| 左右移動 | ←／→、A／D | 左下 ◀ ▶ |
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

## 離線與外部連線

- 遊戲**不會連到任何外部網站**：所有角色、怪物、特效圖片都已經下載放在 `assets/`，跟著網頁一起部署。
  （只有 GM 按「發佈」時會連 GitHub API。）
- 第一次開啟時，service worker 會把全部圖片存到瀏覽器，標題畫面出現「✓ 可離線遊玩」後就能斷網玩；
  安裝成 PWA（加到主畫面）後就像 App 一樣。
- `npm test` 會檢查執行時的程式沒有外部網址、所有圖片都在 repo 裡。

## 素材

- 角色、怪物、技能特效的逐格動畫：已打包在 `assets/sprites/`。這些圖是開發時用
  `scripts/fetch_sprites.py` 從 [maplestory.io](https://maplestory.io) 一次下載的；之後只有要換裝備或怪物時，
  才需要改腳本裡的 ID 重新執行（需要 Pillow），平常部署和遊玩都用不到這支腳本。
- 道具圖示與 PWA 圖示：取自 [rms-data](https://github.com/louis70109/rms-data)（MapleRoyals 攻略備份）。

楓之谷相關素材版權屬 NEXON 所有，本專案為非商業的同人作品。
