Pairwise rating votes from the local rating tool are written here while the
Vite dev server is running.

- `pairwise-votes.jsonl`: append-only line-delimited vote records
- `pairwise-votes.json`: current readable snapshot with all votes

Use the **Auto S-curve vs Auto contrast** comparison mode in the rating tool to
validate whether contrast-only auto tone mapping performs better than S-curve
auto tone mapping across the sample set.

Use the **Auto white guard vs unguarded Auto** comparison mode to validate
whether preserving p99/background-white pixels during image range fitting
reduces unwanted dithering on white areas.
