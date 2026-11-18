// Plunge-rebound BTC bot for make.fun "Race a BTC trading bot live for 24 hours"
// (btc-race-24h-20261118-1444), protocol agent-fun/bars-replay/v1.
//
// Idea, from the dev window (1,440 one-minute bars of CBBTC/USDC, 17-18 Nov 2026):
// the window drifts down -2.8% overall, so buy-and-hold and every trend baseline
// lose money, and frequent trading loses ~26 bps per round trip to fees, slippage
// and price impact. The only repeatable edge in the data is the sharp plunge:
// a -1.3% fall in 30 minutes is a ~4-sigma move that tends to rebound about
// +1% over the next hours. So this bot sits in cash, waits for a plunge, buys
// it in full size, and sells on a take-profit, a stop, or a time limit.
// It makes very few trades on purpose: each trade must clear the round-trip
// cost, and a trade that never happens is better than a whipsawed one.
//
// How the bot speaks the protocol: the harness sends one hello line, then one
// batch per bar (each batch carries the bar that just closed, the fills of the
// orders sent on the previous batch, and the account), and this bot answers
// every batch with exactly one reply echoing its seq with its orders.
// Orders decided on a batch fill at the open of the next bar. All decisions
// use only past closes, integer (bigint) comparisons, and the seed from hello
// (no randomness is used at all), so two runs on the same bars give the same
// action log. No wall clock, no environment, no network is read.
//
// Entry (flat only, at most 1 open position, long only, no leverage):
//   - primary plunge: close <= close 30 bars ago * (1 - 1.3%), or
//     close <= close 60 bars ago * (1 - 1.5%), or
//     close <= close 120 bars ago * (1 - 2.0%)
//     -> buy with all cash, take-profit +1.5%, stop-loss -2.0%, max hold 480 bars.
//   - late fallback (seq 900..1200 only, so a race window with no big plunge
//     still trades): close <= close 30 bars ago * (1 - 0.8%)
//     -> buy with all cash, take-profit +0.7%, stop-loss -1.2%, max hold 240 bars.
//   - no new buys after seq 1320: a position opened in the last two hours
//     would be flattened at the last close before any take-profit can land.
// Exit (holding): sell the whole position when the latest close reaches the
// take-profit or the stop-loss measured from the trigger bar's close, or when
// the max hold expires. A sell the market rejects is re-sent on the next bar
// while its reason still holds. max_slippage_bps is 300 on every order.

import { runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const MAX_SLIPPAGE_BPS = 300;
const NO_BUY_AFTER_SEQ = 1320;
const LATE_FROM_SEQ = 900;
const LATE_TO_SEQ = 1200;

// Closes by batch seq (null when the symbol had no bar that minute).
const closes: (bigint | null)[] = [];

// The entry currently being held (or just decided): trigger bar's close and
// the exit plan chosen for it. Cleared when the position is gone.
let entry: { triggerClose: bigint; entrySeq: number; tpBps: number; slBps: number; holdBars: number } | null = null;

function closeAt(seq: number): bigint | null {
  if (seq < 0 || seq >= closes.length) return null;
  return closes[seq];
}

// True when the latest close fell at least `bps` below the close `look` bars back.
function dropped(state: BarsState, look: number, bps: number): boolean {
  const now = closeAt(state.seq);
  const then = closeAt(state.seq - look);
  if (now === null || then === null) return false;
  // now / then <= (10000 - bps) / 10000, cross-multiplied in integers.
  return now * 10000n <= then * BigInt(10000 - bps);
}

await runBars({
  onBatch(state, batch) {
    // Record this batch's bar for the symbol, keeping one slot per seq so
    // lookbacks line up even across minutes with no bar.
    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) closes[state.seq] = BigInt(bar.c);
    }
    if (closes[state.seq] === undefined) closes[state.seq] = null;
    if (state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    const close = state.close(SYMBOL);
    if (close === null) return [];

    // --- Holding: exit on take-profit, stop-loss, or time limit. ---
    if (held !== undefined) {
      if (entry === null) {
        // Safety net only (a sell rejected after the entry was cleared):
        // treat the current close as the reference and exit on the same plan.
        entry = { triggerClose: close, entrySeq: state.seq, tpBps: 150, slBps: 200, holdBars: 480 };
      }
      const up = entry.triggerClose * BigInt(10000 + entry.tpBps);
      const down = entry.triggerClose * BigInt(10000 - entry.slBps);
      const takeProfit = close * 10000n >= up;
      const stopLoss = close * 10000n <= down;
      const timedOut = state.seq - entry.entrySeq >= entry.holdBars;
      if (takeProfit || stopLoss || timedOut) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // --- Flat: any entry state belongs to a position that is gone. ---
    entry = null;
    if (state.seq > NO_BUY_AFTER_SEQ) return [];

    let plan: { tpBps: number; slBps: number; holdBars: number } | null = null;
    if (dropped(state, 30, 130) || dropped(state, 60, 150) || dropped(state, 120, 200)) {
      plan = { tpBps: 150, slBps: 200, holdBars: 480 };
    } else if (state.seq >= LATE_FROM_SEQ && state.seq <= LATE_TO_SEQ && dropped(state, 30, 80)) {
      plan = { tpBps: 70, slBps: 120, holdBars: 240 };
    }
    if (plan === null) return [];

    const cash = state.cash;
    const room = state.weightRoom(SYMBOL);
    const spend = cash < room ? cash : room;
    if (spend < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    entry = { triggerClose: close, entrySeq: state.seq, ...plan };
    const orders: OrderInput[] = [
      { side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIPPAGE_BPS },
    ];
    return orders;
  },
});
