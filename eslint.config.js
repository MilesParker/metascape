// SPDX-License-Identifier: EPL-2.0
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },
);
