// 網頁設定：改完推到 GitHub 就會自動更新網頁（沒有任何機密）
window.ASC_CONFIG = {
    chainId: 137,
    chainName: "Polygon",
    currency: "POL",
    rpcUrl: "https://polygon-bor-rpc.publicnode.com",
    explorer: "https://polygonscan.com",
    // 點數金庫 AscPoint（點數本身是 ERC-20 代幣 ASC）
    vault: "0x9a431fED8Bc5fa595E5c9fdB1abb0a3119fBD5Ad",
    // 金庫部署的區塊：歷史幣值從這裡開始讀事件
    deployBlock: 96045773,
    // 金庫 owner（Safe 多簽），只用來顯示
    safe: "0x7c532A61349814633CdE4f81652Cb0E35BEB75f6",
    // 信物 NFT 合約
    nft: "0x39c774673A25B0f1F600Bf39edF639c0f44a7488",
    // 讀不到合約的總量上限時使用
    nftMaxSupply: 500,
    // Discord 機器人的對外網址（機器人的 PUBLIC_URL，例如 https://xxx.up.railway.app）：錢包綁定頁要把簽名送回機器人
    botApi: "",
    // 即時幣值多久更新一次（秒）
    refreshSeconds: 15,
    ipfsGateway: "https://ipfs.io/ipfs/"
};
