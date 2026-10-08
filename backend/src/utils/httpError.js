/**
 * Error HTTP con código de estado.
 * Se lanza en los controladores y lo transforma el manejador central.
 */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { HttpError };