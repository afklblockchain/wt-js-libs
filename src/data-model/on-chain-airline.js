// @flow
import type { TransactionOptionsInterface, TransactionCallbacksInterface, PreparedTransactionMetadataInterface, TxReceiptInterface, AirlineInterface, PlainAirlineInterface, AirlineOnChainDataInterface } from '../interfaces';
import Utils from '../utils';
import Contracts from '../contracts';
import RemotelyBackedDataset from '../remotely-backed-dataset';
import StoragePointer from '../storage-pointer';

import { InputDataError, SmartContractInstantiationError } from '../errors';

/**
 * Wrapper class for a airline backed by a smart contract on
 * Ethereum that's holding `dataUri` pointer to its data.
 *
 * It provides an accessor to such data in a form of
 * `StoragePointer` instance under `dataIndex` property.
 * Every schema-specific implementation details
 * are dealt with in StoragePointer.
 *
 */
class OnChainAirline implements AirlineInterface {
  address: Promise<?string> | ?string;

  // provided by eth backed dataset
  _dataUri: Promise<?string> | ?string;
  _manager: Promise<?string> | ?string;

  web3Utils: Utils;
  web3Contracts: Contracts;
  indexContract: Object;
  contractInstance: Object;
  onChainDataset: RemotelyBackedDataset;

  // Representation of data stored on dataUri
  _dataIndex: ?StoragePointer;
  _initialized: boolean;

  /**
   * Create new configured instance.
   * @param  {Utils} web3Utils
   * @param  {Contracts} web3Contracts
   * @param  {web3.eth.Contract} indexContract Representation of Winding Tree index
   * @param  {string} address is an optional pointer to Ethereum network where the airline lives.
   * It is used as a reference for on-chain stored data. If it is not provided, a airline has
   * to be created on chain to behave as expected.
   * @return {OnChainAirline}
   */
  static createInstance (web3Utils: Utils, web3Contracts: Contracts, indexContract: Object, address?: string): OnChainAirline {
    const airline = new OnChainAirline(web3Utils, web3Contracts, indexContract, address);
    airline.initialize();
    return airline;
  }

  constructor (web3Utils: Utils, web3Contracts: Contracts, indexContract: Object, address?: string) {
    this.address = address;
    this.web3Utils = web3Utils;
    this.web3Contracts = web3Contracts;
    this.indexContract = indexContract;
  }

  /**
   * Initializes the underlying RemotelyBackedDataset that actually
   * communicates with the on-chain stored data. If address was provided
   * in the contsructor, the RemotelyBackedDataset is marked as deployed
   * and can be used instantly.
   */
  initialize () {
    this.onChainDataset = RemotelyBackedDataset.createInstance();
    this.onChainDataset.bindProperties({
      fields: {
        _dataUri: {
          remoteGetter: async (): Promise<?string> => {
            return (await this._getContractInstance()).methods.dataUri().call();
          },
          remoteSetter: this._editInfoOnChain.bind(this),
        },
        _manager: {
          remoteGetter: async (): Promise<?string> => {
            return (await this._getContractInstance()).methods.manager().call();
          },
        },
      },
    }, this);
    this._initialized = true;
    if (this.address) {
      this.onChainDataset.markDeployed();
    }
  }

  /**
   * Async getter for `StoragePointer` instance.
   * Since it has to eventually access the `dataUri`
   * field stored on-chain, it is lazy loaded.
   *
   * Data format of off-chain airline data can be found on
   * https://github.com/windingtree/wiki/blob/master/hotel-data-swagger.yaml
   *
   */
  get dataIndex (): Promise<StoragePointer> {
    return (async () => {
      if (!this._dataIndex) {
        this._dataIndex = StoragePointer.createInstance(await this.dataUri, {
          descriptionUri: { required: true },
          ratePlansUri: { required: false },
          availabilityUri: { required: false },
        });
      }
      return this._dataIndex;
    })();
  }

  get dataUri (): Promise<?string> | ?string {
    if (!this._initialized) {
      return;
    }
    return (async () => {
      const dataUri = await this._dataUri;
      return dataUri;
    })();
  }

  set dataUri (newDataUri: Promise<?string> | ?string) {
    if (!newDataUri) {
      throw new InputDataError(
        'Cannot update airline: Cannot set dataUri when it is not provided'
      );
    }
    if (typeof newDataUri === 'string' && !newDataUri.match(/([a-z-]+):\/\//)) {
      throw new InputDataError(
        'Cannot update airline: Cannot set dataUri with invalid format'
      );
    }
    if (newDataUri !== this._dataUri) {
      this._dataIndex = null;
    }

    this._dataUri = newDataUri;
  }

  get manager (): Promise<?string> | ?string {
    if (!this._initialized) {
      return;
    }
    return (async () => {
      const manager = await this._manager;
      return manager;
    })();
  }

  set manager (newManager: Promise<?string> | ?string) {
    if (!newManager) {
      throw new InputDataError('Cannot update airline: Cannot set manager to null');
    }
    if (this.address) {
      throw new InputDataError('Cannot update airline: Cannot set manager when airline is deployed');
    }
    this._manager = newManager;
  }

  /**
   * Update manager and dataUri properties. dataUri can never be nulled. Manager
   * can never be nulled. Manager can be changed only for an un-deployed
   * contract (without address).
   * @param {AirlineOnChainDataInterface} newData
   */
  async setLocalData (newData: AirlineOnChainDataInterface): Promise<void> {
    const newManager = await newData.manager;
    if (newManager) {
      this.manager = newManager;
    }
    const newDataUri = await newData.dataUri;
    if (newDataUri) {
      this.dataUri = newDataUri;
    }
  }

  /**
   * Helper method that transforms the whole airline into a sync simple
   * JavaScript object only with data properties.
   *
   * By default, all off-chain data is resolved recursively. If you want to
   * limit off-chain data only to a certain subtree, use the resolvedFields
   * parameter that accepts an array of paths in dot notation (`father.son.child`).
   * Every last piece of every path will be resolved recursively as well. An empty
   * list means no fields will be resolved.
   *
   * Properties that represent an actual separate document have a format of
   * ```
   * {
   *   'ref': 'schema://original-url',
   *   'contents': {
   *     'actual': 'data'
   *   }
   * }
   * ```
   *
   * @param {resolvedFields} List of fields to be resolved from off chain data, in dot notation.
   * If an empty array is provided, no resolving is done. If the argument is missing, all fields are resolved.
   *
   * @throws {StoragePointerError} when an adapter encounters an error while accessing the data
   */
  async toPlainObject (resolvedFields: ?Array<string>): Promise<PlainAirlineInterface> {
    const dataIndex = await this.dataIndex;
    const offChainData = await dataIndex.toPlainObject(resolvedFields);
    let result = {
      manager: await this.manager,
      address: this.address,
      dataUri: offChainData,
    };
    return result;
  }

  async _getContractInstance (): Promise<Object> {
    if (!this.address) {
      throw new SmartContractInstantiationError('Cannot get airline instance without address');
    }
    if (!this.contractInstance) {
      this.contractInstance = await this.web3Contracts.getAirlineInstance(this.address, this.web3Utils.getCurrentWeb3Provider());
    }
    return this.contractInstance;
  }

  /**
   * Generates transaction data and metadata for updating dataUri on-chain.
   * Used internally as a remoteSetter for `dataUri` property.
   * Transaction is not signed nor sent here.
   *
   * @param {TransactionOptionsInterface} options object, only `from` property is currently used, all others are ignored in this implementation
   * @return {Promise<PreparedTransactionMetadataInterface>} resulting transaction metadata
   */
  async _editInfoOnChain (transactionOptions: TransactionOptionsInterface): Promise<PreparedTransactionMetadataInterface> {
    const data = (await this._getContractInstance()).methods.editInfo(await this.dataUri).encodeABI();
    const estimate = this.indexContract.methods.callAirline(this.address, data).estimateGas(transactionOptions);
    const txData = this.indexContract.methods.callAirline(this.address, data).encodeABI();
    const transactionData = {
      nonce: await this.web3Utils.determineCurrentAddressNonce(transactionOptions.from),
      data: txData,
      from: transactionOptions.from,
      to: this.indexContract.options.address,
      gas: this.web3Utils.applyGasCoefficient(await estimate),
    };
    return {
      airline: (this: AirlineInterface),
      transactionData: transactionData,
    };
  }

  /**
   * Generates transaction data and metadata for creating new airline contract on-chain.
   * Transaction is not signed nor sent here.
   *
   * @param {TransactionOptionsInterface} options object, only `from` property is currently used, all others are ignored in this implementation
   * @return {Promise<PreparedTransactionMetadataInterface>} Transaction data and metadata, including the freshly created airline instance.
   */
  async createOnChainData (transactionOptions: TransactionOptionsInterface): Promise<PreparedTransactionMetadataInterface> {
    // Create airline on-network
    const dataUri = await this.dataUri;
    const estimate = this.indexContract.methods.registerAirline(dataUri).estimateGas(transactionOptions);
    const data = this.indexContract.methods.registerAirline(dataUri).encodeABI();
    const transactionData = {
      nonce: await this.web3Utils.determineCurrentAddressNonce(transactionOptions.from),
      data: data,
      from: transactionOptions.from,
      to: this.indexContract.options.address,
      gas: this.web3Utils.applyGasCoefficient(await estimate),
    };
    const eventCallbacks: TransactionCallbacksInterface = {
      onReceipt: (receipt: TxReceiptInterface) => {
        this.onChainDataset.markDeployed();
        if (receipt && receipt.logs) {
          let decodedLogs = this.web3Contracts.decodeLogs(receipt.logs);
          this.address = decodedLogs[0].attributes[0].value;
        }
      },
    };
    return {
      airline: (this: AirlineInterface),
      transactionData: transactionData,
      eventCallbacks: eventCallbacks,
    };
  }

  /**
   * Generates transaction data and metadata required for all airline-related data modification
   * by calling `updateRemoteData` on a `RemotelyBackedDataset`.
   *
   * @param {TransactionOptionsInterface} options object that is passed to all remote data setters
   * @throws {SmartContractInstantiationError} When the underlying contract is not yet deployed.
   * @throws {SmartContractInstantiationError} When dataUri is empty.
   * @return {Promise<Array<PreparedTransactionMetadataInterface>>} List of transaction metadata
   */
  async updateOnChainData (transactionOptions: TransactionOptionsInterface): Promise<Array<PreparedTransactionMetadataInterface>> {
    // pre-check if contract is available at all and fail fast
    await this._getContractInstance();
    // We have to clone options for each dataset as they may get modified
    // along the way
    return this.onChainDataset.updateRemoteData(Object.assign({}, transactionOptions));
  }

  /**
   * This is potentially devastating, so it's better to name
   * this operation explicitly instead of hiding it under updateOnChainData.
   *
   * Generates transaction data and metadata required for a airline ownership
   * transfer.
   *
   * @param {string} Address of a new manager
   * @param {TransactionOptionsInterface} options object, only `from` property is currently used, all others are ignored in this implementation
   * @throws {SmartContractInstantiationError} When the underlying contract is not yet deployed.
   * @return {Promise<PreparedTransactionMetadataInterface>} Transaction data and metadata, including the freshly created airline instance.
   *
   */
  async transferOnChainOwnership (newManager: string, transactionOptions: TransactionOptionsInterface): Promise<PreparedTransactionMetadataInterface> {
    if (!this.onChainDataset.isDeployed()) {
      throw new SmartContractInstantiationError('Cannot remove airline: not deployed');
    }
    const estimate = this.indexContract.methods.transferAirline(this.address, newManager).estimateGas(transactionOptions);
    const data = this.indexContract.methods.transferAirline(this.address, newManager).encodeABI();
    const transactionData = {
      nonce: await this.web3Utils.determineCurrentAddressNonce(transactionOptions.from),
      data: data,
      from: transactionOptions.from,
      to: this.indexContract.options.address,
      gas: this.web3Utils.applyGasCoefficient(await estimate),
    };
    const eventCallbacks: TransactionCallbacksInterface = {
      onReceipt: (receipt: TxReceiptInterface) => {
        this._manager = newManager;
      },
    };
    return {
      airline: (this: AirlineInterface),
      transactionData: transactionData,
      eventCallbacks: eventCallbacks,
    };
  }

  /**
   * Generates transaction data and metadata required for destroying the airline object on network.
   *
   * @param {TransactionOptionsInterface} options object, only `from` property is currently used, all others are ignored in this implementation
   * @throws {SmartContractInstantiationError} When the underlying contract is not yet deployed.
   * @return {Promise<PreparedTransactionMetadataInterface>} Transaction data and metadata, including the freshly created airline instance.
   */
  async removeOnChainData (transactionOptions: TransactionOptionsInterface): Promise<PreparedTransactionMetadataInterface> {
    if (!this.onChainDataset.isDeployed()) {
      throw new SmartContractInstantiationError('Cannot remove airline: not deployed');
    }
    const estimate = this.indexContract.methods.deleteAirline(this.address).estimateGas(transactionOptions);
    const data = this.indexContract.methods.deleteAirline(this.address).encodeABI();
    const transactionData = {
      nonce: await this.web3Utils.determineCurrentAddressNonce(transactionOptions.from),
      data: data,
      from: transactionOptions.from,
      to: this.indexContract.options.address,
      gas: this.web3Utils.applyGasCoefficient(await estimate),
    };
    const eventCallbacks: TransactionCallbacksInterface = {
      onReceipt: (receipt: TxReceiptInterface) => {
        this.onChainDataset.markObsolete();
      },
    };
    return {
      airline: (this: AirlineInterface),
      transactionData: transactionData,
      eventCallbacks: eventCallbacks,
    };
  }
}

export default OnChainAirline;
