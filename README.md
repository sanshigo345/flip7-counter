# BGA Flip 7 Strategic Counter

A sophisticated Tampermonkey userscript for **Flip 7** on Board Game Arena. This tool tracks card usage, calculates real-time survival probabilities, and provides "Hit" or "Stop" recommendations based on Expected Value (EV) logic.

## Features

* **Real-Time Card Counting:** Automatically tracks every card played, discarded, or held by opponents.
* **Deck Analysis:** Displays the exact count and percentage of remaining cards in the deck.
* **Strategic Advice Engine:**
  * Calculates a personalized **Survival Rate** for the current hand.
  * Provides **HIT** or **STOP** recommendations based on a configurable risk tolerance table.
  * **Context Aware:** Adjusts strategy for "Second Chance" cards and "Flip 7" bonus chases.
* **Opponent Monitoring:** Shows the status and survival rates of all players at the table to identify who is playing risky.
* **Visual Indicators:** Color-coded stats (Green = Safe, Red = Dangerous).

## Installation

Since this is a private script, you must install it manually in Tampermonkey.

1. **Install Tampermonkey:** Ensure you have the [Tampermonkey extension](https://www.tampermonkey.net/) installed in your browser.
2. **Copy the Code:** Open `script.user.js` in this repository and copy the entire content.
3. **Create New Script:**
   * Open the Tampermonkey Dashboard.
   * Click the **+** (Plus) tab to create a new script.
   * Paste the code into the editor.
   * Save (`Ctrl+S` or `Cmd+S`).
4. **Play:** Navigate to a Flip 7 table on Board Game Arena. The overlay will appear automatically.

## Configuration

You can fine-tune the decision-making logic by editing the `RISK_TOLERANCE` object at the top of the script. This defines the minimum survival percentage required to "Hit" at any given score.

**Example:**
```javascript
const RISK_TOLERANCE = {
    // Score : Minimum Survival % required to Hit
    15: 55, // Aggressive early game
    25: 66, // Moderate mid game
    35: 76, // Conservative late game
    // ...
};
