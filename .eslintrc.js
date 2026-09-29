module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    sourceType: 'module',
  },
  plugins: ['deprecate', '@typescript-eslint'],
  rules: {
    'linebreak-style': ['error', 'unix'],
    semi: ['error', 'always'],
    'no-var': ['off'], //["error"],
    'brace-style': ['off'], //["error"],
    'array-bracket-spacing': ['off'], // prettier handles this
    'block-spacing': ['off'], //["error", "always"],
    'no-spaced-func': ['error'],
    'no-whitespace-before-property': ['error'],
    'space-before-blocks': ['off'], //["error", "always"],
    'keyword-spacing': ['off'], //["error"],
    '@typescript-eslint/ban-types': ['off'],
    '@typescript-eslint/explicit-member-accessibility': [
      'error',
      { accessibility: 'no-public' },
    ],
    '@typescript-eslint/explicit-module-boundary-types': ['off'],
    '@typescript-eslint/indent': ['off'],
    '@typescript-eslint/explicit-function-return-type': ['off'],
    '@typescript-eslint/no-explicit-any': ['off'],
    '@typescript-eslint/no-use-before-define': ['off'],
    '@typescript-eslint/no-non-null-assertion': ['off'],
    '@typescript-eslint/array-type': ['off'],
    'no-unused-vars': ['off'],

    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
      },
    ],

    // TODO maybe remove these
    '@typescript-eslint/no-inferrable-types': ['off'],
    '@typescript-eslint/no-this-alias': ['off'],
  },

  overrides: [
    {
      files: ['src/**'],
      excludedFiles: ['*.test.*', '*.d.ts'],
      rules: {
        'deprecate/import': ['error', 'lodash', 'crypto'],
      },
    },
    {
      // SDK code only (build tooling under src/build legitimately uses .write()).
      files: ['src/**'],
      excludedFiles: ['*.test.*', '*.d.ts', 'src/build/**'],
      rules: {
        // Google Calendar enforces `require-trusted-types-for 'script'`, so HTML
        // strings cannot be assigned to DOM sinks (docs/calendar-reverse-engineering.md
        // §1.18). Build DOM with createElement/textContent/setAttribute, or go
        // through one Trusted Types policy helper (which may disable this rule).
        'no-restricted-syntax': [
          'error',
          {
            selector:
              "AssignmentExpression[left.type='MemberExpression'][left.property.name=/^(innerHTML|outerHTML)$/]",
            message:
              'Trusted Types: do not assign HTML strings; build DOM with createElement/textContent or use the Trusted Types helper.',
          },
          {
            selector:
              'CallExpression[callee.property.name=/^(insertAdjacentHTML|createContextualFragment|setHTMLUnsafe|write|writeln)$/]',
            message:
              'Trusted Types: HTML-string sinks are blocked on Google Calendar; build DOM with createElement/textContent or use the Trusted Types helper.',
          },
        ],
      },
    },
    {
      files: ['__tests__/**', '**/*.test.*', 'test/**'],
      env: {
        jest: true,
        node: true,
      },
      rules: {
        '@typescript-eslint/no-var-requires': ['off'],
      },
    },
    {
      files: ['*.js'],
      rules: {
        '@typescript-eslint/no-var-requires': ['off'],
      },
    },
    {
      files: ['test/chrome/**'],
      rules: {
        'no-console': ['off'],
      },
      globals: {
        page: 'readonly',
        browser: 'readonly',
        context: 'readonly',
      },
    },
    {
      files: ['src/platform-implementation-js/**'],
      globals: { Observable: 'readonly' },
    },
  ],
  settings: {
    react: {
      version: '16.8',
    },
  },
};
