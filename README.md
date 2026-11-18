# btc-plunge-rebound-bot

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/BurningHead69/btc-plunge-rebound-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/BurningHead69/btc-plunge-rebound-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

Plunge-rebound BTC trading bot for make.fun's "Race a BTC trading bot live for 24 hours" bounty. It trades Coinbase Wrapped BTC (CBBTC) against USDC, minute by minute, in a replay of its on-chain prices. It starts with 1,000 USDC of paper money, sits in cash, waits for a sharp plunge (-1.3% in 30 minutes, -1.5% in 60, or -2% in 120), buys it in full size, and sells on a +1.2% take-profit, a -2% stop-loss, or after 480 bars. A smaller late-window fallback trades smaller dips after bar 900 so a quiet window still trades. Long only, at most one open position, deterministic: the same bars always give the same orders.

## Run it

```sh
node main.ts
```

---

Entered on [make.fun](https://make.fun/?ref=&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards
