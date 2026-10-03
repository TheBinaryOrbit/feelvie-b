export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 80;

// "Men's T-Shirts & Polos" -> "mens-t-shirts-polos". "Café" -> "cafe".
export const slugify = (text) =>
  String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');

const withSuffix = (base, suffix) =>
  `${base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`;

/**
 * Builds a slug from a title that no document in `model` uses yet:
 * "red-dress", then "red-dress-2", "red-dress-3" ... and finally a random suffix.
 * Returns '' when the title has no usable characters.
 */
export const uniqueSlug = async (model, title, { maxTries = 20 } = {}) => {
  const base = slugify(title);
  if (!base) return '';
  for (let n = 1; n <= maxTries; n += 1) {
    const candidate = withSuffix(base, n === 1 ? '' : `-${n}`);
    if (!(await model.exists({ slug: candidate }))) return candidate;
  }
  return withSuffix(base, `-${Math.random().toString(36).slice(2, 8)}`);
};
