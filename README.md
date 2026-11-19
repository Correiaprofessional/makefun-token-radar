# Correiaprofessional/makefun-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Correiaprofessional/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Correiaprofessional/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token-launch radar for DeFi protocols that record no token yet. It reads a sealed
DefiLlama snapshot, scores every protocol's implied launch value from that snapshot's
own figures -- TVL, seven-day TVL change, age since first listed, category and chain
breadth -- ranks the top 200, and ships a static dashboard with a searchable board, a
category filter, a per-protocol detail view and research steps that promise nothing.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22.18 or later, standard library only. The run writes `board.json`, `data.js`,
`dashboard/`, `screenshots/` and `dossier.json` into the output directory.

## How the ranking works

```
implied = max(1, round(tvl x base_multiple x growth x maturity x category x chains))
```

Every constant is named in `MODEL` in `lib/model.ts`, documented there, and shown in
the dashboard's methodology block. No protocol is special-cased by name: one function
scores every row. The board is a model's ranking of how much a launch could be worth if
a protocol's record stayed as it is -- not investment advice, and not a prediction that
any token will be issued.

## Research steps

Each row carries 3 to 12 steps. They start with verifying an official, currently
active programme and its published terms, never promise a reward, price or allocation,
and mark any capital action as optional and risk-bearing.

---

<sub>Entered on [make.fun](https://make.fun/?ref=nng53qej&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
