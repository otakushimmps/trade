// 初始化 Icons
lucide.createIcons();

// 預設數據變數
const initialHardcodedData = "";
let currentFileContent = initialHardcodedData;
let currentFileName = "未載入數據";
let priceData = [];
let isOptimizing = false;
let priceChart = null;
let optimizationCandidates = [];

// --- 核心邏輯函式 ---

function calculateYearsDifference(startDateStr, endDateStr) {
    const cleanStartDateStr = startDateStr.replace(/\//g, '-');
    const cleanEndDateStr = endDateStr.replace(/\//g, '-');
    const startDate = new Date(cleanStartDateStr);
    const endDate = new Date(cleanEndDateStr);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate) return 0;
    const diffTime = Math.abs(endDate - startDate);
    return diffTime / (1000 * 60 * 60 * 24 * 365.25);
}

function parseCsvData(csvText) {
    const data = [];
    if (!csvText) return data;
    const lines = csvText.trim().split('\n').filter(line => line.trim() !== '');
    if (lines.length <= 1) return data;

    for (let i = 1; i < lines.length; i++) {
        let cleanLine = lines[i].replace(/\r/g, '').trim();
        if (!cleanLine) continue;
        const lineWithoutQuotes = cleanLine.replace(/"/g, '');
        const parts = lineWithoutQuotes.split(',');
        if (parts.length >= 2) {
            const datePart = parts[0].split(' ')[0].trim();
            const price = parseFloat(parts[1].trim());
            if (datePart && !isNaN(price)) data.push({ Date: datePart, Close: price });
        }
    }
    // Fix: Sort data by date ascending (V19 Fix)
    data.sort((a, b) => new Date(a.Date) - new Date(b.Date));
    return data;
}

function formatNumber(num, decimal = 0) {
    if (isNaN(num) || num === null) return '--';
    const sign = num < 0 ? '-' : '';
    const absNum = Math.abs(num);
    const formatted = absNum.toLocaleString('en-US', { minimumFractionDigits: decimal, maximumFractionDigits: decimal });
    return sign + formatted;
}

function formatPercent(num, decimal = 2) {
    if (isNaN(num) || num === null) return '--';
    return (num * 100).toLocaleString('en-US', { minimumFractionDigits: decimal, maximumFractionDigits: decimal });
}

function generateRandomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function generateRandomFloat(min, max, step) {
    const range = max - min;
    const steps = Math.floor(range / step);
    const randomSteps = generateRandomInt(0, steps);
    return parseFloat((min + randomSteps * step).toFixed(1));
}

function generateRandomParams() {
    const N = generateRandomInt(2, 6);
    const dynamicStopMultiplier = generateRandomFloat(3, 9, 0.1);
    let drawdowns = [];
    const pool = Array.from({ length: 26 }, (_, i) => i + 5);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[pool[i], pool[j]] = [pool[j], pool[i]]; }
    const sampleN = Math.min(N, pool.length);
    drawdowns = pool.slice(0, sampleN);
    drawdowns.sort((a, b) => a - b);
    let ratios = [];
    let sum = 0;
    const actualN = drawdowns.length;
    for (let i = 0; i < actualN; i++) {
        const weight = Math.random() * 100;
        ratios.push(weight);
        sum += weight;
    }
    const normalizedRatios = ratios.map(r => Math.round((r / sum) * 100));
    const finalSum = normalizedRatios.reduce((a, b) => a + b, 0);
    if (finalSum !== 100 && actualN > 0) normalizedRatios[actualN - 1] += (100 - finalSum);

    return { stageCount: actualN, dynamicStopMultiplier: dynamicStopMultiplier, drawdowns: drawdowns, ratios: normalizedRatios };
}

async function runOptimization() {
    if (isOptimizing) return;
    const runCountInput = document.getElementById('optimizationRunCount');
    let runCount = parseInt(runCountInput.value, 10);
    if (isNaN(runCount) || runCount < 1) { displayError("請輸入有效的優化次數"); return; }
    if (runCount > 5000) runCount = 5000;

    const pastedCsv = document.getElementById('csvInput').value.trim();
    let rawData = pastedCsv ? pastedCsv : (currentFileContent || "");
    if (!rawData) { displayError("請先上傳 CSV 檔案或貼上數據"); return; }
    priceData = parseCsvData(rawData);
    if (priceData.length < 2) { displayError("數據不足，無法執行優化"); return; }

    const initialCapital = parseFloat(document.getElementById('initialCapital').value);
    const completedOnlyReturn = document.getElementById('optimizationCompletedOnly')?.checked;
    const resultsContainer = document.getElementById('optimizationResultsBody');
    const optimizationBtn = document.getElementById('runOptimizationBtn');
    const progressBar = document.getElementById('optimizationProgressBar');
    const progressText = document.getElementById('optimizationProgressText');
    const progressContainer = document.getElementById('optimizationProgress');

    // Checkbox for Time Logic
    const useTimeLogic = document.getElementById('useTimeLogic').checked;
    const timeMin = parseInt(document.getElementById('timeMin').value, 10);
    const timeCap = parseInt(document.getElementById('timeCap').value, 10);
    const maxTighten = parseInt(document.getElementById('maxTighten').value, 10);

    isOptimizing = true;
    optimizationBtn.disabled = true;
    optimizationBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin mr-2"></i> 執行中...`;
    lucide.createIcons();
    resultsContainer.innerHTML = `<tr><td colspan="8" class="px-6 py-4 text-center text-slate-500">優化進行中，請稍候...</td></tr>`;
    progressContainer.classList.remove('hidden');
    progressText.classList.remove('hidden');

    let allResults = [];
    for (let i = 0; i < runCount; i++) {
        const randomParams = generateRandomParams();

        // Construct options object
        const options = {
            initialCapital,
            drawdowns: randomParams.drawdowns,
            ratios: randomParams.ratios,
            dynamicStopMultiplier: randomParams.dynamicStopMultiplier,
            dataToUse: priceData,
            useTimeLogic, timeMin, timeCap, maxTighten // Pass B-Mode params
        };

        const result = runBacktest(options);
        const metricValue = completedOnlyReturn ? result.realized_return_rate : result.total_return_rate;
        const metricLabel = completedOnlyReturn ? '完成交易報酬（已實現）' : '報酬率（含持倉）';
        allResults.push({
            params: randomParams,
            result,
            returnRate: metricValue,
            returnLabel: metricLabel
        });
        const progressPct = ((i + 1) / runCount) * 100;
        progressBar.style.width = `${progressPct}%`;
        progressText.textContent = `已完成 ${i + 1} / ${runCount} 次`;
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    allResults.sort((a, b) => b.returnRate - a.returnRate);
    const ranked = allResults.map((entry, index) => ({ ...entry, rank: index + 1 }));
    optimizationCandidates = ranked.slice(0, Math.min(20, ranked.length));
    const displayEntries = optimizationCandidates.slice(0, Math.min(5, optimizationCandidates.length));
    const downloadBtn = document.getElementById('downloadOptimizationCsv');
    if (downloadBtn) downloadBtn.disabled = optimizationCandidates.length === 0;

    isOptimizing = false;
    progressBar.style.width = '0%';
    progressText.classList.add('hidden');
    progressContainer.classList.add('hidden');
    optimizationBtn.disabled = false;
    optimizationBtn.innerHTML = `<i data-lucide="zap" class="w-5 h-5 fill-current mr-2"></i> 再次執行參數優化`;
    lucide.createIcons();
    renderOptimizationResults(displayEntries, resultsContainer);
}

function renderOptimizationResults(entries, container) {
    if (entries.length === 0) { container.innerHTML = `<tr><td colspan="8" class="px-6 py-4 text-center text-red-500">無有效結果</td></tr>`; return; }
    container.innerHTML = '';
    entries.forEach((entry) => {
        const { params, result, returnRate, returnLabel } = entry;
        const drawdownsStr = params.drawdowns.map(d => d.toFixed(0)).join(', ');
        const ratiosStr = params.ratios.map(r => r.toFixed(0)).join(', ');
        const cagrText = formatPercent(result.annualized_return_rate) + '%';
        const returnText = formatPercent(returnRate) + '%';
        const returnClass = returnRate >= 0 ? 'text-emerald-600' : 'text-red-500';
        const finalPrice = result.final_price || 0;
        const holdingValue = result.final_shares > 0 ? result.final_shares * finalPrice : 0;
        const holdingText = result.final_shares > 0 ? `${formatNumber(holdingValue, 0)} (${result.final_shares.toFixed(2)} 股)` : '無持倉';
        const row = document.createElement('tr');
        row.className = `hover:bg-brand-50/50 transition-colors ${entry.rank === 1 ? 'bg-yellow-50/70 border-b-2 border-yellow-200 font-semibold' : ''}`;
        row.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-900">${entry.rank}</td>
                    <td class="px-6 py-4 text-sm text-slate-700">${params.stageCount}</td>
                    <td class="px-6 py-4 text-sm text-slate-700">${params.dynamicStopMultiplier.toFixed(1)}%</td>
                    <td class="px-6 py-4 text-sm text-slate-700 font-mono text-xs optimization-params-col" title="${drawdownsStr}">${drawdownsStr}</td>
                    <td class="px-6 py-4 text-sm text-slate-700 font-mono text-xs optimization-params-col" title="${ratiosStr}">${ratiosStr}</td>
                    <td class="px-6 py-4 text-sm text-slate-700 font-mono text-xs">${holdingText}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <div class="text-sm font-semibold ${returnClass}">${returnText}</div>
                        <div class="text-[0.65rem] text-slate-400">${returnLabel || '報酬率'}</div>
                        <div class="text-[0.65rem] text-slate-400">CAGR ${cagrText}</div>
                    </td>
                    <td class="px-2 py-2">
                        <button type="button" data-rank="${entry.rank}" class="apply-optimization-btn text-[0.65rem] font-medium px-2 py-1 rounded-full border border-brand-200 text-brand-600 hover:bg-brand-50">套用參數</button>
                    </td>
                `;
        container.appendChild(row);
    });
}

function parseDateValue(value) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : value;
}

function renderPriceChart(equityHistory, tradeHistory) {
    const canvas = document.getElementById('priceChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!equityHistory || equityHistory.length === 0) {
        if (priceChart) priceChart.destroy();
        return;
    }
    const labels = equityHistory.map(entry => entry.date ?? '');
    const priceValues = equityHistory.map(entry => entry.price ?? null);
    const equityValues = equityHistory.map(entry => entry.equity ?? null);
    const buyPoints = tradeHistory.filter(tx => tx.Type === 'BUY').map(tx => ({ x: tx.Date, y: tx.Price }));
    const sellPoints = tradeHistory.filter(tx => tx.Type === 'SELL').map(tx => ({ x: tx.Date, y: tx.Price }));
    if (priceChart) {
        priceChart.destroy();
    }
    priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'QQQ 收盤價',
                    data: priceValues,
                    borderColor: '#0f9d58',
                    backgroundColor: 'rgba(15,157,88,0.15)',
                    tension: 0.25,
                    borderWidth: 2,
                    pointRadius: 2,
                    spanGaps: true
                },
                {
                    label: '累積資產價值',
                    data: equityValues,
                    borderColor: '#1e70fe',
                    backgroundColor: 'rgba(30,112,254,0.15)',
                    tension: 0.25,
                    borderDash: [4, 4],
                    borderWidth: 2,
                    pointRadius: 2,
                    spanGaps: true
                },
                {
                    label: '買入點',
                    data: buyPoints,
                    type: 'scatter',
                    pointStyle: 'triangle',
                    pointBackgroundColor: '#16a34a',
                    pointBorderColor: '#16a34a',
                    pointRadius: 9,
                    rotation: 180,
                    showLine: false
                },
                {
                    label: '賣出點',
                    data: sellPoints,
                    type: 'scatter',
                    pointStyle: 'triangle',
                    pointBackgroundColor: '#dc2626',
                    pointBorderColor: '#dc2626',
                    pointRadius: 9,
                    rotation: 0,
                    showLine: false
                }
            ]
        },
        options: {
            parsing: false,
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false
                },
                legend: {
                    labels: {
                        filter: item => item.text !== '買入點' && item.text !== '賣出點'
                    }
                }
            },
        scales: {
            x: {
            type: 'category',
            title: { display: true, text: '日期' }
        },
        y: {
            title: { display: true, text: '價格 / 資產價值 (TWD)' },
            ticks: {
                callback: value => formatNumber(value)
            }
                }
            }
        }
    });
}

function applyOptimizationCandidate(rank) {
    const candidate = optimizationCandidates.find(entry => entry.rank === rank);
    if (!candidate) return;
    document.getElementById('stageCount').value = candidate.params.stageCount;
    document.getElementById('dynamicStopMultiplier').value = candidate.params.dynamicStopMultiplier.toFixed(1);
    document.getElementById('drawdownThresholds').value = candidate.params.drawdowns.map(d => d.toFixed(0)).join(',');
    document.getElementById('allocationRatios').value = candidate.params.ratios.map(r => r.toFixed(0)).join(',');
}

function handleOptimizationActions(event) {
    const button = event.target.closest('.apply-optimization-btn');
    if (!button) return;
    const rank = parseInt(button.dataset.rank, 10);
    if (Number.isNaN(rank)) return;
    applyOptimizationCandidate(rank);
}

function downloadOptimizationCsv() {
    if (!optimizationCandidates.length) return;
    const header = ['排名', 'N', '止盈乘數(%)', '跌幅門檻(%)', '資金比例(%)', '持倉市值', '完成報酬(%)', '優化報酬(%)', '年化報酬率(%)'];
    const lines = [header.join(',')];
    optimizationCandidates.forEach(entry => {
        const { params, result, returnRate } = entry;
        const holdValue = result.final_holdings_value || 0;
        const realizedPct = (result.realized_return_rate || 0) * 100;
        const optimizedPct = (returnRate || 0) * 100;
        const annualizedPct = (result.annualized_return_rate || 0) * 100;
        const drawdownList = `"${params.drawdowns.map(d => d.toFixed(0)).join(';')}"`;
        const ratioList = `"${params.ratios.map(r => r.toFixed(0)).join(';')}"`;
        const row = [
            entry.rank,
            params.stageCount,
            params.dynamicStopMultiplier.toFixed(1),
            drawdownList,
            ratioList,
            holdValue.toFixed(0),
            realizedPct.toFixed(2),
            optimizedPct.toFixed(2),
            annualizedPct.toFixed(2)
        ];
        lines.push(row.join(','));
    });
    const csvContent = lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'optimization_top20.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// V2.8 核心邏輯 - 更新 runBacktest 以支援 B 版邏輯
// 使用 options 物件傳遞所有參數
function runBacktest(options) {
    const { initialCapital, drawdowns, ratios, dynamicStopMultiplier, dataToUse, useTimeLogic, timeMin, timeCap, maxTighten } = options;

    const priceData = dataToUse;
    if (priceData.length < 2) return { trade_history: [], final_asset_value: initialCapital, total_return_rate: 0, annualized_return_rate: 0, final_shares: 0, average_cost: 0, stageCount: drawdowns.length, equityHistory: [] };

    const drawdownsPct = drawdowns.map(d => d / 100);
    const ratiosPct = ratios.map(r => r / 100);
    const stopMultiplierDecimal = dynamicStopMultiplier / 100;

    let currentCycleCapital = initialCapital;

    let portfolio = {
        shares: 0.0, cash: 0.0, buyFlags: new Array(drawdowns.length).fill(true), investmentSum: 0.0,
        OH: priceData[0].Close, NH: priceData[0].Close, isFullyInvested: false, hasBoughtInCycle: false,
        tradeHistory: [], minPriceInCycle: priceData[0].Close,
        buyCountInCycle: 0, cumulativeProfit: 0.0,
        // B-Mode State Variables
        firstBuyIndex: -1, // 紀錄當前週期第一筆買入的 index (K棒位置)
        nhHistory: [], // 紀錄 NH 的歷史值，用於計算停滯
        stagnationWindow: 20, // 停滯觀察窗口 (固定為 20)
        stagnationThreshold: 0.015 // 停滯門檻 1.5% (固定)
    };

    portfolio.cash = currentCycleCapital;
    let buyAmounts = ratiosPct.map(r => currentCycleCapital * r);
    const equityHistory = [];

    for (let i = 0; i < priceData.length; i++) {
        const currentPrice = priceData[i].Close;
        const dateStr = priceData[i].Date;

        // 1. OH Update
        if (!portfolio.hasBoughtInCycle && currentPrice > portfolio.OH) {
            portfolio.OH = currentPrice;
            portfolio.NH = currentPrice;
            portfolio.minPriceInCycle = currentPrice;
        }

        portfolio.minPriceInCycle = Math.min(portfolio.minPriceInCycle, currentPrice);

        // 2. Buy Logic
        if (!portfolio.isFullyInvested) {
            const currentDrawdown = (currentPrice / portfolio.OH) - 1;
            let triggeredStages = [];
            let totalAmountToBuy = 0;

            let dailyRemainingCash = portfolio.cash;

            for (let j = 0; j < drawdownsPct.length; j++) {
                if (currentDrawdown <= -drawdownsPct[j] && portfolio.buyFlags[j]) {
                    let amount = buyAmounts[j];
                    if (amount > dailyRemainingCash) amount = dailyRemainingCash;

                    if (amount > 0) {
                        totalAmountToBuy += amount;
                        dailyRemainingCash -= amount;
                        triggeredStages.push(j + 1);
                        portfolio.buyFlags[j] = false;
                    }
                }
            }

            if (totalAmountToBuy > 0) {
                const sharesBought = totalAmountToBuy / currentPrice;
                portfolio.shares += sharesBought;
                portfolio.cash -= totalAmountToBuy;
                portfolio.investmentSum += totalAmountToBuy;

                if (!portfolio.hasBoughtInCycle) {
                    portfolio.hasBoughtInCycle = true;
                    portfolio.firstBuyIndex = i; // B-Mode: Record first buy K-bar index
                }
                portfolio.buyCountInCycle += 1;

                portfolio.tradeHistory.push({
                    Type: 'BUY', Date: dateStr, Price: currentPrice,
                    Drawdown: currentDrawdown,
                    Amount_TWD: totalAmountToBuy,
                    Shares: sharesBought,
                    Stage: triggeredStages.join('&'),
                    OH_Price_At_Buy: portfolio.OH.toFixed(2)
                });

                if (portfolio.buyFlags.every(flag => !flag) || portfolio.cash < 1) portfolio.isFullyInvested = true;
            }
        }

        // 3. Sell Logic (Updated for B-Mode)
        if (portfolio.shares > 0) {
            // Update NH history for stagnation check (Keep only last 20 bars relative to current holding)
            // We only care about NH history during the holding period
            if (currentPrice >= portfolio.OH) {
                if (currentPrice > portfolio.NH) {
                    portfolio.NH = currentPrice;
                }

                // --- Calculate B-Mode Alpha ---
                let alpha = 1.0; // Default: No tightening

                if (useTimeLogic && portfolio.firstBuyIndex !== -1) {
                    const currentBarCount = i - portfolio.firstBuyIndex;
                    const isHeldLongEnough = currentBarCount >= timeMin;

                    // Update NH history only when price is above OH (or when a buy has occurred)
                    if (portfolio.hasBoughtInCycle) {
                        portfolio.nhHistory.push(portfolio.NH);
                        if (portfolio.nhHistory.length > portfolio.stagnationWindow + 1) {
                            portfolio.nhHistory.shift(); // Keep window size
                        }
                    }

                    let isStagnant = false;
                    if (portfolio.nhHistory.length >= portfolio.stagnationWindow) {
                        // Compare NH now vs NH 20 bars ago
                        // Note: nhHistory includes the current bar's NH
                        const nhNow = portfolio.nhHistory[portfolio.nhHistory.length - 1]; // Latest NH
                        const nh20Ago = portfolio.nhHistory[portfolio.nhHistory.length - portfolio.stagnationWindow]; // NH from 20 bars ago

                        const growth = (nhNow / nh20Ago) - 1;

                        if (growth < portfolio.stagnationThreshold) {
                            isStagnant = true;
                        }
                    }

                    if (isHeldLongEnough && isStagnant) {
                        // Apply Time Tightening Logic
                        const overtime = Math.max(0, currentBarCount - timeMin);
                        const timeFactor = Math.min(1, overtime / (timeCap - timeMin));
                        const maxTightenDecimal = maxTighten / 100;
                        // Max Tightening (Rmax) is the maximum reduction from the original multiplier (stopMultiplierDecimal)
                        // We are reducing the overall multiplier by (Rmax * timeFactor)
                        alpha = 1 - (maxTightenDecimal * timeFactor);
                    }
                }

                // --- Apply Alpha to Dynamic Stop ---
                // Original: X = (NH / OH) * M%
                // New: X_tight = X * alpha
                const stopMultiplierPct = stopMultiplierDecimal * 100; // e.g. 3.0

                // Calculate the base drawdown percentage from NH to stop price.
                // This should be based on the original Stop Multiplier.
                const baseStopPctFromNH = stopMultiplierPct / 100; // e.g., 0.03

                // Apply the alpha factor to tighten the stop gap.
                const dynamicStopPctFromNH = baseStopPctFromNH * alpha;

                // Trigger price is current NH discounted by the dynamic Stop percentage
                const triggerPrice = portfolio.NH * (1 - dynamicStopPctFromNH);

                if (currentPrice <= triggerPrice) {
                    // Calc Max Drawdown from Average Held Cost (AHC)
                    const ahc = portfolio.investmentSum / portfolio.shares;
                    const maxDrawdownPct = (ahc - portfolio.minPriceInCycle) / ahc;

                    const sellProceeds = portfolio.shares * currentPrice;
                    const totalInvestedInCycle = portfolio.investmentSum;
                    const profitAmount = sellProceeds - totalInvestedInCycle;

                    portfolio.cumulativeProfit += profitAmount;
                    currentCycleCapital = portfolio.cash + sellProceeds;

                    portfolio.tradeHistory.push({
                        Type: 'SELL', Date: dateStr, Price: currentPrice,
                        Gain_Pct: (sellProceeds / totalInvestedInCycle) - 1,
                        Shares: portfolio.shares, Proceeds_TWD: sellProceeds,
                        Profit_Amount: profitAmount,
                        DynamicStopPct: dynamicStopPctFromNH, OH_Price: portfolio.OH.toFixed(2), NH_Price: portfolio.NH.toFixed(2),
                        MaxDrawdownPct: -maxDrawdownPct, MinPrice: portfolio.minPriceInCycle,
                        TotalBuyCount: portfolio.buyCountInCycle, TotalBuyAmount: totalInvestedInCycle, AverageCost: ahc,
                        Cash_After_Sell: currentCycleCapital, Cumulative_Profit: portfolio.cumulativeProfit,
                        Alpha: alpha // Log alpha for debug/verification
                    });

                    // Reset Portfolio
                    portfolio.shares = 0.0;
                    portfolio.cash = currentCycleCapital;
                    portfolio.investmentSum = 0.0;
                    portfolio.isFullyInvested = false;
                    portfolio.buyFlags = new Array(drawdowns.length).fill(true);
                    portfolio.OH = currentPrice;
                    portfolio.NH = currentPrice;
                    portfolio.hasBoughtInCycle = false;
                    portfolio.minPriceInCycle = currentPrice;
                    portfolio.buyCountInCycle = 0;

                    // Reset B-Mode State
                    portfolio.firstBuyIndex = -1;
                    portfolio.nhHistory = [];

                    buyAmounts = ratiosPct.map(r => currentCycleCapital * r);
                }
            }
            const dayEquity = portfolio.cash + (portfolio.shares * currentPrice);
            equityHistory.push({ date: dateStr, price: currentPrice, equity: dayEquity });
        }
    }

    const finalPrice = priceData.length > 0 ? priceData[priceData.length - 1].Close : 0;
    const finalAssetValue = portfolio.shares * finalPrice + portfolio.cash;
    const totalReturnRate = (finalAssetValue / initialCapital) - 1;
    const years = calculateYearsDifference(priceData[0].Date, priceData[priceData.length - 1].Date);
    let annualizedReturnRate = (years > 0 && 1 + totalReturnRate >= 0) ? Math.pow(1 + totalReturnRate, 1 / years) - 1 : 0;
    let averageCost = portfolio.investmentSum > 0 ? (portfolio.shares > 0 ? portfolio.investmentSum / portfolio.shares : 0) : 0;
    const holdingValue = portfolio.shares * finalPrice;
    const realizedProfit = portfolio.cumulativeProfit;
    const realizedReturnRate = initialCapital > 0 ? realizedProfit / initialCapital : 0;

    return {
        initial_capital: initialCapital,
        final_asset_value: finalAssetValue,
        total_return_rate: totalReturnRate,
        annualized_return_rate: annualizedReturnRate,
        final_shares: portfolio.shares,
        average_cost: averageCost,
        final_price: finalPrice,
        final_holdings_value: holdingValue,
        realized_profit: realizedProfit,
        realized_return_rate: realizedReturnRate,
        equityHistory,
        trade_history: portfolio.tradeHistory,
        drawdowns, ratios, dynamicStopMultiplier, stageCount: drawdowns.length
    };
}

// --- UI Events ---

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('csvFile').addEventListener('change', handleFileSelect);
    document.getElementById('csvInput').addEventListener('input', () => {
        if (document.getElementById('csvInput').value.trim() !== '') document.getElementById('csvFile').value = '';
    });

    // Toggle visibility of B-Mode params
    document.getElementById('useTimeLogic').addEventListener('change', (e) => {
        const params = document.getElementById('timeLogicParams');
        if (e.target.checked) {
            params.classList.remove('opacity-50', 'pointer-events-none');
        } else {
            params.classList.add('opacity-50', 'pointer-events-none');
        }
    });
    const optimizationResultsBody = document.getElementById('optimizationResultsBody');
    if (optimizationResultsBody) {
        optimizationResultsBody.addEventListener('click', handleOptimizationActions);
    }
    const downloadBtn = document.getElementById('downloadOptimizationCsv');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadOptimizationCsv);
        downloadBtn.disabled = true;
    }
});

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) { displayError('請選擇 .csv 格式檔案'); return; }
    document.getElementById('csvInput').value = '';
    currentFileName = file.name;
    const reader = new FileReader();
    reader.onload = function (e) {
        let content = e.target.result;
        let data = parseCsvData(content);
        const containsHighAscii = /[\u4e00-\u9fa5\u3000-\u303F]/.test(content);
        if (data.length < 2 && file.size > 0 && containsHighAscii) { readAsBig5(file); }
        else if (data.length < 2 && file.size > 0) { displayError(`檔案格式錯誤`); updateDataStatus(false, "格式錯誤"); }
        else {
            currentFileContent = content;
            priceData = data;
            updateDataSourceDisplay(currentFileName);
            updateDataStatus(true);
            document.getElementById('errorMessage').classList.add('hidden');
        }
    };
    reader.onerror = () => displayError('讀取檔案失敗');
    reader.readAsText(file, 'UTF-8');
}

function readAsBig5(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        let content = e.target.result;
        let data = parseCsvData(content);
        if (data.length < 2) { displayError(`編碼錯誤`); updateDataStatus(false, "編碼錯誤"); }
        else { currentFileContent = content; updateDataSourceDisplay(currentFileName); updateDataStatus(true); document.getElementById('errorMessage').classList.add('hidden'); }
    };
    reader.readAsText(file, 'Big5');
}

function updateDataSourceDisplay(text) { document.getElementById('currentDataSourceDisplay').textContent = `當前數據源：${text}`; }
function updateDataStatus(isLoaded, text = "已載入") {
    const badge = document.getElementById('dataStatusBadge');
    badge.className = isLoaded ? "px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700" : "px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700";
    badge.textContent = text;
}

function initBacktest() {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.classList.add('hidden');
    const pastedCsv = document.getElementById('csvInput').value.trim();
    let rawData = pastedCsv ? pastedCsv : (currentFileContent || "");
    let sourceName = pastedCsv ? "手動貼上數據" : currentFileName;
    if (!rawData) { displayError("請先上傳 CSV 檔案"); return; }
    priceData = parseCsvData(rawData);
    if (priceData.length < 2) { displayError("數據不足"); updateDataStatus(false, "數據不足"); return; }
    if (pastedCsv) { updateDataSourceDisplay("手動貼上數據"); updateDataStatus(true, "已載入"); }

    const initialCapital = parseFloat(document.getElementById('initialCapital').value);
    const dynamicStopMultiplier = parseFloat(document.getElementById('dynamicStopMultiplier').value);
    const stageCount = parseInt(document.getElementById('stageCount').value, 10);
    const drawdowns = document.getElementById('drawdownThresholds').value.split(',').map(Number);
    const ratios = document.getElementById('allocationRatios').value.split(',').map(Number);

    // B-Mode Params
    const useTimeLogic = document.getElementById('useTimeLogic').checked;
    const timeMin = parseInt(document.getElementById('timeMin').value, 10);
    const timeCap = parseInt(document.getElementById('timeCap').value, 10);
    const maxTighten = parseInt(document.getElementById('maxTighten').value, 10);

    if (drawdowns.length !== stageCount || ratios.length !== stageCount) { displayError(`參數數量不符`); return; }
    if (Math.abs(ratios.reduce((a, b) => a + b, 0) - 100) > 0.1) { displayError("資金比例總和須為 100%"); return; }

    drawdowns.sort((a, b) => a - b);

    // Construct options
    const options = {
        initialCapital, drawdowns, ratios, dynamicStopMultiplier,
        dataToUse: priceData,
        useTimeLogic, timeMin, timeCap, maxTighten
    };

    const results = runBacktest(options);
    renderResults(results);
}

function renderResults(results) {
    document.getElementById('finalAssetValue').textContent = formatNumber(results.final_asset_value, 0);
    const totalReturnEl = document.getElementById('totalReturnRate');
    totalReturnEl.textContent = formatPercent(results.total_return_rate) + '%';
    totalReturnEl.className = `text-2xl font-bold ${results.total_return_rate >= 0 ? 'text-emerald-600' : 'text-red-500'}`;
    const cagrEl = document.getElementById('annualizedReturnRate');
    cagrEl.textContent = formatPercent(results.annualized_return_rate) + '%';
    cagrEl.className = `text-2xl font-bold ${results.annualized_return_rate >= 0 ? 'text-emerald-600' : 'text-red-500'}`;
    document.getElementById('averageCost').textContent = results.average_cost.toFixed(2);

    const historyBody = document.getElementById('historyTableBody');
    historyBody.innerHTML = '';
    if (results.trade_history.length === 0) { historyBody.innerHTML = '<tr><td colspan="4" class="px-6 py-10 text-center text-slate-400 text-sm">無交易紀錄</td></tr>'; return; }

    results.trade_history.forEach(trade => {
        const row = document.createElement('tr');
        row.className = "hover:bg-slate-50 transition-colors";
        let typeBadge, detailText;
        if (trade.Type === 'BUY') {
            typeBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">買入</span>`;
            detailText = `第 ${trade.Stage} 級，總投入 $${formatNumber(trade.Amount_TWD, 0)} (鎖定 OH: ${trade.OH_Price_At_Buy})`;
        } else {
            typeBadge = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">賣出</span>`;

            const profitClass = trade.Profit_Amount >= 0 ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold';
            const profitSign = trade.Profit_Amount >= 0 ? '+' : '';
            const cumulativeProfitClass = trade.Cumulative_Profit >= 0 ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold';
            const cumulativeProfitSign = trade.Cumulative_Profit >= 0 ? '+' : '';

            // Show Alpha if applied (< 1)
            let alphaText = "";
            if (trade.Alpha && trade.Alpha < 1.0) {
                alphaText = `<span class="text-xs text-brand-600 ml-1">(B-Mode α:${trade.Alpha.toFixed(2)})</span>`;
            }

            detailText = `
                        <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:text-sm">
                            <div>本次獲利: <span class="${profitClass}">${(trade.Gain_Pct * 100).toFixed(2)}%</span> ($${profitSign}${formatNumber(trade.Profit_Amount, 0)})</div>
                            <div>累積獲利: <span class="${cumulativeProfitClass}">${cumulativeProfitSign}${formatNumber(trade.Cumulative_Profit, 0)}</span></div>
                            <div>賣出後現金: $${formatNumber(trade.Cash_After_Sell, 0)}</div>
                            <div>平均成本: ${formatNumber(trade.AverageCost, 2)}</div>
                            <div class="col-span-2 border-t pt-1 mt-1 text-slate-500">
                                Max DD: <span class="text-red-500 font-medium">${(trade.MaxDrawdownPct * 100).toFixed(2)}%</span> (最低 ${trade.MinPrice.toFixed(2)})
                                ${alphaText}
                            </div>
                        </div>
                    `;
        }
        row.innerHTML = `<td class="px-6 py-4 whitespace-nowrap align-top">${typeBadge}</td><td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600 align-top">${trade.Date}</td><td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 text-right align-top">${trade.Price.toFixed(2)}</td><td class="px-6 py-4 text-sm text-slate-500">${detailText}</td>`;
        historyBody.appendChild(row);
    });
    renderPriceChart(results.equityHistory || [], results.trade_history || []);
}

function displayError(msg) { document.getElementById('errorMessageText').textContent = msg; document.getElementById('errorMessage').classList.remove('hidden'); }

window.onload = function () { document.getElementById('allocationRatios').value = "30,30,40"; };
