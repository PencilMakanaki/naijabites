export function ok(res, data, meta, status = 200) {
  const body = { data };
  if (meta !== undefined) body.meta = meta;
  res.status(status).json(body);
}
