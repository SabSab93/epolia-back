#!/bin/sh

set -e

BRANCH_NAME="$(git branch --show-current)"

ISSUE_NUMBER="$(echo "$BRANCH_NAME" | sed -nE 's#^(feat|fix|chore|docs|test|refactor|ci|build|style|perf|hotfix)/([0-9]+)-[a-z0-9-]+$#\2#p')"
BRANCH_TYPE="$(echo "$BRANCH_NAME" | cut -d "/" -f 1)"
BRANCH_DESCRIPTION="$(echo "$BRANCH_NAME" | sed -nE 's#^[^/]+/[0-9]+-(.*)$#\1#p' | tr '-' ' ')"

if [ -z "$ISSUE_NUMBER" ]; then
  echo "Invalid branch name: $BRANCH_NAME"
  echo ""
  echo "Expected format:"
  echo "type/issue-number-short-description"
  echo ""
  echo "Example:"
  echo "chore/2-github-templates-conventions"
  exit 1
fi

DEFAULT_TITLE="$BRANCH_TYPE: $BRANCH_DESCRIPTION"

echo "Detected issue: #$ISSUE_NUMBER"
echo "Default PR title: $DEFAULT_TITLE"
echo ""
printf "PR title [%s]: " "$DEFAULT_TITLE"
read PR_TITLE

if [ -z "$PR_TITLE" ]; then
  PR_TITLE="$DEFAULT_TITLE"
fi

TMP_BODY_FILE="$(mktemp)"

cat > "$TMP_BODY_FILE" <<EOF
# Pull Request

## Objectif

À compléter.

---

## Issue liée

Closes #$ISSUE_NUMBER

---

## Changements réalisés

- [ ] À compléter

---

## Hors périmètre

- À compléter

---

## Tests effectués

- [ ] npm run lint
- [ ] npm run test
- [ ] npm run build
- [ ] Vérification manuelle si nécessaire

---

## Checklist

- [ ] La branche respecte la convention de nommage.
- [ ] Le titre de la PR respecte Conventional Commits.
- [ ] Le code est limité au périmètre de l'issue.
- [ ] Aucun secret n'est ajouté.
- [ ] La documentation est mise à jour si nécessaire.
- [ ] Les tests passent.
EOF

gh pr create \
  --base main \
  --head "$BRANCH_NAME" \
  --title "$PR_TITLE" \
  --body-file "$TMP_BODY_FILE"

rm "$TMP_BODY_FILE"