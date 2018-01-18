// @flow
import type {
  ID,
  ResourceName,
  FetchResourceRequestAction,
  DeleteResourceRequestAction,
  DeleteResourceAction,
  SaveResourceRequestAction,
  FillResourceItemsAction,
  ResourceAttributes,
  ResourceRelationships,
  AddResourceItemAction,
} from '../types';


export const fetchResourcesRequest = (
  payload: {
    resourceName: ResourceName,
    withDeleted: boolean,
  },
): FetchResourceRequestAction =>
  ({
    type: `@@JSONAPI/${payload.resourceName}_FETCH_REQUEST`,
    payload,
  });

export const deleteResourceRequest = (
  payload: {
    resourceName: ResourceName,
    id: ID,
    closeModal: boolean,
  },
): DeleteResourceRequestAction =>
  ({
    type: `@@JSONAPI/${payload.resourceName}_DELETE_REQUEST`,
    payload,
  });

export const saveResourceRequest = (
  payload: {
    resourceName: ResourceName,
    data: any,
    closeModal: boolean,
    destroyForm: string,
  },
): SaveResourceRequestAction =>
  ({
    type: `@@JSONAPI/${payload.resourceName}_SAVE_REQUEST`,
    payload,
  });

export const deleteResourceItem = (
  payload: {
    resourceName: ResourceName,
    id: ID,
  },
): DeleteResourceAction =>
  ({
    type: `@@JSONAPI/${payload.resourceName}_DELETE`,
    payload,
  });

export const fillResourceItems = (
  payload: {
    resourceName: ResourceName,
    byId: {
      id: ID,
      attributes: ResourceAttributes,
      relationships: ResourceRelationships,
    },
    ids: Array<ID>,
  },
): FillResourceItemsAction =>
  ({
    type: `@@JSONAPI/${payload.resourceName}_FILL`,
    payload,
  });

export const addResourceItem = (
  {
    id,
    attributes,
    relationships,
    resourceName,
  }: {
    id: ID,
    attributes: ResourceAttributes,
    relationships: ResourceRelationships,
    resourceName: ResourceName,
  },
): AddResourceItemAction =>
  ({
    type: `@@JSONAPI/${resourceName}_ADD`,
    payload: {
      id,
      attributes,
      relationships,
    },
  });