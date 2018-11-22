import 'module-alias/register';
import {
  OrderWatcher,
} from '@0x/order-watcher';
import {
  Order,
} from 'db';
import {
  redisClient,
} from 'redisClient';
import {
  createLogger,
} from 'logger';
import {
  initWeb3ProviderEngine,
  transformBigNumberOrder,
  clearOrderFields,
  ETH_NETWORKS_NAME_MAP,
  GANACHE_CONTRACT_ADDRESSES,
} from 'utils';

import {
  collectTradingInfo,
} from '../collect';


const logger = createLogger(
  'orderWatcher',
  process.env.LOG_LEVEL || 'silly',
  (
    require.main === module
    && process.env.DASHBOARD_PARENT !== 'true'
  ),
);
logger.debug('orderWatcher logger was created');

const FILL_ERROR = 'ORDER_REMAINING_FILL_AMOUNT_ZERO';
const shadowedOrders = new Map();

async function watcherCreator(networkId) {
  const web3ProviderEngine = initWeb3ProviderEngine(networkId);
  const orderWatcher = new OrderWatcher(
    web3ProviderEngine,
    networkId,
    networkId === 50 ? GANACHE_CONTRACT_ADDRESSES : undefined,
  );

  orderWatcher.subscribe(async (err, orderState) => {
    console.log('=============');
    console.log(err);
    console.log(orderState);
    console.log('=============');
    const {
      isValid,
      orderHash,
    } = orderState;
    console.log(orderState);
    const order = await Order.findOne({
      orderHash,
    });
    order.isValid = isValid;

    if (isValid) {
      shadowedOrders.delete(orderHash);
      const {
        remainingFillableMakerAssetAmount,
        remainingFillableTakerAssetAmount,
      } = orderState.orderRelevantState;
      order.remainingFillableMakerAssetAmount = remainingFillableMakerAssetAmount;
      order.remainingFillableTakerAssetAmount = remainingFillableTakerAssetAmount;
      await order.save();
      /* do not spread plainOrder object, it will emit lot of extra keys */
      const plainOrder = order.toObject();
      const metaData = {
        isValid,
        remainingFillableMakerAssetAmount,
        remainingFillableTakerAssetAmount,
        orderHash: order.orderHash,
        networkId: order.networkId,
      };
      redisClient.publish('orders', JSON.stringify({
        order: plainOrder,
        metaData,
      }));
      plainOrder.metaData = metaData;
    } else {
      const { error } = orderState;
      if (!shadowedOrders.has(orderHash)) {
        shadowedOrders.set(orderHash, Date.now());

        order.error = error;

        if (error === FILL_ERROR) {
          order.remainingFillableMakerAssetAmount = '0';
          order.remainingFillableTakerAssetAmount = '0';
          order.completedAt = new Date();
          try {
            const {
              tradingInfoRedisKeyMakerTaker,
              tradingInfoRedisKeyTakerMaker,
            } = await collectTradingInfo(order, logger);

            redisClient.publish(
              'tradingInfo',
              `${tradingInfoRedisKeyMakerTaker}^${tradingInfoRedisKeyTakerMaker}`,
            );
          } catch (e) {
            logger.error(e);
          }
        }
        /* do not spread plainOrder object, it will emit lot of extra keys */
        const plainOrder = order.toObject();
        const metaData = {
          isValid,
          remainingFillableMakerAssetAmount: order.remainingFillableMakerAssetAmount,
          remainingFillableTakerAssetAmount: order.remainingFillableTakerAssetAmount,
          orderHash: order.orderHash,
          networkId: order.networkId,
          ...(
            order.completedAt
              ? {
                completedAt: order.completedAt,
              }
              : {}
          ),
        };
        redisClient.publish('orders', JSON.stringify({
          order: plainOrder,
          metaData,
        }));
        plainOrder.metaData = metaData;
        await order.save();
      }
    }
  });

  const orders = await Order.find({
    networkId,
    completedAt: null,
  });
  orders.forEach((order) => {
    orderWatcher.addOrderAsync(
      transformBigNumberOrder(order.toObject()),
    );
  });

  return orderWatcher;
}

function removeShadowedOrders() {
  const now = Date.now();
  const orderHashes = [];
  for (const [orderHash, shadowedAt] of shadowedOrders) { /* eslint-disable-line */
    if (shadowedAt + 600 * 1000 < now) {
      orderHashes.push(orderHash);
    }
  }
  if (orderHashes.length) {
    Order.deleteMany({
      $or: (
        orderHashes.reduce((acc, orderHash) => ([
          ...acc,
          {
            orderHash,
          },
        ]), [])
      ),
    });
  }
  setTimeout(removeShadowedOrders, 300);
}

(async () => {
  const networks = (
    (process.env.ETH_NETWORKS || 'main,kovan,test').split(',')
  ).map(networkName => ETH_NETWORKS_NAME_MAP[networkName]);
  const watchers = await networks.reduce(async (acc, networkId) => ({
    ...acc,
    [networkId]: await watcherCreator(networkId),
  }), {});

  const redisSub = redisClient.duplicate();
  redisSub.on('message', async (channel, message) => {
    redisClient.publish('orders', message);
    const {
      order: rawOrder,
      metaData,
    } = JSON.parse(message);
    const order = clearOrderFields(rawOrder);
    if (!shadowedOrders.has(metaData.orderHash)) {
      await watchers[metaData.networkId].addOrderAsync(
        transformBigNumberOrder(order),
      );
    }
  });

  const redisTestSub = redisClient.duplicate();
  redisTestSub.on('message', async (channel, message) => {
    const { hashes } = JSON.parse(message);
    await Order.deleteMany({
      $or: (
        hashes.reduce((acc, orderHash) => ([
          ...acc,
          {
            orderHash,
          },
        ]), [])
      ),
    });
    hashes.forEach((hash) => {
      /* for testing network ID always 50 */
      watchers[50].removeOrder(hash);
    });
  });
  redisSub.subscribe('orderWatcher');
  redisTestSub.subscribe('testingOrderWatcher');
  removeShadowedOrders();
})();
