// @flow
import React from 'react';
import {
  reduxForm,
  Field,
} from 'redux-form';
import {
  Button,
} from 'antd';

import type {
  Node,
  StatelessFunctionalComponent,
} from 'react';

import {
  NumberInput,
} from '../ReduxFormComponents';

import {
  InputGroupContainer,
  FormContainer,
} from './styled';

const validate = (values) => {
  const errors = {};

  if (!/^-?\d+\.?\d*$/.test(values.amount)) {
    errors.amount = 'Numbers only';
  }

  if (!values.amount) {
    errors.amount = 'Amount is required';
  } else if (values.amount <= 0) {
    errors.amount = 'Amount can be only positive';
  }
  return errors;
};

// eslint-disable-next-line
const parseNumber = val => (isNaN(parseFloat(val)) ? undefined : parseFloat(val));

type Props = {
  wrap: () => void,
  unwrap: () => void,
  handleSubmit: (Function) => void,
  isLoading: boolean,
};

/**
 * Ether Wrap/Unwrap form
 * @version 1.0.0
 * @author [Tim Reznich](https://github.com/imbaniac)
 */

const WrapForm: StatelessFunctionalComponent<Props> = ({
  wrap,
  unwrap,
  handleSubmit,
  isLoading,
}: Props): Node => (
  <FormContainer onSubmit={handleSubmit}>
    <InputGroupContainer compact>
      <Field
        name="amount"
        type="text"
        component={NumberInput}
        placeholder="ETH amount"
        // parse={parseNumber}
      />
      <Button.Group>
        <Button type="primary" disabled={isLoading} onClick={handleSubmit(unwrap)}>Unwrap</Button>
        <Button type="primary" disabled={isLoading} onClick={handleSubmit(wrap)}>Wrap</Button>
      </Button.Group>
    </InputGroupContainer>
  </FormContainer>
);

export default reduxForm({
  form: 'WrapForm',
  touchOnBlur: true,
  touchOnChange: true,
  enableReinitialize: true,
  validate,
})(WrapForm);
