export const ORDER_STATUSES = [
  'new', 'under_review', 'approved', 'preparing', 'ready_for_delivery', 'waiting_for_driver',
  'out_for_delivery', 'arrived', 'delivered', 'final_review', 'completed', 'cancelled',
  'delivery_failed', 'archived', 'rejected', 'pending', 'confirmed', 'processing', 'shipped', 'returned', 'refunded',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  new: ['under_review', 'cancelled'],
  under_review: ['approved', 'cancelled', 'rejected'],
  approved: ['preparing', 'cancelled'],
  preparing: ['ready_for_delivery', 'cancelled'],
  ready_for_delivery: ['waiting_for_driver'],
  waiting_for_driver: ['out_for_delivery'],
  out_for_delivery: ['arrived', 'delivery_failed', 'delivered'],
  arrived: ['delivered', 'delivery_failed'],
  delivered: ['final_review'],
  final_review: ['completed', 'delivery_failed'],
  completed: ['archived'],
  cancelled: [],
  delivery_failed: [],
  archived: [],
  rejected: [],
  pending: ['under_review', 'confirmed', 'cancelled'],
  confirmed: ['preparing', 'processing', 'cancelled'],
  processing: ['ready_for_delivery', 'shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered'],
  returned: [],
  refunded: [],
};

export function canTransitionOrderStatus(current: string, next: string): boolean {
  return ORDER_STATUSES.includes(current as OrderStatus) &&
    TRANSITIONS[current as OrderStatus].includes(next as OrderStatus);
}

export function allowedOrderTransitions(current: string): OrderStatus[] {
  if (!ORDER_STATUSES.includes(current as OrderStatus)) return [];
  return [...TRANSITIONS[current as OrderStatus]];
}
