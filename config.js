// 網頁設定：改完推到 GitHub 就會自動更新網頁（沒有任何機密）
window.ASC_CONFIG = {
    chainId: 137,
    chainName: "Polygon",
    currency: "POL",
    rpcUrl: "https://polygon-bor-rpc.publicnode.com",
    explorer: "https://polygonscan.com",
    opensea: "https://opensea.io/assets/matic",
    // V2 四份合約（2026_asc_web3_token/deployments/polygon.json）
    vault: "0xB0B0026dBb092adf290df75729619343d51cA4bD", // ASC 金庫 AscPointV2（ASC 本身是 ERC-20，0 位小數）
    nft: "0xc70E923942B9404268C4842E6A42CFE5be6152E0", // 喵武士 AscCatSamuraiV2
    parts: "0x624197e0E623a2684548c6713aaf8104dBEcA2F9", // 配件 AscCatParts（ERC-1155）
    market: "0xb71aD1e721dE0c5E50223cf4a3C3b3f3E37320c4", // 配件市場 AscMarket
    usdt: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT0（6 位小數）
    vaultBlock: 96182573, // 金庫部署區塊（走勢圖補資料用）
    nftBlock: 96182586, // NFT 部署區塊
    safe: "0x7c532A61349814633CdE4f81652Cb0E35BEB75f6", // 合約主人（Safe 多簽），只用來顯示
    nftV1: "0x39c774673A25B0f1F600Bf39edF639c0f44a7488", // 舊系列 V1（#0~#30）
    // 外觀資料（2026_asc_web3_ipfs 的 GitHub Pages）：traits.json、圖層 layers/、v2/state.json、v2/price.json、配件縮圖 v2/thumbs/
    assets: "https://chase5ws.github.io/2026_asc_web3_ipfs",
    // Discord 機器人的對外網址（機器人的 PUBLIC_URL）：錢包綁定頁要把簽名送回機器人
    botApi: "https://2026ascdiscordbot-production.up.railway.app",
    discord: "https://discord.gg/asc-official",
    // 鏈上資料多久更新一次（秒）
    refreshSeconds: 20
};
