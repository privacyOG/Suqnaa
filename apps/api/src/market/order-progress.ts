import type { TransactionStatus } from '../db/types.js';

export type OrderProgressStage =
  | 'payment_pending'
  | 'fulfilment'
  | 'complete'
  | 'disputed'
  | 'refunded'
  | 'cancelled';

export type OrderProgressStepKey = 'created' | 'paid' | 'fulfilment' | 'complete';
export type OrderProgressStepState = 'complete' | 'current' | 'upcoming' | 'exception';

export interface OrderProgressStep {
  key: OrderProgressStepKey;
  state: OrderProgressStepState;
}

export interface OrderProgress {
  stage: OrderProgressStage;
  percent: number;
  terminal: boolean;
  steps: OrderProgressStep[];
}

function steps(
  created: OrderProgressStepState,
  paid: OrderProgressStepState,
  fulfilment: OrderProgressStepState,
  complete: OrderProgressStepState
): OrderProgressStep[] {
  return [
    { key: 'created', state: created },
    { key: 'paid', state: paid },
    { key: 'fulfilment', state: fulfilment },
    { key: 'complete', state: complete }
  ];
}

export function getOrderProgress(status: TransactionStatus): OrderProgress {
  switch (status) {
    case 'pending':
      return {
        stage: 'payment_pending',
        percent: 25,
        terminal: false,
        steps: steps('complete', 'current', 'upcoming', 'upcoming')
      };
    case 'paid':
      return {
        stage: 'fulfilment',
        percent: 60,
        terminal: false,
        steps: steps('complete', 'complete', 'current', 'upcoming')
      };
    case 'released':
      return {
        stage: 'complete',
        percent: 100,
        terminal: true,
        steps: steps('complete', 'complete', 'complete', 'complete')
      };
    case 'disputed':
      return {
        stage: 'disputed',
        percent: 60,
        terminal: false,
        steps: steps('complete', 'complete', 'exception', 'upcoming')
      };
    case 'refunded':
      return {
        stage: 'refunded',
        percent: 60,
        terminal: true,
        steps: steps('complete', 'complete', 'exception', 'upcoming')
      };
    case 'cancelled':
      return {
        stage: 'cancelled',
        percent: 25,
        terminal: true,
        steps: steps('complete', 'exception', 'upcoming', 'upcoming')
      };
  }
}
