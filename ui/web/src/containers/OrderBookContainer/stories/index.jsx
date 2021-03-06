import React from 'react';
import {
  storiesOf,
} from '@storybook/react';
import {
  withKnobs,
  boolean,
} from '@storybook/addon-knobs';

import TradingPageLayout from 'web-components/TradingPageLayout';
import OrderBookContainer from '..';


const OrderBookContainerStory = () => (
  <TradingPageLayout.Preview
    hideRest={boolean('Hide preview layout', false)}
    orderBook={(
      <OrderBookContainer />
    )}
  />
);

storiesOf('Containers|OrderBookContainer', module)
  .addDecorator(withKnobs)
  .add(
    'default',
    OrderBookContainerStory,
  )
  .add(
    'full screen',
    OrderBookContainerStory,
    {
      options: {
        goFullScreen: true,
      },
    },
  );
