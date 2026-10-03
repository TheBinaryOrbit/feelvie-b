import * as walletService from '../services/wallet.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';

export const getWallet = asyncHandler(async (req, res) => {
  const summary = await walletService.getSummary(req.user._id);
  return ApiResponse.ok(res, summary);
});

export const listTransactions = asyncHandler(async (req, res) => {
  const result = await walletService.listTransactions(
    req.user._id,
    { type: req.query.type },
    parsePagination(req.query)
  );
  return ApiResponse.ok(res, result);
});
