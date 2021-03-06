// @flow
import {
  assetDataUtils,
  BigNumber,
} from '0x.js';
import {
  ExchangeContractErrs,
} from '@0x/types';
import uuidv4 from 'uuid/v4';
import * as eff from 'redux-saga/effects';
import createActionCreators from 'redux-resource-action-creators';

import {
  eventChannel,
  channel,
} from 'redux-saga';
import {
  matchPath,
} from 'react-router';

import {
  coreSagas,
  coreSelectors,
  coreActions,
  api,
  utils,
} from 'localrelayer-core';

import config from 'web-config';
import {
  actionTypes,
  uiActions,
} from 'web-actions';
import {
  getUiState,
} from 'web-selectors';
import {
  getHistory,
} from 'web-history';
import {
  DEFAULT_URL,
} from 'localrelayer-core/src/utils';
import {
  takeSubscribeOnChangeChartBar,
} from './chart';
import {
  takeNotification,
} from './notifications';
import {
  takeModalShow,
} from './modals';


function* subscribeOnUpdateOrders(): Saga<void> {
  const networkId = yield eff.select(coreSelectors.getWalletState('networkId'));
  const currentAssetPairId = yield eff.select(getUiState('currentAssetPairId'));
  const traderAddress = yield eff.select(coreSelectors.getWalletState('selectedAccount'));
  const requestId = uuidv4();

  if (currentAssetPairId) {
    yield eff.put(uiActions.setUiState({
      ordersSubscribeId: requestId,
    }));
    yield eff.put(coreActions.sendSocketMessage({
      type: 'subscribe',
      channel: 'orders',
      requestId,
      payload: {
        ...(
          currentAssetPairId
            ? {
              makerAssetData: currentAssetPairId.split('_')[0],
              takerAssetData: currentAssetPairId.split('_')[1],
            } : {}
        ),
        traderAddress,
        networkId,
      },
    }));
  } else {
    console.log('attempt subscribeOnUpdateOrders without currentAssetPairId!!!');
  }
}

function* subscribeOnCurrentTradingInfo(): Saga<void> {
  const networkId = yield eff.select(coreSelectors.getWalletState('networkId'));
  const currentAssetPairId = yield eff.select(getUiState('currentAssetPairId'));
  const requestId = uuidv4();
  if (currentAssetPairId) {
    yield eff.put(uiActions.setUiState({
      tradingInfoSubscribeId: requestId,
    }));
    yield eff.put(coreActions.sendSocketMessage({
      type: 'subscribe',
      channel: 'tradingInfo',
      requestId,
      payload: {
        pairs: [{
          assetDataA: currentAssetPairId.split('_')[0],
          assetDataB: currentAssetPairId.split('_')[1],
          networkId,
        }],
      },
    }));
  } else {
    console.log('attempt subscribeOnCurrentTradingInfo without currentAssetPairId!!!');
  }
}

function* initializeRoute({
  location,
  webRadioChannel,
  networkId,
  history,
}) {
  const selectedAccount = yield eff.select(coreSelectors.getWalletState('selectedAccount'));
  /* fetch pending transactions */
  yield eff.fork(
    coreSagas.fetchTransactions,
    {
      networkId,
      address: selectedAccount,
      type: 'pending',
    },
    true,
  );
  /* fetch finished transactions, it's temporary, the componen on did mount will fetch it */
  yield eff.fork(
    coreSagas.fetchTransactions,
    {
      networkId,
      address: selectedAccount,
    },
  );
  yield eff.put(uiActions.setUiState({
    pathname: location.pathname,
  }));
  const matchTradingPage = (
    location.pathname === '/'
      ? ({
        params: {
          baseAsset: 'ZRX',
          quoteAsset: 'WETH',
        },
      })
      : (
        matchPath(location.pathname, {
          path: '/:baseAsset-:quoteAsset',
          exact: true,
          strict: false,
        })
      )
  );
  const matchProfilePage = location.pathname === '/account';

  const tradingInfoSubscribeId = yield eff.select(getUiState('tradingInfoSubscribeId'));
  const ordersSubscribeId = yield eff.select(getUiState('ordersSubscribeId'));

  if (matchProfilePage) {
    if (tradingInfoSubscribeId) {
      yield eff.put(coreActions.sendSocketMessage({
        type: 'unsubscribe',
        requestId: tradingInfoSubscribeId,
      }));
      yield eff.put(uiActions.setUiState({
        tradingInfoSubscribeId: null,
      }));
    }
    yield eff.fork(
      coreSagas.fetchTradingHistory,
      {
        networkId,
      },
    );

    yield eff.fork(
      coreSagas.fetchUserTradingHistory,
      {
        networkId,
        makerAddress: selectedAccount,
      },
    );
    const allAssets = yield eff.select(coreSelectors.getResourceMappedList('assets'));
    yield eff.put(
      webRadioChannel,
      {
        messageType: 'runWalletWatcher',
        message: {
          delay: 5000,
          tokens: allAssets.map(asset => asset.address),
        },
      },
    );
  }
  if (matchTradingPage) {
    try {
      const {
        assetPair,
        isListed,
      } = yield eff.call(coreSagas.checkAssetPair, {
        baseAsset: matchTradingPage.params.baseAsset,
        quoteAsset: matchTradingPage.params.quoteAsset,
        networkId,
      });

      yield eff.put(uiActions.setUiState({
        currentAssetPairId: assetPair.id,
        isCurrentPairListed: isListed,
        isCurrentPairIssue: false,
      }));

      /* Unsubscribe after pair change */
      if (tradingInfoSubscribeId) {
        yield eff.put(coreActions.sendSocketMessage({
          type: 'unsubscribe',
          requestId: tradingInfoSubscribeId,
        }));
      }
      yield eff.fork(subscribeOnCurrentTradingInfo);

      yield eff.fork(
        coreSagas.fetchAllTradingInfo,
        {
          networkId,
        },
      );
      yield eff.fork(
        coreSagas.fetchOrderBook,
        {
          networkId,
          baseAssetData: assetPair.assetDataA.assetData,
          quoteAssetData: assetPair.assetDataB.assetData,
        },
      );
      yield eff.fork(
        coreSagas.fetchTradingHistory,
        {
          networkId,
          baseAssetData: assetPair.assetDataA.assetData,
          quoteAssetData: assetPair.assetDataB.assetData,
        },
      );

      yield eff.fork(
        coreSagas.fetchUserTradingHistory,
        {
          networkId,
          makerAddress: selectedAccount,
          baseAssetData: assetPair.assetDataA.assetData,
          quoteAssetData: assetPair.assetDataB.assetData,
        },
      );

      const { tokenAddress: tokenA } = assetDataUtils.decodeAssetDataOrThrow(
        assetPair.assetDataA.assetData,
      );
      const { tokenAddress: tokenB } = assetDataUtils.decodeAssetDataOrThrow(
        assetPair.assetDataB.assetData,
      );
      yield eff.put(
        webRadioChannel,
        {
          messageType: 'runWalletWatcher',
          message: {
            delay: 5000,
            tokens: [
              tokenA,
              tokenB,
            ],
          },
        },
      );
    } catch (errors) {
      console.log(errors);
      yield eff.put(uiActions.setUiState({
        isCurrentPairIssue: true,
        currentPairErrors: errors,
      }));
      // If url asset pair is same as default one, app goes into recursion
      if (matchTradingPage.url && (matchTradingPage.url !== DEFAULT_URL)) {
        // Redirect to main page if wrong asset pair
        history.push('/');
      }
    }
  }
  if (ordersSubscribeId) {
    yield eff.put(coreActions.sendSocketMessage({
      type: 'unsubscribe',
      requestId: ordersSubscribeId,
    }));
    yield eff.put(uiActions.setUiState({
      ordersSubscribeId: null,
    }));
  }
  yield eff.fork(subscribeOnUpdateOrders);
}

function* updateOrdersBalancer(bufferChannel) {
  while (true) {
    const firstAction = yield eff.take(bufferChannel);
    const restActions = yield eff.flush(bufferChannel);
    const allActions = [
      firstAction,
      ...restActions,
    ];
    const combined = allActions.reduce(
      (acc, action) => ({
        ...acc,
        [`${action.resourceType}_${action.lists.join('_')}`]: [
          ...acc[`${action.resourceType}_${action.lists.join('_')}`] || [],
          action,
        ],
      }),
      {},
    );
    yield eff.all(
      Object.keys(combined).map(
        k => eff.put({
          ...combined[k][0],
          resources: [].concat(
            ...combined[k].map(a => a.resources),
          ),
        }),
      ),
    );
    yield eff.delay(1000);
  }
}

function* takeUpdateOrder(messagesFromSocketChannel) {
  const orderFillChannel = yield eff.call(channel);
  const ordersBufferChannel = yield eff.call(channel);
  yield eff.fork(
    takeSubscribeOnChangeChartBar,
    orderFillChannel,
  );
  yield eff.fork(
    updateOrdersBalancer,
    ordersBufferChannel,
  );
  const actions = createActionCreators('read', {
    resourceType: 'orders',
    requestKey: 'orders',
    mergeListIds: true,
  });

  const traderAddress = yield eff.select(coreSelectors.getWalletState('selectedAccount'));
  while (true) {
    const lists = [];
    const data = yield eff.take(messagesFromSocketChannel);
    const currentAssetPairId = yield eff.select(getUiState('currentAssetPairId'));
    const assetsData = currentAssetPairId.split('_');

    if (
      data.channel === 'orders'
      && data.type === 'update'
    ) {
      const currentOrder = yield eff.select(coreSelectors.getResourceById(
        'orders',
        data.payload.order.signature,
      ));
      /* Determine whether the order should be placed to userOrders list */
      if ((
        data.payload.metaData.isValid === true
        || data.payload.metaData.isShadowed === true
      ) && (
        data.payload.order.makerAddress === traderAddress
      )
      ) {
        lists.push('userOrders');
      }
      if (
        ((
          data.payload.metaData.isValid === false
          && data.payload.metaData.error === ExchangeContractErrs.OrderRemainingFillAmountZero
        ) || (
          currentOrder
          && !(new BigNumber(data.payload?.metaData?.filledTakerAssetAmount)
            .eq(currentOrder?.metaData?.filledTakerAssetAmount))
        ))
        && assetsData.some(assetData => assetData === data.payload.order.makerAssetData)
        && assetsData.some(assetData => assetData === data.payload.order.takerAssetData)
      ) {
        lists.push('tradingHistory');

        if (data.payload.order.makerAddress === traderAddress) {
          lists.push('userTradingHistory');
        }

        yield eff.put(
          orderFillChannel,
          data.payload,
        );
        const userOrders = yield eff.select(coreSelectors.getUserOpenOrders);
        const { order } = data.payload;
        const orderInfo = userOrders.find(userOrder => userOrder.signature === order.signature);
        if (orderInfo && order.makerAddress === traderAddress) {
          const makerAssetAddress = (
            assetDataUtils.decodeERC20AssetData(
              orderInfo.makerAssetData,
            ).tokenAddress
          );
          const takerAssetAddress = (
            assetDataUtils.decodeERC20AssetData(
              orderInfo.takerAssetData,
            ).tokenAddress
          );
          const userBalance = yield eff.call(
            coreSagas.getWalletBalance,
            {
              makerAssetAddress,
              takerAssetAddress,
            },
          );
          yield eff.put(coreActions.setWalletState({
            balance: {
              _merge: true,
              [makerAssetAddress]: (
                userBalance[makerAssetAddress] || 0
              ),
              [takerAssetAddress]: (
                userBalance[takerAssetAddress] || 0
              ),
            },
          }));
          yield eff.put(coreActions.sendNotificationRequest({
            placement: 'topLeft',
            message: 'Your order has been filled',
            description: `Pair: ${orderInfo.pair} Price: ${orderInfo.price}`,
            iconProps: {
              type: 'check-circle',
              style: {
                color: 'green',
              },
            },
          }));
        }
      }

      if (
        data.payload.metaData.isValid === true
        && assetsData.some(assetData => assetData === data.payload.order.makerAssetData)
        && assetsData.some(assetData => assetData === data.payload.order.takerAssetData)
      ) {
        const baseAssetData = assetsData[0];
        lists.push((
          baseAssetData === data.payload.order.makerAssetData
            ? (
              'asks'
            )
            : (
              'bids'
            )
        ));
      }

      yield eff.put(
        ordersBufferChannel,
        actions.succeeded({
          lists,
          removeFromOtherLists: true,
          resources: [{
            id: data.payload.order.signature,
            metaData: data.payload.metaData,
            ...data.payload.order,
          }],
        }),
      );
    }
  }
}

function* takeChangeRoute({
  historyChannel,
  webRadioChannel,
  networkId,
  history,
}) {
  while (true) {
    const { location } = yield eff.take(historyChannel);
    yield eff.fork(
      initializeRoute,
      {
        location,
        webRadioChannel,
        networkId,
        history,
      },
    );
  }
}

function* socketConnect(messagesFromSocketChannel): Saga<void> {
  /* buffer messages */
  const messagesToSocketChannel = yield eff.actionChannel(
    coreActions.actionTypes.SEND_SOCKET_MESSAGE,
  );
  const closeSocketChannel = yield eff.call(channel);
  const openSocketChannel = yield eff.call(channel);
  let isReconnect = false;
  let delay = 0;
  while (true) {
    const socket = new WebSocket(config.socketUrl);
    const task = yield eff.fork(
      coreSagas.handleSocketIO,
      {
        socket,
        messagesFromSocketChannel,
        closeSocketChannel,
        openSocketChannel,
        messagesToSocketChannel,
      },
    );
    const raceResp = yield eff.race({
      open: eff.take(openSocketChannel),
      close: eff.take(closeSocketChannel),
    });
    const { open } = raceResp;
    let { close } = raceResp;
    if (open) {
      yield eff.put(uiActions.setUiState({
        isSocketConnected: true,
      }));
      delay = 0;
      if (isReconnect) {
        yield eff.fork(subscribeOnCurrentTradingInfo);
        yield eff.fork(subscribeOnUpdateOrders);
      }
      close = yield eff.take(closeSocketChannel);
    }
    yield eff.put(uiActions.setUiState({
      isSocketConnected: false,
    }));
    yield eff.cancel(task);
    /* in case if connection is still open(no pong response) */
    socket.close();
    if (close?.resendMessage) {
      yield eff.put(coreActions.sendSocketMessage(close.resendMessage));
    }
    yield eff.delay(delay);
    if (delay < 5000) {
      delay += 500;
    }
    isReconnect = true;
  }
}

export function* initialize(): Saga<void> {
  const { historyType } = yield eff.take(actionTypes.INITIALIZE_WEB_APP);
  if (!web3) {
    yield eff.put(uiActions.setUiState({
      isWeb3ProviderPresent: false,
    }));
  }

  const localStorageSettings = localStorage.getItem('localrelayerSettings');
  try {
    const settings = JSON.parse(localStorageSettings);

    if (!settings?.setupGuideShown || !settings?.wasJoyrideShown || !web3) {
      yield eff.put(uiActions.setUiState({
        isSetupGuideVisible: true,
        isJoyrideVisible: true,
      }));
      const newSettings = {
        ...settings,
        setupGuideShown: true,
        wasJoyrideShown: true,
      };
      localStorage.setItem('localrelayerSettings', JSON.stringify(newSettings));
    }
  } catch (e) {
    console.log('Cant parse settings');
  }


  const networkId = (
    web3
      ? (
        yield eff.call(web3.eth.net.getId)
      ) : (
        1
      )
  );

  if (!utils.getNetwork(networkId).isSupported) {
    yield eff.put(uiActions.setUiState({
      isNetworkSupported: false,
    }));
  }
  api.setApiUrl(config.apiUrl);
  console.log('Web initialize saga');

  const accounts = (
    web3 ? (
      yield eff.call(web3.eth.getAccounts)
    ) : (
      []
    )
  );
  const selectedAccount = accounts.length ? accounts[0].toLowerCase() : null;
  yield eff.put(
    coreActions.setWalletState({
      networkId,
      networkName: utils.getNetwork(networkId).name || 'Unknown',
      selectedAccount,
    }),
  );

  yield eff.put(uiActions.setUiState({
    historyType,
  }));
  yield eff.fork(
    coreSagas.fetchUserOrders,
    {
      networkId,
      traderAddress: selectedAccount,
    },
  );
  const webRadioChannel = yield eff.call(channel);
  const messagesFromSocketChannel = yield eff.call(channel);
  const fetchPairsTask = yield eff.fork(
    coreSagas.fetchAssetPairs,
    {
      networkId,
    },
  );
  const history = getHistory(historyType);
  const historyChannel = eventChannel(
    emitter => (
      history.listen((location, action) => {
        emitter({
          location,
          action,
        });
      })
    ),
  );
  yield eff.fork(
    socketConnect,
    messagesFromSocketChannel,
  );
  yield eff.fork(
    takeChangeRoute,
    {
      historyChannel,
      webRadioChannel,
      networkId,
      history,
    },
  );

  yield eff.join(fetchPairsTask);
  yield eff.fork(
    takeUpdateOrder,
    messagesFromSocketChannel,
  );
  /* index root will redirect to /zrx-weth and initializeRoute catch it */
  if (history.location.pathname !== '/') {
    yield eff.fork(
      initializeRoute,
      {
        location: history.location,
        webRadioChannel,
        networkId,
        history,
      },
    );
  }
  yield eff.fork(
    coreSagas.marketQuotesWatcher,
    {
      delay: 1000 * 60 * 10,
      symbols: ['WETH'],
    },
  );
  yield eff.put(uiActions.setUiState({
    isAppInitializing: false,
  }));
  yield eff.fork(coreSagas.takeApproval);
  yield eff.fork(coreSagas.takeDepositAndWithdraw);
  yield eff.fork(coreSagas.takePostOrder);
  yield eff.fork(coreSagas.takeFillOrder);
  yield eff.fork(coreSagas.takeCancelOrder);
  yield eff.fork(takeNotification);
  yield eff.fork(takeModalShow);
  let watchWalletTask;

  /* Web radio center */
  while (true) {
    const {
      messageType,
      message,
    } = yield eff.take(webRadioChannel);

    switch (messageType) {
      case 'runWalletWatcher': {
        if (watchWalletTask) {
          yield eff.cancel(watchWalletTask);
        }
        watchWalletTask = yield eff.fork(
          coreSagas.watchWallet,
          message,
        );
        break;
      }
      default:
        break;
    }
  }
}
