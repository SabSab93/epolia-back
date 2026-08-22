#!/bin/sh

set -e

BRANCH_NAME="$(git branch --show-current)"

sh scripts/validate-branch-name.sh "$BRANCH_NAME"

ISSUE_NUMBER="$(echo "$BRANCH_NAME" | sed -nE 's#^[^0-9]*([0-9]+).*#\1#p')"
BRANCH_SLUG="$(echo "$BRANCH_NAME" | sed -E 's#^[^/]+/##; s#^[0-9]+-?##; s#-# #g')"

if [ -z "$BRANCH_SLUG" ] && [ -n "$ISSUE_NUMBER" ]; then
  BRANCH_SLUG="issue $ISSUE_NUMBER"
fi

if [ -z "$BRANCH_SLUG" ] || [ "$BRANCH_SLUG" = "$BRANCH_NAME" ]; then
  BRANCH_SLUG="update project"
fi

FALLBACK_TITLE="$BRANCH_SLUG"
ISSUE_TITLE=""

if [ -n "$ISSUE_NUMBER" ]; then
  ISSUE_TITLE="$(gh issue view "$ISSUE_NUMBER" --json title --jq '.title' 2>/dev/null || true)"
fi

if [ -n "$ISSUE_TITLE" ]; then
  DEFAULT_TITLE="$ISSUE_TITLE"
else
  DEFAULT_TITLE="$FALLBACK_TITLE"
fi

if [ -n "$ISSUE_NUMBER" ]; then
  echo "Detected issue: #$ISSUE_NUMBER"
else
  echo "No issue number detected in branch name"
fi

if [ -n "$ISSUE_TITLE" ]; then
  echo "Issue title: $ISSUE_TITLE"
fi

echo "Default PR title: $DEFAULT_TITLE"
echo ""
printf "PR title [%s]: " "$DEFAULT_TITLE"
read PR_TITLE

if [ -z "$PR_TITLE" ]; then
  PR_TITLE="$DEFAULT_TITLE"
fi

if [ -n "$ISSUE_NUMBER" ]; then
  ISSUE_LINE="Closes #$ISSUE_NUMBER"
else
  ISSUE_LINE="À compléter si une issue existe."
fi

TMP_BODY_FILE="$(mktemp)"

cat > "$TMP_BODY_FILE" <<EOF
# Pull Request

## Objectif

À compléter.

---

## Issue liée

$ISSUE_LINE

---

## Changements réalisés

- À compléter

---

## Hors périmètre

- À compléter

---

## Tests effectués

- [ ] npm run lint
- [ ] npm run test
- [ ] npm run build

---

## Checklist

- [ ] Le code est limité au périmètre de l'issue.
- [ ] Aucun secret n'est ajouté.
EOF

gh pr create \
  --base main \
  --head "$BRANCH_NAME" \
  --title "$PR_TITLE" \
  --body-file "$TMP_BODY_FILE"

rm "$TMP_BODY_FILE"
