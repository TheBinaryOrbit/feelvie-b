export class ApiResponse {
  constructor(statusCode, data = null, message = 'Success') {
    this.success = statusCode < 400;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
  }

  static send(res, statusCode, data, message) {
    return res.status(statusCode).json(new ApiResponse(statusCode, data, message));
  }

  static ok(res, data, message = 'Success') {
    return ApiResponse.send(res, 200, data, message);
  }

  static created(res, data, message = 'Created') {
    return ApiResponse.send(res, 201, data, message);
  }
}
