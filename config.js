// 網頁設定：部署合約後填寫，推到 GitHub 就會自動更新網頁
window.ASC_CONFIG = {
    chainId: 137,
    chainName: "Polygon",
    currency: "POL",
    rpcUrl: "https://polygon-bor-rpc.publicnode.com",
    explorer: "https://polygonscan.com",
    // 點數金庫（AscPointVault）地址
    vault: "",
    // AscCatSamurai NFT 合約
    nft: "0xAA5D9875d9bE56FA8Fa782a1913b2D2274379B2e",
    nftMaxSupply: 500,
    // 選填：Discord 機器人的對外網址（例如 https://xxx.up.railway.app），用來顯示全服點數與匯率；留空就不顯示匯率
    botApi: "",
    ipfsGateway: "https://ipfs.io/ipfs/"
};
