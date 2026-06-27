#!/bin/sh

set -e

BRANCH_NAME="${1:-$(git branch --show-current)}"

if [ "$BRANCH_NAME" = "main" ]; then
  exit 0
fi

if echo "$BRANCH_NAME" | grep -Eq '^(feat|fix|chore|docs|test|refactor|ci|build|style|perf|hotfix)/[0-9]+-[a-z0-9-]+$'; then
  echo "Branch name is valid: $BRANCH_NAME"
  exit 0
fi

echo "Invalid branch name: $BRANCH_NAME"
echo ""
echo "Expected format:"
echo "type/issue-number-short-description"
echo ""
echo "Example:"
echo "chore/3-github-templates-conventions"
exit 1
