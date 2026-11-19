import { badRequest, conflict } from '../http/errors.js';

export const MAX_BRANCH_STOCK = 4_294_967_295;
const MOVEMENT_DIRECTIONS = new Map([
  ['restock', 'in'],
  ['return', 'in'],
  ['damage', 'out'],
  ['adjustment', 'either'],
]);

/** Validate a vendor-entered inventory movement before touching the database. */
export function validateInventoryMovement({ quantityBefore, quantityDelta, movementType }) {
  if (!Number.isSafeInteger(quantityDelta) || quantityDelta === 0 || Math.abs(quantityDelta) > 1_000_000) {
    throw badRequest('quantityDelta must be a non-zero whole number within the supported range.');
  }

  const direction = MOVEMENT_DIRECTIONS.get(movementType);
  if (!direction) throw badRequest('Unsupported inventory movement type.');
  if ((direction === 'in' && quantityDelta < 0) || (direction === 'out' && quantityDelta > 0)) {
    throw badRequest(`${movementType} movements must use a ${direction === 'in' ? 'positive' : 'negative'} quantityDelta.`);
  }

  const before = Number(quantityBefore);
  if (!Number.isSafeInteger(before) || before < 0 || before > MAX_BRANCH_STOCK) {
    throw conflict('The current branch stock balance is invalid.');
  }

  const after = before + quantityDelta;
  if (after < 0) throw conflict('This movement would make branch stock negative.', 'insufficient_branch_stock');
  if (after > MAX_BRANCH_STOCK) throw conflict('This movement exceeds the maximum supported branch stock balance.', 'branch_stock_limit_exceeded');
  return { before, after };
}
