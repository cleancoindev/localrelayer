import {
  takeEvery,
  select,
  put,
  call,
  cps,
} from 'redux-saga/effects';
import createActionCreators from 'redux-resource-action-creators';
import type { Saga } from 'redux-saga';
import { ZeroEx } from '0x.js';
import moment from 'moment';
import {
  reset,
  getFormValues,
} from 'redux-form';
import * as types from '../actions/types';
import {
  getAddress,
  getCurrentToken,
  getCurrentPair,
  getUiState,
  getBalance,
} from '../selectors';
import {
  sendNotification,
  saveResourceRequest,
  sendMessage,
  setUiState,
} from '../actions';
import {
  NODE_ADDRESS,
  EXCHANGE_FEE,
  TRANSACTION_FEE,
} from '../utils/web3';
import * as resourcesActions from '../actions/resources';
import {
  loadTokensBalance,
} from './profile';
import config from '../config';
import {
  customApiRequest,
} from '../api';
import {
  trackMixpanel,
} from '../utils/mixpanel';
import BigNumber from '../utils/BigNumber';

export function* createOrder(): Saga<*> {
  const { zeroEx } = window;
  const { NULL_ADDRESS } = ZeroEx;
  const EXCHANGE_ADDRESS = yield zeroEx.exchange.getContractAddress();

  const { amount, price } = yield select(getFormValues('BuySellForm'));
  const type = yield select(getUiState('activeTab'));
  const exp = moment().add('1', 'year');

  const balance = yield select(getBalance);
  const address = yield select(getAddress);
  const currentToken = yield select(getCurrentToken);
  const currentPair = yield select(getCurrentPair);
  const total = BigNumber(price).times(amount).toString();

  let makerTokenAddress;
  let takerTokenAddress;
  let makerTokenAmount;
  let takerTokenAmount;
  if (type === 'sell') {
    // Check allowance for token

    const allowance = yield call(
      [zeroEx.token, zeroEx.token.getProxyAllowanceAsync],
      currentToken.id,
      address,
    );

    if (allowance.eq(0)) {
      yield put(setUiState('activeModal', 'AllowanceModal'));
      return;
    }

    const feeAmount = BigNumber(total).times(EXCHANGE_FEE).add(TRANSACTION_FEE).toFixed(6);

    makerTokenAddress = currentToken.id;
    takerTokenAddress = currentPair.id;
    makerTokenAmount =
      ZeroEx.toBaseUnitAmount(BigNumber(amount), currentToken.decimals);
    takerTokenAmount =
      ZeroEx.toBaseUnitAmount(BigNumber(total).minus(feeAmount), currentPair.decimals);
  } else if (type === 'buy') {
    // Check wrapped amount for WETH

    if (currentPair.symbol === 'WETH' && currentPair.is_listed) {
      if (BigNumber(currentPair.balance).lt(total) && BigNumber(balance).gt(total)) {
        yield put(setUiState('activeModal', 'WrapModal'));
        yield put(setUiState('wrapAmount', BigNumber(total).minus(currentPair.balance)));
        return;
      }
    }

    // Check allowance for pair

    const allowance = yield call(
      [zeroEx.token, zeroEx.token.getProxyAllowanceAsync],
      currentPair.id,
      address,
    );

    if (allowance.eq(0)) {
      yield put(setUiState('activeModal', 'AllowanceModal'));
      return;
    }

    const feeAmount = BigNumber(amount).times(EXCHANGE_FEE)
      .add(BigNumber(TRANSACTION_FEE).div(price)).toFixed(6);

    makerTokenAddress = currentPair.id;
    takerTokenAddress = currentToken.id;
    makerTokenAmount =
      ZeroEx.toBaseUnitAmount(BigNumber(total), currentPair.decimals);
    takerTokenAmount =
      ZeroEx.toBaseUnitAmount(BigNumber(amount).minus(feeAmount), currentToken.decimals);
  }
  const zrxOrder = {
    maker: address.toLowerCase(),
    taker: NODE_ADDRESS,
    feeRecipient: NULL_ADDRESS,
    exchangeContractAddress: EXCHANGE_ADDRESS,
    salt: ZeroEx.generatePseudoRandomSalt(),
    makerFee: BigNumber(0),
    takerFee: BigNumber(0),
    makerTokenAddress: makerTokenAddress.toLowerCase(),
    takerTokenAddress: takerTokenAddress.toLowerCase(),
    makerTokenAmount,
    takerTokenAmount,
    expirationUnixTimestampSec: BigNumber(exp.unix()),
  };

  const orderHash = ZeroEx.getOrderHashHex(zrxOrder);

  try {
    const ecSignature = yield zeroEx.signOrderHashAsync(orderHash, address, true);
    const signedZRXOrder = {
      ...zrxOrder,
      ecSignature,
    };
    yield put(sendMessage({ content: 'Placing order', type: 'loading' }));

    yield zeroEx.exchange.validateOrderFillableOrThrowAsync(signedZRXOrder);

    const order = {
      price: +price,
      amount: +amount,
      total: +total,
      token_address: currentToken.id,
      pair_address: currentPair.id,
      type,
      zrxOrder: signedZRXOrder,
      expires_at: exp.toISOString(),
      maker_address: address,
      order_hash: orderHash,
    };

    yield put(saveResourceRequest({
      resourceName: 'orders',
      request: 'createOrder',
      data: {
        attributes: order,
        resourceName: 'orders',
      },
    }));
    yield put(reset('BuySellForm'));
    yield call(loadTokensBalance);
    trackMixpanel(
      'Order created',
      { address, token: currentToken.id },
    );
  } catch (e) {
    yield put(sendNotification({ message: e.message, type: 'error' }));
    console.error(e);
  }
}

export function* loadOrders(): Saga<*> {
  const currentToken = yield select(getCurrentToken);
  yield put(
    resourcesActions.fetchResourcesRequest({
      resourceName: 'orders',
      list: 'buy',
      request: 'fetchOrders',
      withDeleted: false,
      mergeListIds: false,
      fetchQuery: {
        limitCondition: {
          limit: 50,
        },
        filterCondition: {
          filter: {
            'token.address': {
              eq: currentToken.id,
            },
            'completed_at': null,
            'child_id': null,
            'canceled_at': null,
            'status': 'new',
            'deleted_at': null,
            'type': 'buy',
          },
        },
        sortBy: '-price',
      },
    }),
  );

  yield put(
    resourcesActions.fetchResourcesRequest({
      resourceName: 'orders',
      list: 'sell',
      request: 'fetchOrders',
      withDeleted: false,
      mergeListIds: false,
      fetchQuery: {
        limitCondition: {
          limit: 50,
        },
        filterCondition: {
          filter: {
            'token.address': {
              eq: currentToken.id,
            },
            'completed_at': null,
            'child_id': null,
            'canceled_at': null,
            'deleted_at': null,
            'status': 'new',
            'type': 'sell',
          },
        },
        sortBy: 'price',
      },
    }),
  );

  yield put(
    resourcesActions.fetchResourcesRequest({
      resourceName: 'orders',
      list: 'completedOrders',
      request: 'fetchCompletedOrders',
      withDeleted: false,
      mergeListIds: false,
      fetchQuery: {
        limitCondition: {
          limit: 500,
        },
        filterCondition: {
          filter: {
            'token.address': {
              eq: currentToken.id,
            },
            'is_history': true,
            'canceled_at': null,
            'deleted_at': null,
            'completed_at': {
              'ne': null,
            },
          },
        },
        sortBy: '-created_at',
      },
    }),
  );
}

export function* cancelOrder({
  orderId,
}: {
  orderId: string,
}) {
  try {
    const actions = createActionCreators('delete', {
      resourceName: 'orders',
      request: 'cancelOrder',
    });
    yield put(actions.pending());
    const accounts = yield cps(window.web3.eth.getAccounts);
    const signature = yield cps(
      window.web3.eth.personal.sign,
      'Confirmation to cancel order',
      accounts[0],
    );
    yield call(customApiRequest, {
      url: `${config.apiUrl}/orders/${orderId}/cancel`,
      method: 'POST',
      body: JSON.stringify({
        signature,
      }),
    });
    yield put(actions.succeeded({
      resources: [orderId],
    }));
    yield call(loadTokensBalance);
  } catch (err) {
    console.log(err);
  }
}

export function* listenNewOrder(): Saga<*> {
  yield takeEvery(types.CREATE_ORDER, action => createOrder(action.payload));
}

export function* listenCancelOrder(): Saga<*> {
  yield takeEvery(types.CANCEL_ORDER, cancelOrder);
}
