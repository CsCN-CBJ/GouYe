export function successResponse(data: unknown, message = 'ok', statusCode = 200) {
  return {
    statusCode,
    body: { code: 0, data, message },
  };
}

export function errorResponse(message: string, statusCode = 400) {
  return {
    statusCode,
    body: { code: 1, message },
  };
}
