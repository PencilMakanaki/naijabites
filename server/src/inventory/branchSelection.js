import { straightLineDistanceMeters, validCoordinates } from '../delivery/geo.js';

function enabledFlag(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 1 || value === '1';
}

function inventoryFor(branch) {
  if (branch.inventory instanceof Map) return branch.inventory;
  if (branch.inventory && typeof branch.inventory === 'object' && !Array.isArray(branch.inventory)) {
    return new Map(Object.entries(branch.inventory));
  }
  return new Map();
}

function availableFor(inventory, productId) {
  const raw = inventory.get(String(productId)) ?? inventory.get(productId);
  if (raw === undefined || raw === null) return 0;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

// A vendor order must be fulfilled entirely by one active branch; items are never split.
// Missing/invalid customer or branch coordinates are treated as unknown distance and
// fall back to a stable branch-id ordering rather than making a branch ineligible.
export function selectFulfilmentBranch({ branches, items, customerCoordinates } = {}) {
  if (!Array.isArray(branches) || !Array.isArray(items)) return null;

  const customer = validCoordinates(customerCoordinates?.latitude, customerCoordinates?.longitude);
  const eligible = branches
    .filter((branch) => enabledFlag(branch.isActive ?? branch.is_active))
    .filter((branch) => enabledFlag(branch.isEnabled ?? branch.is_enabled, true))
    .filter((branch) => {
      const inventory = inventoryFor(branch);
      return items.every((item) => {
        const productId = item.productId ?? item.product_id;
        const quantity = Number(item.quantity);
        return productId !== undefined && Number.isSafeInteger(quantity) && quantity > 0 &&
          availableFor(inventory, productId) >= quantity;
      });
    })
    .map((branch) => {
      const coordinates = validCoordinates(branch.latitude, branch.longitude);
      return {
        branch,
        distance: customer && coordinates
          ? straightLineDistanceMeters(customer, coordinates)
          : Infinity,
      };
    });

  eligible.sort((a, b) => a.distance - b.distance || Number(a.branch.id) - Number(b.branch.id));
  return eligible[0]?.branch ?? null;
}
