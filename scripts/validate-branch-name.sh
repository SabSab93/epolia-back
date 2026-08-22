#!/bin/sh

BRANCH_NAME="${1:-$(git branch --show-current)}"

if [ "$BRANCH_NAME" = "main" ]; then
  exit 0
fi

if echo "$BRANCH_NAME" | grep -Eq '^(feat|fix|chore|docs|test|refactor|ci|build|style|perf|hotfix)/[0-9]+-[a-z0-9-]+$'; then
  echo "Recommended branch name: $BRANCH_NAME"
  exit 0
fi

echo "Branch name does not follow the recommended format: $BRANCH_NAME"
echo ""
echo "Recommended format:"
echo "type/issue-number-short-english-description"
echo ""
echo "Example:"
echo "chore/3-github-templates-conventions"
echo ""
echo "This check is advisory and does not block pushes or pull requests."
exit 0
