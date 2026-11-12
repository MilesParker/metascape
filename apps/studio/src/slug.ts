// SPDX-License-Identifier: EPL-2.0

/** The address-hash form of a model name: lower case, dashes between words, none at the ends. */
export const slug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
