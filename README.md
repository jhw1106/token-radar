# Token Radar — pre-token protocols ranked by implied value

A radar for protocols that record no token yet. It reads the sealed DefiLlama
snapshot, ranks the pre-token protocols by an implied value, and gives every
row a concrete farm plan: what to do, what it costs, and how long it takes.

## The model (median-1)

The implied value is calibrated on the snapshot itself. For each category,
the model takes the median market-cap-to-TVL multiple of the protocols in
that category whose token already trades — the market's own pricing of that
kind of protocol — and prices a pre-token protocol of the same category at
that multiple of its own TVL. A category with fewer than three live
protocols falls back to the global median. The result is adjusted by the
protocol's own seven-day growth (clamped), by how long it has run with no
token, and by how many chains it spans. No protocol name is special-cased:
one function scores every row.

```
implied = round( tvl x category_multiple x growth x maturity x chains )
```

The dashboard states the formula, the constants, and the median multiple of
every category. The board covers all 40 watchlist protocols and adds the
160 biggest pre-token protocols below the watchlist floor, by TVL.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

Node 22 or later, standard library only. The program is deterministic: two
runs write identical bytes.

## Entry

Built for make.fun's token-radar-01 bounty:
https://make.fun/bounty/token-radar-01

Referral: [https://make.fun/r/51x3fk71](https://make.fun/r/51x3fk71) (code `51x3fk71`)
