#!/usr/bin/env bash
# Render every ```mermaid block in DESIGN.md that is preceded by <!-- render: NAME --> to design/NAME.png
# Uses the installed Google Chrome instead of downloading one. Run from hw1-bitbaan/.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
printf '{"executablePath":"%s","args":["--no-sandbox"]}' "$CHROME" > "$tmp/pp.json"
echo '{"theme":"default","themeVariables":{"fontFamily":"Sukhumvit Set, Tahoma, sans-serif"}}' > "$tmp/cfg.json"
python3 - "$tmp" <<'PY'
import re, sys
s = open('DESIGN.md').read()
for name, body in re.findall(r'<!-- render: ([\w-]+) -->\n```mermaid\n(.*?)```', s, re.S):
    open(f'{sys.argv[1]}/{name}.mmd', 'w').write(body)
PY
mkdir -p design
ok=0; total=0
for f in "$tmp"/*.mmd; do
  n=$(basename "$f" .mmd); total=$((total+1))
  if PUPPETEER_SKIP_DOWNLOAD=1 npx -y @mermaid-js/mermaid-cli@11.4.2 -p "$tmp/pp.json" -c "$tmp/cfg.json" -i "$f" -o "design/$n.png" -s 2 -b white >/dev/null 2>&1; then
    ok=$((ok+1)); echo "OK   $n"
  else
    echo "FAIL $n"
  fi
done
echo "$ok/$total rendered"
[ "$ok" -eq "$total" ]
