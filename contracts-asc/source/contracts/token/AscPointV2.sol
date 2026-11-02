// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AscRoles} from "../common/AscRoles.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IBalanceOf {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title AscPointV2 - ASC 點數（ERC-20，0 位小數）＋ USDT 金庫
/// @notice 玩家：
///   deposit(usdt)        存 USDT 買 ASC：價格＝當下每點價值，但最高 1 USDT（錢全部進入可兌換池）
///   burn / burnFrom      銷毀 ASC：NFT 收的 ASC 費用直接銷毀＝池子不變、點數變少＝每點價值提高（等於獎勵給所有持有者）
///   burnToReserve(pts)   豁免合約（市場）收的手續費：ASC 銷毀、等值 USDT 從可兌換池移到保底（owner 提領；其他人的每點價值不變）
///   exchange(points)     用 ASC 換 USDT（點數銷毀），持有越久拿越多：<30 天 70% … 360 天以上 100%（setKeepSchedule 可調）
///   transfer / approve   ASC 是標準 ERC-20，只有兌換開啟時可以轉（收到的 ASC 持有天數重新加權計算）
/// owner（建議 Safe）：
///   ownerDeposit(usdt)   存入獎金池，其中 50% 永久列入保底（玩家換不到，只有 owner 能提領）
///   allocate(users, pts) 發 ASC；move(from, to, pts) 幫玩家搬點數（被盜、換錢包）
///   setOpen / setCap / reset / setGate / setStartPrice / withdrawReserve / setPolicy / setOperator / setExempt
///   被盜：setFlagged（凍結：不能轉出）→ move(被盜錢包, 新錢包, 0) 搬走全部點數
///   權限：owner／admin／救援錢包 GUARDIAN 的分工見 common/AscRoles；本合約 onlyOwner＝只有主人，onlyAdmin＝主人或助手
///   救援：setDepositOpen（暫停買入）、shutdownVault（不可逆結束：大家 100% 換回）、rescueToken（誤轉的其他代幣）、move（搬點數）
/// 作業員 operator（例如 Discord 機器人的專用錢包，碰不到資金）或 owner：
///   setVerified(users, true/false)   登記已在 Discord 綁定的錢包（verifiedOnly 開啟時，只有已驗證錢包能存款、兌換、互轉）
///   setFlagged(users, true/false)    標記可疑錢包：不能存款、不能轉出；兌換時不看持有天數，只拿回 (100% − flagPenaltyBps)（預設 5%），其餘全部進保底（owner）
/// 防洗錢：
///   玩家互轉收 transferTaxBps 稅（預設 33%，最多 50%），稅金直接銷毀＝池子不變、點數變少＝每點價值提高；豁免地址（例如市場合約）不收稅
///   每個錢包每期存款上限 maxDepositPerPeriod（預設 1000 USDT，0＝不限）
/// 規則：
///   可兌換 = 池子餘額 − 保底 − 鎖到下一期的手續費
///   份額   = 可兌換 × 點數 ÷ ASC 總量，但每點最多 1 USDT（跟買價上限一樣，避免低買高賣）；玩家拿 份額 × 持有比例（捨去到 0.1 USDT）
///   每點價值超過 1 USDT 時，多出來的錢留在池子當緩衝（owner 可以用 allocate 發點數把它分出去）
///   手續費（沒拿到的部分）：feeToReserveBps 進保底、feeToNextBps 鎖到下一期（預設各 ⅓，setFeeSplit 可調）、其餘留給還在持有的人
///   每人每期（365 天）最多換走池子的 capBps（預設 5%，最多 9%）
///   任何人直接轉 USDT 進合約都會進入可兌換池，提高每點價值（NFT 的費用是 ASC，直接銷毀；市場手續費進保底）
contract AscPointV2 is ERC20Burnable, AscRoles, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant BPS = 10_000;
    uint256 private constant RESERVE_BPS = 5_000;
    uint256 public constant MAX_CAP_BPS = 900;
    uint256 public constant PERIOD = 365 days;
    uint256 public constant MAX_BATCH = 300;
    uint256 public constant MAX_GATES = 20;

    IERC20 public immutable usdt;
    uint256 public immutable unit; // 0.1 USDT（兌換金額捨去到這個單位）
    uint256 public immutable maxPrice; // 1 USDT：買 ASC 的價格上限

    bool public open;
    uint256 public capBps = 500;
    /// 兌換拿回比例（依持有天數，admin 可調）：持有 ≥ keepDays[i] 天拿回 keepRates[i]（bps）；第一格一定是 0 天
    uint16[8] public keepDays = [0, 30, 60, 90, 120, 180, 240, 360];
    uint16[8] public keepRates = [7000, 7500, 8000, 8500, 9000, 9400, 9700, 10000];
    /// 兌換手續費（沒拿到的部分）怎麼分（admin 可調）：進保底、鎖到下一期，其餘留在池子給持有者
    uint16 public feeToReserveBps = 3333;
    uint16 public feeToNextBps = 3333;
    uint256 public periodStart;
    /// 還沒有匯率時（沒有 ASC 或池子是空的）存款用的價格：1 ASC = startPrice（USDT 最小單位）
    uint256 public startPrice;

    uint256 public ownerDeposited; // owner 存入的累計（50% 列入保底）
    uint256 public reserveFee; // 手續費進保底的累計
    uint256 public reserveOut; // owner 已提領的保底
    uint256 public totalIssued; // 累計發出的 ASC（統計）

    struct Locked {
        uint64 period;
        uint192 amount;
    }
    Locked private _nextLocked;

    struct Usage {
        uint64 period;
        uint192 used;
    }
    mapping(address => Usage) private _usage;
    mapping(address => uint256) public holdStart; // 加權平均開始持有時間

    address[] private _gates;
    mapping(address => bool) public isGate;

    bool private _rescue;

    // ───── 救援 ─────
    bool public depositOpen = true; // 暫停／恢復玩家買 ASC
    bool public shutdown; // 結束模式（不可逆）：停止買入與發點，所有人可以不限額、100% 換回 USDT

    // ───── 防洗錢 ─────
    address public operator;
    bool public verifiedOnly = true;
    uint256 public transferTaxBps = 3300;
    uint256 public flagPenaltyBps = 9500; // 被標記錢包兌換的手續費（全部進保底）
    uint256 public maxDepositPerPeriod; // USDT 最小單位；0 = 不限（constructor 設成 1000 USDT）
    mapping(address => bool) public isVerified;
    mapping(address => bool) public isFlagged;
    mapping(address => bool) public isExempt; // 合約地址（例如市場）：不需驗證、互轉不收稅
    mapping(address => Usage) private _deposits;
    uint256 public constant MAX_TAX_BPS = 5000;
    uint256 public constant MAX_PENALTY_BPS = 9900;

    event Bought(address indexed user, uint256 usdtIn, uint256 points);
    event Exchanged(address indexed user, uint256 points, uint256 usdtOut);
    event ExchangeFee(uint256 toReserve, uint256 toNextPeriod, uint256 toHolders);
    event OwnerDeposited(uint256 amount, uint256 total);
    event ReserveWithdrawn(address indexed to, uint256 amount, uint256 reserveLeft);
    event FeeToReserve(address indexed from, uint256 points, uint256 value);
    event PointsAllocated(address indexed user, uint256 points, uint256 balance);
    event PointsMoved(address indexed from, address indexed to, uint256 points);
    event OpenChanged(bool open);
    event CapChanged(uint256 capBps);
    event KeepScheduleChanged(uint16[8] days_, uint16[8] rates);
    event FeeSplitChanged(uint16 toReserveBps, uint16 toNextBps);
    event PeriodReset(uint256 start, uint256 end);
    event GateChanged(address indexed nft, bool enabled, uint256 count);
    event StartPriceChanged(uint256 price);
    event VerifiedChanged(address indexed user, bool verified);
    event FlaggedChanged(address indexed user, bool flagged);
    event ExemptChanged(address indexed account, bool exempt);
    event OperatorChanged(address operator);
    event PolicyChanged(bool verifiedOnly, uint256 transferTaxBps, uint256 flagPenaltyBps, uint256 maxDepositPerPeriod);
    event TransferTaxBurned(address indexed from, address indexed to, uint256 tax);
    event DepositOpenChanged(bool open);
    event Shutdown(uint256 at);
    event TokenRescued(address indexed token, address indexed to, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error ExchangeClosed();
    error NotEnoughPoints(uint256 balance);
    error AmountTooSmall();
    error ExceedsAvailable(uint256 available);
    error OverPeriodCap(uint256 remaining, uint256 resetAt);
    error ExceedsReserve(uint256 reserve);
    error NoGateNft();
    error InvalidCap();
    error BadSchedule();
    error LengthMismatch();
    error BatchTooLarge();
    error TooManyGates();
    error NotAContract(address target);
    error InvalidReceiver(address to);
    error NoPrice();
    error NotVerified(address account);
    error Flagged(address account);
    error OverDepositCap(uint256 remaining);
    error NotOperator();
    error BadPolicy();
    error DepositClosed();
    error IsShutdown();
    error CannotRescueUsdt();
    error NotExempt(address account);

    /// @param startPrice_ 起始價格：1 ASC = 多少 USDT 最小單位（例如 10000 = 0.01 USDT）
    constructor(address initialOwner, address usdt_, uint8 usdtDecimals, uint256 startPrice_) ERC20("AscPoint", "ASC") Ownable(initialOwner) {
        if (usdt_ == address(0)) revert ZeroAddress();
        if (usdtDecimals == 0) revert ZeroAmount();
        usdt = IERC20(usdt_);
        unit = 10 ** uint256(usdtDecimals - 1);
        maxPrice = 10 ** uint256(usdtDecimals);
        if (startPrice_ == 0 || startPrice_ > maxPrice) revert NoPrice();
        startPrice = startPrice_;
        periodStart = block.timestamp;
        maxDepositPerPeriod = 1000 * 10 ** uint256(usdtDecimals);
    }

    modifier onlyOperator() {
        if (msg.sender != operator && !_isAdmin(msg.sender)) revert NotOperator();
        _;
    }

    function decimals() public pure override returns (uint8) {
        return 0;
    }

    /* ═════════════ 玩家 ═════════════ */

    /// @notice 存 USDT 換 ASC（依當下每點價值；不影響其他人的每點價值）
    function deposit(uint256 amount) external nonReentrant returns (uint256 points) {
        if (amount == 0) revert ZeroAmount();
        if (shutdown) revert IsShutdown();
        if (!depositOpen) revert DepositClosed();
        if (isFlagged[msg.sender]) revert Flagged(msg.sender);
        if (verifiedOnly && !isVerified[msg.sender]) revert NotVerified(msg.sender);
        if (maxDepositPerPeriod != 0) {
            (uint256 start, ) = currentPeriod();
            Usage storage d = _deposits[msg.sender];
            if (d.period != start) (d.period, d.used) = (uint64(start), 0);
            if (d.used + amount > maxDepositPerPeriod) revert OverDepositCap(maxDepositPerPeriod - d.used);
            d.used += uint192(amount);
        }
        points = previewDeposit(amount);
        if (points == 0) revert AmountTooSmall();
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, points);
        totalIssued += points;
        emit Bought(msg.sender, amount, points);
    }

    /// @notice 用 ASC 換 USDT
    function exchange(uint256 points) external nonReentrant returns (uint256 get) {
        if (!open && !shutdown) revert ExchangeClosed();
        if (points == 0) revert ZeroAmount();
        uint256 mine = balanceOf(msg.sender);
        if (points > mine) revert NotEnoughPoints(mine);
        if (!shutdown) {
            if (!canClaim(msg.sender)) revert NoGateNft();
            if (verifiedOnly && !isVerified[msg.sender]) revert NotVerified(msg.sender);
        }
        uint256 share;
        uint256 toReserve;
        uint256 toNext;
        (share, get, toReserve, toNext) = _split(msg.sender, points);
        if (get == 0) revert AmountTooSmall();
        uint256 avail = available();
        if (get > avail) revert ExceedsAvailable(avail);
        if (!shutdown) _useCap(get);
        reserveFee += toReserve;
        (uint256 start, ) = currentPeriod();
        if (_nextLocked.period != start) _nextLocked = Locked(uint64(start), 0);
        _nextLocked.amount += uint192(toNext);
        _burn(msg.sender, points);
        usdt.safeTransfer(msg.sender, get);
        emit Exchanged(msg.sender, points, get);
        emit ExchangeFee(toReserve, toNext, share - get - toReserve - toNext);
    }

    /// @notice 豁免合約（市場）用：把收到的手續費 ASC 銷毀，等值的 USDT（依當下每點價值，最多每點 1 USDT）從可兌換池移到保底，給 owner 提領
    ///   池子少的錢＝點數少的份額，其他持有者的每點價值不變
    function burnToReserve(uint256 points) external nonReentrant returns (uint256 value) {
        if (!isExempt[msg.sender]) revert NotExempt(msg.sender);
        if (points == 0) return 0;
        uint256 held = totalSupply();
        value = held == 0 ? 0 : (available() * points) / held;
        if (value > points * maxPrice) value = points * maxPrice;
        _burn(msg.sender, points);
        reserveFee += value;
        emit FeeToReserve(msg.sender, points, value);
    }

    /* ═════════════ 查詢 ═════════════ */

    function balance() public view returns (uint256) {
        return usdt.balanceOf(address(this));
    }

    function reserve() public view returns (uint256) {
        uint256 full = (ownerDeposited * RESERVE_BPS) / BPS + reserveFee;
        return full > reserveOut ? full - reserveOut : 0;
    }

    function lockedNext() public view returns (uint256) {
        (uint256 start, ) = currentPeriod();
        return !shutdown && _nextLocked.period == start ? _nextLocked.amount : 0;
    }

    function available() public view returns (uint256) {
        uint256 bal = balance();
        uint256 locked = reserve() + lockedNext();
        return bal > locked ? bal - locked : 0;
    }

    function currentPeriod() public view returns (uint256 start, uint256 end) {
        start = periodStart + ((block.timestamp - periodStart) / PERIOD) * PERIOD;
        end = start + PERIOD;
    }

    /// @notice 買 1 ASC 的價格（USDT 最小單位）：當下每點價值，最高 1 USDT；還沒有匯率時用起始價格
    function buyPrice() public view returns (uint256) {
        uint256 held = totalSupply();
        uint256 avail = available();
        if (held == 0 || avail == 0) return startPrice;
        uint256 p = avail / held;
        if (p == 0) p = 1;
        return p > maxPrice ? maxPrice : p;
    }

    /// @notice 存 amount USDT 會拿到多少 ASC
    function previewDeposit(uint256 amount) public view returns (uint256) {
        uint256 held = totalSupply();
        uint256 avail = available();
        if (held == 0 || avail == 0) return amount / startPrice;
        uint256 byValue = (amount * held) / avail; // 依每點價值
        uint256 byCap = amount / maxPrice; // 依 1 USDT 上限
        return byValue > byCap ? byValue : byCap;
    }

    /// @notice 換 points 點：份額、拿到的、手續費進保底、鎖到下一期
    function previewExchange(address account, uint256 points) external view returns (uint256 share, uint256 get, uint256 toReserve, uint256 toNext) {
        return _split(account, points);
    }

    function heldDays(address account) public view returns (uint256) {
        if (balanceOf(account) == 0) return 0;
        return (block.timestamp - holdStart[account]) / 1 days;
    }

    function keepBps(address account) public view returns (uint256) {
        uint256 d = heldDays(account);
        uint256 r = keepRates[0];
        for (uint256 i = 1; i < 8; ++i) {
            if (d < keepDays[i]) break;
            r = keepRates[i];
        }
        return r;
    }

    /// @notice 每人每期上限、本期還能換多少、換期時間
    function remaining(address account) public view returns (uint256 cap, uint256 left, uint256 resetAt) {
        (uint256 start, uint256 end) = currentPeriod();
        cap = (balance() * capBps) / BPS;
        Usage memory u = _usage[account];
        uint256 used = u.period == start ? u.used : 0;
        left = cap > used ? cap - used : 0;
        resetAt = end;
    }

    function canClaim(address account) public view returns (bool) {
        uint256 n = _gates.length;
        if (n == 0) return true;
        for (uint256 i; i < n; ++i) {
            try IBalanceOf(_gates[i]).balanceOf(account) returns (uint256 b) {
                if (b > 0) return true;
            } catch {}
        }
        return false;
    }

    function gates() external view returns (address[] memory) {
        return _gates;
    }

    /// @notice 網站一次讀完：池子與某帳號的狀態
    /// @return pool [餘額, 保底, 鎖到下一期, 可兌換, ASC 總量, 每 100 點份額(扣費前，最高 100 USDT), 每人上限 bps, 期開始, 期結束, 開關(1/0), 起始價格]
    /// @return me   [ASC, 持有天數, 持有比例 bps, 本期上限, 本期剩餘, 全部點數現在能拿, 門檻OK(1/0)]
    function info(address account) external view returns (uint256[11] memory pool, uint256[7] memory me) {
        (uint256 start, uint256 end) = currentPeriod();
        uint256 held = totalSupply();
        uint256 avail = available();
        pool = [balance(), reserve(), lockedNext(), avail, held, held == 0 ? 0 : _min((avail * 100) / held, 100 * maxPrice), capBps, start, end, open ? 1 : 0, startPrice];
        (uint256 cap, uint256 left, ) = remaining(account);
        uint256 pts = balanceOf(account);
        (, uint256 get, , ) = _split(account, pts);
        me = [pts, heldDays(account), keepBps(account), cap, left, get, canClaim(account) ? 1 : 0];
    }

    /// @notice 某錢包的防洗錢狀態：已驗證、被標記、本期已存款、本期存款上限
    function userStatus(address account) external view returns (bool verified, bool flagged, uint256 depositedThisPeriod, uint256 depositCap) {
        (uint256 start, ) = currentPeriod();
        Usage memory d = _deposits[account];
        return (isVerified[account], isFlagged[account], d.period == start ? d.used : 0, maxDepositPerPeriod);
    }

    /* ═════════════ 作業員（或 owner） ═════════════ */

    function setVerified(address[] calldata users, bool v) external onlyOperator {
        if (users.length > MAX_BATCH) revert BatchTooLarge();
        for (uint256 i; i < users.length; ++i) {
            isVerified[users[i]] = v;
            emit VerifiedChanged(users[i], v);
        }
    }

    function setFlagged(address[] calldata users, bool v) external onlyOperator {
        if (users.length > MAX_BATCH) revert BatchTooLarge();
        for (uint256 i; i < users.length; ++i) {
            isFlagged[users[i]] = v;
            emit FlaggedChanged(users[i], v);
        }
    }

    /* ═════════════ owner ═════════════ */

    function setOperator(address op) external onlyAdmin {
        operator = op;
        emit OperatorChanged(op);
    }

    /// @notice 合約地址（例如市場）：不需驗證、互轉不收稅
    function setExempt(address account, bool v) external onlyOwner {
        isExempt[account] = v;
        emit ExemptChanged(account, v);
    }

    function setPolicy(bool verifiedOnly_, uint256 transferTaxBps_, uint256 flagPenaltyBps_, uint256 maxDepositPerPeriod_) external onlyAdmin {
        if (transferTaxBps_ > MAX_TAX_BPS || flagPenaltyBps_ > MAX_PENALTY_BPS) revert BadPolicy();
        (verifiedOnly, transferTaxBps, flagPenaltyBps, maxDepositPerPeriod) = (verifiedOnly_, transferTaxBps_, flagPenaltyBps_, maxDepositPerPeriod_);
        emit PolicyChanged(verifiedOnly_, transferTaxBps_, flagPenaltyBps_, maxDepositPerPeriod_);
    }

    function ownerDeposit(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        ownerDeposited += amount;
        emit OwnerDeposited(amount, ownerDeposited);
    }

    function allocate(address[] calldata users, uint256[] calldata points) external onlyOwner {
        if (shutdown) revert IsShutdown();
        if (users.length != points.length) revert LengthMismatch();
        if (users.length > MAX_BATCH) revert BatchTooLarge();
        for (uint256 i; i < users.length; ++i) {
            if (users[i] == address(0)) revert ZeroAddress();
            if (points[i] == 0) revert ZeroAmount();
            _mint(users[i], points[i]);
            totalIssued += points[i];
            emit PointsAllocated(users[i], points[i], balanceOf(users[i]));
        }
    }

    /// @notice 幫玩家搬點數（關閉時也能用）；points = 0 代表全部
    function move(address from, address to, uint256 points) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        uint256 mine = balanceOf(from);
        if (points == 0) points = mine;
        if (points == 0) revert ZeroAmount();
        if (points > mine) revert NotEnoughPoints(mine);
        _rescue = true;
        _transfer(from, to, points);
        _rescue = false;
        emit PointsMoved(from, to, points);
    }

    function withdrawReserve(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 res = reserve();
        if (amount > res) revert ExceedsReserve(res);
        reserveOut += amount;
        usdt.safeTransfer(msg.sender, amount);
        emit ReserveWithdrawn(msg.sender, amount, res - amount);
    }

    /// @notice 救援：暫停／恢復玩家買 ASC（兌換照常）
    function setDepositOpen(bool v) external onlyAdmin {
        depositOpen = v;
        emit DepositOpenChanged(v);
    }

    /// @notice 救援：結束這個金庫（不可逆，用在合約要汰換或出現重大問題時）。
    ///   之後不能再買 ASC、不能發點；所有人不看門檻、不限額、100% 持有比例換回 USDT（被標記的照扣罰金）；
    ///   鎖到下一期的手續費釋放給大家；保底仍歸 owner。
    function shutdownVault() external onlyOwner {
        if (shutdown) revert IsShutdown();
        shutdown = true;
        emit Shutdown(block.timestamp);
    }

    /// @notice 救援：把不小心轉進來的其他代幣退出去（不能動 USDT＝玩家資金）
    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(usdt)) revert CannotRescueUsdt();
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit TokenRescued(token, to, amount);
    }

    function setOpen(bool v) external onlyAdmin {
        open = v;
        emit OpenChanged(v);
    }

    /// @notice 兌換拿回比例：8 格，持有 ≥ days_[i] 天拿回 rates[i]（bps）。天數要遞增、第一格 0 天；比例不能遞減、最多 100%
    ///   例：[0,30,60,90,120,180,240,360] 與 [7000,7500,8000,8500,9000,9400,9700,10000]（不想用 8 格時，後面重複最後一格即可）
    function setKeepSchedule(uint16[8] calldata days_, uint16[8] calldata rates) external onlyAdmin {
        if (days_[0] != 0) revert BadSchedule();
        for (uint256 i; i < 8; ++i) {
            if (rates[i] > BPS) revert BadSchedule();
            if (i > 0 && (days_[i] < days_[i - 1] || rates[i] < rates[i - 1])) revert BadSchedule();
        }
        (keepDays, keepRates) = (days_, rates);
        emit KeepScheduleChanged(days_, rates);
    }

    /// @notice 兌換手續費怎麼分（bps）：toReserve 進保底（owner）、toNext 鎖到下一期，剩下的留在池子給持有者；兩個加起來不能超過 100%
    function setFeeSplit(uint16 toReserve, uint16 toNext) external onlyAdmin {
        if (uint256(toReserve) + toNext > BPS) revert BadSchedule();
        (feeToReserveBps, feeToNextBps) = (toReserve, toNext);
        emit FeeSplitChanged(toReserve, toNext);
    }

    function setCap(uint256 bps) external onlyAdmin {
        if (bps == 0 || bps > MAX_CAP_BPS) revert InvalidCap();
        capBps = bps;
        emit CapChanged(bps);
    }

    function reset() external onlyAdmin {
        periodStart = block.timestamp;
        emit PeriodReset(block.timestamp, block.timestamp + PERIOD);
    }

    function setStartPrice(uint256 price) external onlyAdmin {
        if (price == 0 || price > maxPrice) revert NoPrice();
        startPrice = price;
        emit StartPriceChanged(price);
    }

    function setGate(address nft, bool enabled) external onlyAdmin {
        if (nft == address(0)) revert ZeroAddress();
        if (enabled) {
            if (isGate[nft]) return;
            if (nft.code.length == 0) revert NotAContract(nft);
            if (_gates.length >= MAX_GATES) revert TooManyGates();
            isGate[nft] = true;
            _gates.push(nft);
        } else {
            if (!isGate[nft]) return;
            isGate[nft] = false;
            for (uint256 i; i < _gates.length; ++i) {
                if (_gates[i] == nft) {
                    _gates[i] = _gates[_gates.length - 1];
                    _gates.pop();
                    break;
                }
            }
        }
        emit GateChanged(nft, enabled, _gates.length);
    }

    /* ═════════════ 內部 ═════════════ */

    function _split(address account, uint256 points) private view returns (uint256 share, uint256 get, uint256 toReserve, uint256 toNext) {
        uint256 held = totalSupply();
        if (held == 0 || points == 0) return (0, 0, 0, 0);
        share = (available() * points) / held;
        uint256 maxShare = points * maxPrice; // 每點最多值 1 USDT（跟買價上限一致，避免低買高賣套利；超出的留在池子當緩衝）
        if (share > maxShare && !shutdown) share = maxShare; // 結束模式：池子全部分完
        if (isFlagged[account]) {
            // 被標記（被盜、可疑）：不看持有天數，只拿回 (100% − flagPenaltyBps)，其餘全部進保底給 owner
            uint256 kept = (share * (BPS - flagPenaltyBps)) / BPS;
            get = kept - (kept % unit);
            toReserve = share - get;
            return (share, get, toReserve, 0);
        }
        uint256 keep = shutdown ? BPS : keepBps(account);
        uint256 raw = (share * keep) / BPS;
        get = raw - (raw % unit);
        uint256 fee = share - get;
        toReserve = (fee * feeToReserveBps) / BPS;
        toNext = (fee * feeToNextBps) / BPS;
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }

    function _useCap(uint256 amount) private {
        (uint256 start, uint256 end) = currentPeriod();
        Usage storage u = _usage[msg.sender];
        if (u.period != start) {
            u.period = uint64(start);
            u.used = 0;
        }
        uint256 cap = (balance() * capBps) / BPS;
        if (u.used + amount > cap) revert OverPeriodCap(cap > u.used ? cap - u.used : 0, end);
        u.used += uint192(amount);
    }

    /// 玩家互轉只在兌換開啟時；已驗證錢包才能轉；被標記的不能轉出；互轉收稅並銷毀；收到的點數持有時間加權平均
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && !_rescue) {
            if (!open) revert ExchangeClosed();
            if (to == address(this)) revert InvalidReceiver(to);
            if (isFlagged[from]) revert Flagged(from);
            if (verifiedOnly) {
                if (!isExempt[from] && !isVerified[from]) revert NotVerified(from);
                if (!isExempt[to] && !isVerified[to]) revert NotVerified(to);
            }
            if (transferTaxBps > 0 && !isExempt[from] && !isExempt[to]) {
                uint256 tax = (value * transferTaxBps + BPS - 1) / BPS; // 無條件進位，避免小額免稅
                if (tax > value) tax = value;
                super._update(from, address(0), tax);
                emit TransferTaxBurned(from, to, tax);
                value -= tax;
            }
        }
        if (to != address(0) && value > 0) {
            uint256 old = balanceOf(to);
            holdStart[to] = old == 0 ? block.timestamp : (old * holdStart[to] + value * block.timestamp) / (old + value);
        }
        super._update(from, to, value);
    }
}
