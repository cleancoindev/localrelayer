// @flow
import React, {
  useState,
} from 'react';
import {
  Tooltip,
} from 'antd';

import {
  ColoredSpan,
} from 'web-components/SharedStyledComponents';
import * as colors from 'web-styles/colors';
import Measure from 'react-measure';
import * as S from './styled';


type Props = {
  orders: Array<any>,
  isTradingPage: boolean,
  isUserTradingHistory: Boolean,
}

const getColumns = isTradingPage => [
  ...(
    !isTradingPage ? [{
      title: 'Pair',
      dataIndex: 'pair',
      render: text => (
        <div>
          <Tooltip title={text}>
            {text}
          </Tooltip>
        </div>
      ),
    }] : []
  ),
  {
    title: 'Price',
    dataIndex: 'price',
    render: (
      text: string,
      record: any,
    ) => (
      <Tooltip title={text}>
        <ColoredSpan
          color={(
            record.type === 'ask'
              ? colors.red
              : colors.green
          )}
        >
          {text.slice(0, 9)}
        </ColoredSpan>
      </Tooltip>
    ),
  },
  {
    title: 'Amount',
    dataIndex: 'amount',
    render: (text: string) => (
      <Tooltip title={text}>
        {text.slice(0, 9)}
      </Tooltip>
    ),
  },
  ...(
    !isTradingPage ? [{
      title: 'Total',
      dataIndex: 'total',
      render: text => (
        <div>
          <Tooltip title={text}>
            {text.slice(0, 9)}
          </Tooltip>
        </div>
      ),
    }, {
      title: 'Status',
      dataIndex: 'status',
      render: text => (
        <div>
          <Tooltip title={text}>
            {text}
          </Tooltip>
        </div>
      ),
    }] : []
  ),
  {
    title: 'Date',
    dataIndex: 'lastFilledAt',
    render: (text: string, record: any) => (
      <Tooltip title={record.lastFilledAtFormattedLong}>
        {record.lastFilledAtFormattedShort}
      </Tooltip>
    ),
  },
];

const TradingHistory = ({
  orders,
  isTradingPage,
  isUserTradingHistory,
}: Props) => {
  const [dimensions, setDimensions] = useState('');
  return (
    <Measure
      bounds
      onResize={(contentRect) => {
        setDimensions(contentRect.bounds);
      }}
    >
      {({ measureRef }) => (
        <div ref={measureRef} style={{ height: '100%' }}>
          <S.TradingHistory>
            {
            !isUserTradingHistory
            && !isTradingPage
            && (
            <S.Header>
              <div>
                Trading History
              </div>
            </S.Header>
            )}
            <S.TradingHistoryTable
              isUserTradingHistory={isUserTradingHistory}
              isTradingPage={isTradingPage}
              size="small"
              columns={getColumns(isTradingPage && !isUserTradingHistory)}
              pagination={false}
              dataSource={orders}
              scroll={isTradingPage ? { y: dimensions.height } : { y: dimensions.height - 75 }}
            />
          </S.TradingHistory>
        </div>
      )}
    </Measure>
  );
};

export default TradingHistory;
