# 📝 策略規格書：VOO/QQQ 動態輪動策略 (The VOO-QQQ Dynamic Rotation)

## 1\. 策略概述 (Overview)

  * **策略類型：** 僅做多 (Long Only) / 動能輪動 (Momentum Rotation)
  * **核心資產：** $VOO$ (S\&P 500 ETF - 基準資產), $QQQ$ (Nasdaq 100 ETF - 衛星資產)
  * **核心邏輯：** 以 VOO 的歷史高點 (ATH) 為市場強勢訊號。當大盤（VOO）確認強勢後，在回調時分批買入高動能資產（QQQ），利用三階段訊號確認反彈，最終達到股債/資產平衡。
  * **最大倉位限制：** 買入後，QQQ 的市值佔比不得超過總資產的 $50\%$（即 VOO:QQQ 最多 $50:50$）。

-----

## 2\. 參數設置 (Global Parameters)

這些是程式碼中的變數，方便未來優化和回測調整。

| 參數名稱 | 預設值 | 說明 |
| :--- | :--- | :--- |
| `Initial_VOO_Pct` | $100\%$ | 初始狀態下 VOO 的持倉比例。 |
| `Target_Max_QQQ_Ratio` | $50\%$ | QQQ 允許的最大持倉比例 (相對於總資產)。 |
| `MA_Short` | $5$ | 短期移動平均線 (天)，用於確認短期動能。 |
| `MA_Long` | $20$ | 中期移動平均線 (天)，用於確認趨勢恢復。 |
| `RSI_Period` | $14$ | RSI 指標週期。 |
| `MACD_Fast` | $12$ | MACD 快線週期。 |
| `MACD_Slow` | $26$ | MACD 慢線週期。 |
| `MACD_Signal` | $9$ | MACD 訊號線週期。 |

-----

## 3\. 狀態機邏輯 (State Machine Logic)

程式應基於以下狀態進行循環判斷（每日收盤後執行）：

### 狀態 0：初始化 (Initialization)

  * **動作：** 將資金 $100\%$ 買入 VOO（或依照使用者設定的初始比例 `Initial_VOO_Pct`）。
  * **監控：** 每日檢查 VOO 收盤價是否大於等於 `VOO_All_Time_High` (VOO 歷史最高價)。
  * **轉移條件：** 若 `VOO_Close >= VOO_All_Time_High`，進入 **狀態 1**。

### 狀態 1：追蹤新高 (Tracking New Highs)

  * **邏輯：** 市場進入多頭強勢區。
  * **變數更新：** 更新 `VOO_Highest_Close` (記錄突破後的最高收盤價)。
  * **轉移條件：** 若 `VOO_Close < VOO_Highest_Close` (出現回落)，進入 **狀態 2**。

### 狀態 2：等待反彈訊號 (Waiting for Rebound)

  * **邏輯：** 大盤回檔，準備買入 QQQ。
  * **監控重點：** **QQQ 的技術指標** (非 VOO)。我們假設大盤穩健，尋找 QQQ 的買點。
  * **執行動作：** 根據「三階段入場機制」執行買入。

-----

## 4\. 三階段入場機制 (Execution Logic)

當處於 **狀態 2** 時，依序檢查以下條件。每次買入前需計算 `Max_Buy_Amount` (詳見第 5 節)。

### 🔔 第一階段：試探性建倉 (Probe Entry)

  * **觸發條件 (AND 邏輯)：**
    1.  `QQQ_MACD_Line` \> `QQQ_Signal_Line` (MACD 黃金交叉)。
    2.  `QQQ_MACD_Histogram` 由負轉正 (或連續 1 天為正)。
  * **買入動作：**
      * 買入金額 = `Max_Buy_Amount` $\times 25\%$。
      * 標記 `Stage_1_Filled = True`。

### 🔔 第二階段：趨勢確認 (Trend Confirmation)

  * **前置條件：** `Stage_1_Filled == True`
  * **觸發條件 (AND 邏輯)：**
    1.  `QQQ_Close` \> `QQQ_MA_Short` (例如 5 日均線)。
    2.  `QQQ_Close` \> `Stage_1_Entry_Price` (股價高於第一階段買入價，確保獲利中加碼)。
  * **買入動作：**
      * 買入金額 = `Max_Buy_Amount` $\times 35\%$。
      * 標記 `Stage_2_Filled = True`。

### 🔔 第三階段：動能確立 (Momentum Expansion)

  * **前置條件：** `Stage_2_Filled == True`
  * **觸發條件 (OR 邏輯)：**
    1.  `QQQ_RSI` \> $50$ (RSI 站上強勢區)。
    2.  `QQQ_Close` \> `QQQ_MA_Long` (例如 20 日均線)。
  * **買入動作：**
      * 買入金額 = `剩餘可買入額度` (將倉位補滿至目標比例)。
      * 標記 `Stage_3_Filled = True`。
      * **重置：** 買入完成後，回到 **狀態 1** 或繼續持有，直到下一次 VOO 創新高循環。

-----

## 5\. 倉位計算數學模型 (Position Sizing Math)

這是程式最關鍵的風控部分，確保不超過 $50:50$。

在任何買入訊號觸發當下，執行以下計算：

1.  **獲取當前總資產 (Total Equity, $E$)：**
    $$E = \text{Cash} + \text{Value}(VOO) + \text{Value}(QQQ)$$
2.  **計算 QQQ 目標最大市值 ($V_{Q\_Max}$)：**
    $$V_{Q\_Max} = E \times \text{Target\_Max\_QQQ\_Ratio} \quad (\text{e.g., } 0.5)$$
3.  **計算當前 QQQ 市值 ($V_{Q\_Current}$)：**
    $$V_{Q\_Current} = \text{Shares}(QQQ) \times \text{Price}(QQQ)$$
4.  **計算本次循環總預算 (Total Budget for Loop, $B_{Total}$)：**
    $$B_{Total} = \max(0, V_{Q\_Max} - V_{Q\_Current})$$
    *(如果 QQQ 已經超過 50%，則不進行買入)*
5.  **計算各階段下單金額 ($Order\_Value$)：**
      * **Stage 1:** $B_{Total} \times 0.25$
      * **Stage 2:** $B_{Total} \times 0.35$
      * **Stage 3:** $B_{Total} \times 0.40$ (或剩餘額度)

-----

## 6\. 偽代碼 (Pseudocode for Developer)

```python
# 這是給開發者的邏輯參考

def on_market_close(data, portfolio):
    # 1. 準備數據
    voo_price = data['VOO'].close
    qqq_price = data['QQQ'].close
    voo_ath = get_all_time_high(data['VOO'])
    
    # 計算指標
    qqq_macd, qqq_signal, qqq_hist = calculate_macd(data['QQQ'])
    qqq_rsi = calculate_rsi(data['QQQ'], period=14)
    qqq_ma5 = calculate_ma(data['QQQ'], period=5)
    qqq_ma20 = calculate_ma(data['QQQ'], period=20)

    # 2. 狀態判斷
    if global_state == 'INITIALIZATION':
        if voo_price >= voo_ath:
            global_state = 'TRACKING_HIGHS'
            highest_since_breakout = voo_price

    elif global_state == 'TRACKING_HIGHS':
        if voo_price > highest_since_breakout:
            highest_since_breakout = voo_price
        elif voo_price < highest_since_breakout:
            # VOO 回落，開始監控 QQQ 買點
            global_state = 'WAITING_FOR_REBOUND'
            reset_stages()

    elif global_state == 'WAITING_FOR_REBOUND':
        # 計算資金
        total_equity = portfolio.total_value
        qqq_value = portfolio.get_position('QQQ').value
        max_qqq_target = total_equity * 0.50
        budget_total = max(0, max_qqq_target - qqq_value)

        if budget_total <= 0:
            return # 倉位已滿，不動作

        # --- Stage 1 ---
        if not stage_1_filled:
            if qqq_hist > 0 and qqq_hist_prev < 0: # MACD Cross up
                buy_amount = budget_total * 0.25
                execute_buy('QQQ', buy_amount)
                stage_1_filled = True
                entry_price_s1 = qqq_price

        # --- Stage 2 ---
        elif stage_1_filled and not stage_2_filled:
            if qqq_price > qqq_ma5 and qqq_price > entry_price_s1:
                buy_amount = budget_total * 0.35
                execute_buy('QQQ', buy_amount)
                stage_2_filled = True

        # --- Stage 3 ---
        elif stage_2_filled and not stage_3_filled:
            if qqq_rsi > 50 or qqq_price > qqq_ma20:
                buy_amount = budget_total * 0.40 # Buy the rest
                execute_buy('QQQ', buy_amount)
                stage_3_filled = True
                global_state = 'TRACKING_HIGHS' # 任務完成，回到監控狀態
```

-----

## 7\. 風險提示與防護 (Safety Checks)

在編寫程式時，請加入以下防護機制：

1.  **現金不足檢查：** 每次發出買單前，檢查 `Cash Balance` 是否足夠。如果現金不足，需要賣出對應價值的 VOO 來籌集資金（Rebalance Source）。
2.  **大盤崩盤保護 (Circuit Breaker)：** (可選) 雖然策略是不賣出，但如果 VOO 跌破 $200$ 日均線，建議暫停所有「買入 QQQ」的訊號，直到 VOO 重新站上均線。避免在熊市中持續加倉高風險資產。
3.  **滑點控制 (Slippage)：** 建議使用限價單 (Limit Order) 或收盤市價單 (Market on Close)，避免盤中劇烈波動造成的成交價誤差。
