// Reads ?page and ?limit safely. limit is capped at 100.
export const parsePagination = (query = {}) => ({
  page: Math.max(Number.parseInt(query.page, 10) || 1, 1),
  limit: Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100),
});

export const paginate = async (model, filter, { page, limit }, { sort = { createdAt: -1 }, populate } = {}) => {
  let query = model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit);
  if (populate) query = query.populate(populate);
  const [items, total] = await Promise.all([query, model.countDocuments(filter)]);
  return { items, total, page, pages: Math.ceil(total / limit) };
};
