// @flow

import React from 'react';
import {
  Button,
  Input,
  Form,
} from 'antd';
import {
  Formik,
} from 'formik';
import {
  utils,
} from 'localrelayer-core';

import * as S from './styled';

type Props = {
  onWithdraw: Function,
  onDeposit: Function,
  children: any,
}

export default ({
  onWithdraw,
  onDeposit,
  children,
}: Props) => (
  <Formik
    isInitialValid
    validate={(values) => {
      const errors = {};
      if (values.amount.length && !utils.isNumber(values.amount)) {
        errors.amount = 'Amount should be a number';
      }
      return errors;
    }}
  >
    {({
      handleChange,
      values,
      resetForm,
      errors,
      isValid,
    }) => (
      <S.WrappingBar
        id="etherWrapper"
      >
        <S.Amount>
          <Form.Item
            validateStatus={errors.amount && 'error'}
            help={errors.amount}
          >
            <Input
              value={values.amount}
              name="amount"
              addonAfter={<div>ETH</div>}
              placeholder="Amount"
              onChange={handleChange}
              autoComplete="off"
            />
          </Form.Item>
        </S.Amount>
        <S.UnwrapWrapBar>
          <Button.Group>
            <S.UnwrapButton
              type="primary"
              disabled={!isValid || !values?.amount?.length}
              onClick={() => {
                onWithdraw(values.amount, { resetForm });
              }}
            >
              Withdraw
            </S.UnwrapButton>
            <S.WrapButton
              type="primary"
              disabled={!isValid || !values?.amount?.length}
              onClick={() => {
                onDeposit(values.amount, { resetForm });
              }}
            >
              Deposit
            </S.WrapButton>
          </Button.Group>
        </S.UnwrapWrapBar>

        {children}

      </S.WrappingBar>
    )}
  </Formik>
);
