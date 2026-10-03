// "true" -> true, "false" -> false, anything else -> undefined (no filter).
export const parseBooleanQuery = (value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
};
