import * as walletService from '../../services/wallet.service.js';
import * as userService from '../../services/user.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination } from '../../utils/pagination.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const getUserWallet = asyncHandler(async (req, res) => {
  await userService.getById(req.params.id);
  const summary = await walletService.getSummary(req.params.id);
  return ApiResponse.ok(res, summary);
});

export const listUserTransactions = asyncHandler(async (req, res) => {
  await userService.getById(req.params.id);
  const result = await walletService.listTransactions(
    req.params.id,
    { type: req.query.type },
    parsePagination(req.query)
  );
  return ApiResponse.ok(res, result);
});

// Manual adjustment for support and testing. Every adjustment records the admin and the reason.
export const adjustCredits = asyncHandler(async (req, res) => {
  const userId = req.params.id;
  await userService.getById(userId);
  const { action, credits, expiresInDays, reason } = req.body;
  const description = `Admin adjustment: ${reason}`;

  const transaction =
    action === 'grant'
      ? await walletService.grantCredits({
          userId,
          credits,
          source: 'admin',
          expiresOn: new Date(Date.now() + expiresInDays * DAY_MS),
          description,
          admin: req.admin._id,
        })
      : await walletService.debitCredits({
          userId,
          credits,
          source: 'admin',
          description,
          admin: req.admin._id,
        });

  const summary = await walletService.getSummary(userId);
  return ApiResponse.created(res, { transaction, balance: summary.balance }, 'Credits adjusted');
});
