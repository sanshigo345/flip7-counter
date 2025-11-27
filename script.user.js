// ==UserScript==
// @name         BGA Flip Seven Strategic Counter
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Advanced card counter and strategy assistant for Flip Seven on BoardGameArena
// @author       Gemini/KuRRe8
// @match        https://boardgamearena.com/*/flipseven?table=*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  "use strict";

  // --- Utility Functions ---

  const isInGameUrl = (url) => {
    return /https:\/\/boardgamearena\.com\/\d+\/flipseven\?table=\d+/.test(url);
  };

  // --- Configuration & State ---

  const getInitialCardCounts = () => {
    return {
      "12card": 12, "11card": 11, "10card": 10, "9card": 9,
      "8card": 8, "7card": 7, "6card": 6, "5card": 5,
      "4card": 4, "3card": 3, "2card": 2, "1card": 1,
      "0card": 1, "double": 1, "flip3": 3, "Second chance": 3, "Freeze": 3,
      "Plus2": 1, "Plus4": 1, "Plus6": 1, "Plus8": 1, "Plus10": 1,
    };
  };

  let globalCardCounts = null;
  let roundCardCounts = null;
  let playerBoards = null; // Array of objects representing each player's board
  let bustedPlayers = {};
  let stayedPlayers = {};
  let frozenPlayers = {};
  let logCounter = 0;

  const getInitialPlayerBoard = () => {
    return Object.fromEntries(
      Object.keys(getInitialCardCounts()).map((key) => [key, 0])
    );
  };

  const clearPlayerBoard = (index) => {
    if (Array.isArray(playerBoards)) {
      if (typeof index === "number") {
        Object.keys(playerBoards[index]).forEach((key) => {
          playerBoards[index][key] = 0;
        });
      } else {
        playerBoards.forEach((board) => {
          Object.keys(board).forEach((key) => (board[key] = 0));
        });
      }
    }
  };

  const clearRoundCardCounts = () => {
    if (roundCardCounts) {
      Object.keys(roundCardCounts).forEach((key) => (roundCardCounts[key] = 0));
    }
  };

  const resetPlayerStates = () => {
    const playerNames = window.flipsevenPlayerNames || [];
    bustedPlayers = {};
    stayedPlayers = {};
    frozenPlayers = {};
    playerNames.forEach((name) => {
      bustedPlayers[name] = false;
      stayedPlayers[name] = false;
      frozenPlayers[name] = false;
    });
  };

  // --- Strategy & Probability Logic ---

  /**
   * Calculates the exact survival percentage based on remaining cards in deck.
   * @param {number} playerIndex - Index of the player to analyze.
   * @returns {object} - { survivalRate: number, currentScore: number, cardCount: number, hasSecondChance: boolean }
   */
  const calculatePlayerStats = (playerIndex) => {
    if (!playerBoards || !playerBoards[playerIndex]) {
      return { survivalRate: 100, currentScore: 0, cardCount: 0, hasSecondChance: false };
    }

    const myBoard = playerBoards[playerIndex];
    let totalCardsRemaining = 0;
    let killerCardsRemaining = 0;
    let currentScore = 0;
    let cardCount = 0;
    let hasSecondChance = false;

    // Calculate score and status
    Object.entries(myBoard).forEach(([key, count]) => {
      if (count > 0) {
        cardCount += count;
        
        // Check for Second Chance
        if (key === "Second chance") hasSecondChance = true;

        // Calculate Score
        const numberMatch = key.match(/^(\d+)card$/);
        if (numberMatch) {
          currentScore += parseInt(numberMatch[1], 10);
        } else if (key.startsWith("Plus")) {
          currentScore += parseInt(key.replace("Plus", ""), 10);
        }
      }
    });

    // Calculate Probability
    // We look at the Global Deck (globalCardCounts) to see what is actually left to draw.
    Object.entries(globalCardCounts).forEach(([key, count]) => {
      totalCardsRemaining += count;

      // If we already have this card type on our board, every copy in the deck is a Killer.
      // Note: "Second chance" and effect cards usually don't bust you on duplicate? 
      // Assumption: Only number cards bust on duplicate.
      if (myBoard[key] > 0 && key.includes("card")) {
        killerCardsRemaining += count;
      }
    });

    if (totalCardsRemaining === 0) return { survivalRate: 100, currentScore, cardCount, hasSecondChance };

    const survivalRate = ((totalCardsRemaining - killerCardsRemaining) / totalCardsRemaining) * 100;

    return {
      survivalRate: Math.round(survivalRate),
      currentScore,
      cardCount,
      hasSecondChance
    };
  };

  /**
 * Calculates a precise required survival rate for any specific score
 * using linear interpolation between defined milestones.
 */
// Configuration: Minimum survival rate required for each specific score.
// Index = Current Score, Value = Required % to Hit
const RISK_TOLERANCE = {
    0: 50,  1: 50,  2: 50,  3: 50,  4: 50,  5: 50,
    6: 51,  7: 51,  8: 52,  9: 52,  10: 53,
    11: 53, 12: 54, 13: 54, 14: 55, 15: 55,
    16: 56, 17: 57, 18: 58, 19: 59, 20: 60,
    21: 61, 22: 62, 23: 63, 24: 64, 25: 66,
    26: 67, 27: 68, 28: 69, 29: 70, 30: 71,
    31: 72, 32: 73, 33: 74, 34: 75, 35: 76,
    36: 77, 37: 78, 38: 79, 39: 80, 40: 81,
    41: 82, 42: 83, 43: 84, 44: 85, 45: 86,
    46: 88, 47: 90, 48: 92, 49: 94, 50: 95,
    51: 96, 52: 97, 53: 98, 54: 99, 55: 99
};

const getStrategicAdvice = (stats) => {
    const { currentScore, survivalRate, cardCount, hasSecondChance } = stats;

    // RULE 1: Protected
    if (hasSecondChance) {
        return { action: "HIT", reason: "Protected", color: "#2ecc40" };
    }

    // RULE 2: Flip 7 Bonus Chase (6 cards)
    if (cardCount >= 6) {
        return survivalRate >= 50 
            ? { action: "HIT", reason: "Chase Bonus", color: "#2ecc40" }
            : { action: "STOP", reason: "Risk > Bonus", color: "#ff4136" };
    }

    // RULE 3: Lookup Table Logic
    // Default to 99% if score is higher than our table handles (55+)
    const requiredRate = RISK_TOLERANCE[currentScore] || 99;

    if (survivalRate >= requiredRate) {
        return { action: "HIT", reason: `Safe (> ${requiredRate}%)`, color: "#2ecc40" };
    } else {
        return { action: "STOP", reason: `Risky (Need ${requiredRate}%)`, color: "#ff4136" };
    }
};

  // --- UI Construction ---

  const createCardCounterPanel = () => {
    let panel = document.createElement("div");
    panel.id = "flipseven-card-counter-panel";
    Object.assign(panel.style, {
        position: "fixed", top: "80px", right: "20px", zIndex: "99999",
        background: "rgba(240, 248, 255, 0.95)", border: "1px solid #5bb",
        borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        padding: "12px", fontSize: "14px", color: "#222",
        maxHeight: "85vh", overflowY: "auto", minWidth: "220px",
        fontFamily: "Arial, sans-serif"
    });

    panel.innerHTML = `
      <div style="font-weight:bold; font-size:16px; margin-bottom:8px; text-align:center; color:#333;">Flip 7 Assistant</div>
      <div id="flipseven-deck-stats"></div>
      <hr style="margin:8px 0; border:0; border-top:1px solid #ccc;">
      <div id="flipseven-player-stats"></div>
    `;
    document.body.appendChild(panel);
    makePanelDraggable(panel);
  };

  const renderDeckStats = (dictionary) => {
    let html = '<table style="border-collapse:collapse;width:100%; font-size:12px;">';
    const totalLeft = Object.values(dictionary).reduce((a, b) => a + b, 0) || 1;
    
    Object.entries(dictionary).forEach(([key, value]) => {
      const percent = Math.round((value / totalLeft) * 100);
      let numColor = "#888";
      if (value <= 2) numColor = "#2ecc40"; // Green (Safe to see)
      else if (value <= 5) numColor = "#ffdc00"; // Yellow
      else numColor = "#ff4136"; // Red (Dangerous density)

      // Clean up key name for display
      const displayName = key.replace("card", "");

      html += `
        <tr>
          <td style='padding:2px;'><b>${displayName}</b></td>
          <td class='flipseven-anim-num' data-key='${key}' style='padding:2px; text-align:right; color:${numColor}; font-weight:bold;'>
            ${value} <span style='font-size:0.9em; color:#aaa;'>(${percent}%)</span>
          </td>
        </tr>`;
    });
    html += "</table>";
    return html;
  };

  const updateCardCounterPanel = (flashKey) => {
    const panel = document.getElementById("flipseven-card-counter-panel");
    if (!panel) return;

    // Update Deck Stats
    const deckContainer = document.getElementById("flipseven-deck-stats");
    if (deckContainer) deckContainer.innerHTML = renderDeckStats(globalCardCounts);

    // Update Player Stats with Strategy
    const playerContainer = document.getElementById("flipseven-player-stats");
    if (playerContainer) {
      const playerNames = window.flipsevenPlayerNames || [];
      
      const statsHtml = playerNames.map((name, index) => {
          let shortName = name.length > 8 ? name.slice(0, 8) + ".." : name;
          
          if (bustedPlayers[name]) return `<div style="opacity:0.5; margin-bottom:4px;">${shortName}: ❌ Busted</div>`;
          if (frozenPlayers[name]) return `<div style="opacity:0.7; margin-bottom:4px;">${shortName}: ❄️ Frozen</div>`;
          if (stayedPlayers[name]) return `<div style="opacity:0.7; margin-bottom:4px;">${shortName}: 🛑 Stayed</div>`;

          const stats = calculatePlayerStats(index);
          const advice = getStrategicAdvice(stats);

          return `
            <div style="margin-bottom:6px; padding:4px; border-radius:4px; background:rgba(0,0,0,0.05);">
              <div style="display:flex; justify-content:space-between;">
                <b>${shortName}</b>
                <span>Score: ${stats.currentScore}</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
                <span style="font-size:0.85em;">Safe: <b>${stats.survivalRate}%</b></span>
                <span style="background:${advice.color}; color:white; padding:1px 6px; border-radius:4px; font-weight:bold; font-size:11px;">
                  ${advice.action}
                </span>
              </div>
            </div>`;
        }).join("");
      
      playerContainer.innerHTML = statsHtml;
    }

    if (flashKey) flashNumberCell(flashKey);
  };

  const makePanelDraggable = (panel) => {
    let isDragging = false;
    let offsetX = 0, offsetY = 0;
    
    panel.addEventListener("mousedown", (e) => {
      isDragging = true;
      offsetX = e.clientX - panel.getBoundingClientRect().left;
      offsetY = e.clientY - panel.getBoundingClientRect().top;
      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (isDragging) {
        panel.style.left = (e.clientX - offsetX) + "px";
        panel.style.top = (e.clientY - offsetY) + "px";
        panel.style.right = "";
      }
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
      document.body.style.userSelect = "";
    });
  };

  const flashNumberCell = (key) => {
    const cell = document.querySelector(`#flipseven-card-counter-panel .flipseven-anim-num[data-key='${key}']`);
    if (cell) {
      cell.style.transition = "background 0.2s";
      cell.style.background = "#fff7b2";
      setTimeout(() => { cell.style.background = ""; }, 200);
    }
  };

  // --- Data Scraping Logic ---

  const updatePlayerBoardFromDOM = () => {
    const playerNames = window.flipsevenPlayerNames || [];
    const playerCount = playerNames.length;

    for (let i = 0; i < playerCount; i++) {
      // Selector adjusted for stability
      const containerSelector = `#app > div > div > div.f7_scalable.f7_scalable_zoom > div > div.f7_players_container.grid > div:nth-child(${i + 1}) > div:nth-child(3)`;
      const container = document.querySelector(containerSelector);

      if (!container) continue;

      clearPlayerBoard(i);
      
      const cardDivs = container.querySelectorAll(".flippable-front");
      cardDivs.forEach((frontDiv) => {
        const classList = frontDiv.className.split(" ");
        // Check for Standard Cards (sprite-c5, sprite-c10)
        const numberClass = classList.find((cls) => cls.startsWith("sprite-c"));
        if (numberClass) {
          const num = numberClass.replace("sprite-c", "");
          if (/^\d+$/.test(num)) {
             const key = num + "card";
             if (playerBoards[i][key] !== undefined) playerBoards[i][key]++;
          }
        }
        // Check for Special Cards (Second Chance, etc)
        const specialClass = classList.find((cls) => cls.startsWith("sprite-s"));
        if (specialClass) {
            // Mapping sprite classes to keys
            if (specialClass === "sprite-sch") playerBoards[i]["Second chance"]++;
            // Add other specials if needed for scoring logic
        }
      });
    }
  };

  const startPlayerBoardMonitor = () => {
    setInterval(updatePlayerBoardFromDOM, 300);
  };

  const startLogMonitor = () => {
    setInterval(() => {
      const logElement = document.getElementById("log_" + logCounter);
      if (!logElement) return;

      const firstDiv = logElement.querySelector("div");
      if (!firstDiv) { logCounter++; return; }
      
      const logText = firstDiv.innerText.trim();

      // Detect New Round
      if (logText.includes("新的一轮") || /new round/gi.test(logText)) {
        clearRoundCardCounts();
        resetPlayerStates();
        updateCardCounterPanel();
        logCounter++;
        return;
      }

      // Detect Shuffle (Resets Deck)
      if (logText.includes("弃牌堆洗牌") || /shuffle/gi.test(logText)) {
        globalCardCounts = getInitialCardCounts();
        // Subtract cards currently visible in round from the fresh deck
        Object.keys(roundCardCounts).forEach((key) => {
            if (globalCardCounts[key] !== undefined) {
                globalCardCounts[key] = Math.max(0, globalCardCounts[key] - roundCardCounts[key]);
            }
        });
        updateCardCounterPanel();
        logCounter++;
        return;
      }

      // Detect Busts
      if (logText.includes("爆牌") || /bust/gi.test(logText)) {
        const nameSpan = firstDiv.querySelector("span.playername");
        if (nameSpan) {
          bustedPlayers[nameSpan.innerText.trim()] = true;
          updateCardCounterPanel();
        }
      }

      // Detect Stays
      if (/stay/gi.test(logText)) {
        const nameSpan = firstDiv.querySelector("span.playername");
        if (nameSpan) {
          stayedPlayers[nameSpan.innerText.trim()] = true;
          updateCardCounterPanel();
        }
      }

      // Detect Freezes
      if (/freezes/gi.test(logText)) {
        const nameSpan = firstDiv.querySelector("span.playername");
        if (nameSpan) {
          frozenPlayers[nameSpan.innerText.trim()] = true;
          updateCardCounterPanel();
        }
      }

      // Detect Discarding Second Chance
      if ((logText.includes("第二次机会") && logText.includes("弃除")) || /second chance/gi.test(logText)) {
         if (globalCardCounts["Second chance"] > 0) {
             globalCardCounts["Second chance"]--;
             updateCardCounterPanel("Second chance");
         }
      }

      // Detect Card Reveal
      const cardElement = logElement.querySelector(".visible_flippable.f7_token_card.f7_logs");
      if (cardElement) {
         let frontDiv = cardElement.children[0]?.children[0];
         if (frontDiv && frontDiv.className) {
            const classList = frontDiv.className.split(" ");
            const spriteClass = classList.find((cls) => cls.startsWith("sprite-"));
            
            if (spriteClass) {
                let key = null;
                if (/^sprite-c(\d+)$/.test(spriteClass)) {
                    key = spriteClass.match(/^sprite-c(\d+)$/)[1] + "card";
                } else if (/^sprite-s(\d+)$/.test(spriteClass)) {
                    key = "Plus" + spriteClass.match(/^sprite-s(\d+)$/)[1];
                } else if (spriteClass === "sprite-sf") key = "Freeze";
                else if (spriteClass === "sprite-sch") key = "Second chance";
                else if (spriteClass === "sprite-sf3") key = "flip3";
                else if (spriteClass === "sprite-sx2") key = "double";

                if (key && globalCardCounts[key] !== undefined) {
                    if (globalCardCounts[key] > 0) globalCardCounts[key]--;
                    roundCardCounts[key]++;
                    updateCardCounterPanel(key);
                }
            }
         }
      }
      
      logCounter++;
    }, 200);
  };

  // --- Initialization ---

  const initializeGame = () => {
    globalCardCounts = getInitialCardCounts();
    roundCardCounts = Object.fromEntries(Object.keys(globalCardCounts).map((k) => [k, 0]));
    playerBoards = Array.from({ length: 12 }, () => getInitialPlayerBoard());
    resetPlayerStates();

    createCardCounterPanel();
    startPlayerBoardMonitor();
    startLogMonitor();
    
    console.log("[Flip 7 Strategic] Initialized");
  };

  const runLogic = () => {
    setTimeout(() => {
      let playerNames = [];
      // Attempt to find player names in top bar
      for (let i = 1; i <= 12; i++) {
        const selector = `#app > div > div > div.f7_scalable.f7_scalable_zoom > div > div.f7_players_container > div:nth-child(${i}) > div.f7_player_name.flex.justify-between > div:nth-child(1)`;
        const nameElem = document.querySelector(selector);
        if (nameElem?.innerText?.trim()) {
          playerNames.push(nameElem.innerText.trim());
        } else {
          break;
        }
      }
      window.flipsevenPlayerNames = playerNames;
      initializeGame();
    }, 1500);
  };

  // --- SPA Navigation Handling ---

  const onUrlChange = () => {
    if (isInGameUrl(window.location.href)) {
      // Clear previous panel if exists to prevent duplicates
      const existingPanel = document.getElementById("flipseven-card-counter-panel");
      if (existingPanel) existingPanel.remove();
      runLogic();
    }
  };

  if (isInGameUrl(window.location.href)) {
    runLogic();
  }

  const _pushState = history.pushState;
  const _replaceState = history.replaceState;
  
  history.pushState = function (...args) {
    _pushState.apply(this, args);
    setTimeout(onUrlChange, 0);
  };
  
  history.replaceState = function (...args) {
    _replaceState.apply(this, args);
    setTimeout(onUrlChange, 0);
  };
  
  window.addEventListener("popstate", onUrlChange);

})();