/**
 * Envuelve un controlador async y pasa cualquier error
 * al middleware central de manejo de errores.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { asyncHandler };