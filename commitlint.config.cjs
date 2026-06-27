module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'chore',
        'docs',
        'test',
        'refactor',
        'ci',
        'build',
        'style',
        'perf',
        'hotfix',
      ],
    ],
    'subject-empty': [2, 'never'],
    'subject-case': [0],
  },
};
