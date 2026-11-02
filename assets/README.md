# 圖片（網站實際用到的全部圖片都在這裡）

換圖時用**同樣的檔名**覆蓋即可；改完記得在用到它的頁面把 `?v=` 版本號換掉，避免瀏覽器快取舊圖。

| 檔名 | 用在哪裡 | 尺寸 |
|---|---|---|
| `logo.png` | 左上角 logo、綁定頁中間的圖示 | 192×192 |
| `favicon-32.png`、`favicon.png` | 瀏覽器分頁圖示（logo 同一張圖，20% 圓角） | 32×32、64×64 |
| `apple-touch-icon.png` | iPhone 加到主畫面的圖示 | 180×180 |
| `author.png` | 首頁「開發者」頭像（顯示 88px 圓形） | 256×256 |
| `box.png` | NFT 盲盒（鑄造區、還沒解盲的喵武士） | 384×384 |
| `story-*.jpg` | 首頁「喵喵武士的喵太」四章故事（章節對應在 `app/i18n.js` 的 `ASC_STORY`）；`story-samurai.jpg` 另外當故事區塊的背景 | 寬 646～1600 |

故事圖從漫畫第一話裁切：`story-sky.jpg`（第一章）、`story-samurai.jpg`（第二章）、`story-street.jpg`（第三章）、`story-attack.jpg`、`story-qi.jpg`、`story-slash.jpg`、`story-return.jpg`（第四章）。

- 風格：深藍底、紅色點綴；背景浮水印「ASC鏢局」是 CSS 產生的（`app/style.css` 的 `--pagebg`），不需要圖片。
- 照片用 JPG、圖示用 PNG，單張盡量 300 KB 以內。
- NFT 圖層、配件縮圖、metadata 不在這裡，在 `2026_asc_web3_ipfs`（`config.js` 的 `assets`）。
