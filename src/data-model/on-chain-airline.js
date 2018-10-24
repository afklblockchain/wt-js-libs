// @flow
import type { TransactionOptionsInterface, TransactionCallbacksInterface, PreparedTransactionMetadataInterface, TxReceiptInterface, AirlineInterface, PlainAirlineInterface, AirlineOnChainDataInterface } from '../interfaces';
import Utils from '../utils';
import Contracts from '../contracts';
import RemotelyBackedDataset from '../remotely-backed-dataset';
import StoragePointer from '../storage-pointer';

import { InputDataError, SmartContractInstantiationError } from '../errors';

/**
 * Wrapper class for a airline backed by a smart contract on
 * Ethereum that's holding its NDC `endpoint` .
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
  _endpoint: Promise<?string> | ?string;
  _manager: Promise<?string> | ?string;
  _token: Promise<?string> | ?string;

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
        _endpoint: {
          remoteGetter: async (): Promise<?string> => {
            return (await this._getContractInstance()).methods.endpoint().call();
          },
          remoteSetter: this._editInfoOnChain.bind(this),
        },
        _manager: {
          remoteGetter: async (): Promise<?string> => {
            return (await this._getContractInstance()).methods.manager().call();
          },
        },
        _token: {
          remoteGetter: async (): Promise<?string> => {
            return (await this._getContractInstance()).methods.token().call();
          },
          remoteSetter: this._editInfoOnChain.bind(this),
        },
      },
    }, this);
    this._initialized = true;
    if (this.address) {
      this.onChainDataset.markDeployed();
    }
  }

  get endpoint (): Promise<?string> | ?string {
    if (!this._initialized) {
      return;
    }
    return (async () => {
      const endpoint = await this._endpoint;
      return endpoint;
    })();
  }

  set endpoint (newEndpoint: Promise<?string> | ?string) {
    if (!newEndpoint) {
      throw new InputDataError(
        'Cannot update airline: Cannot set endpoint when it is not provided'
      );
    }
    if (typeof newEndpoint === 'string') {
      throw new InputDataError(
        'Cannot update airline: Cannot set endpoint with invalid type, must be string'
      );
    }

    this._endpoint = newEndpoint;
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

  get token (): Promise<?string> | ?string {
    if (!this._initialized) {
      return;
    }
    return (async () => {
      const token = await this._token;
      return token;
    })();
  }

  set token (newToken: Promise<?string> | ?string) {
    if (!newToken) {
      throw new InputDataError('Cannot update airline: Cannot set token to null');
    }
    if (typeof newToken === 'string') {
      throw new InputDataError(
        'Cannot update airline: Cannot set airline endpoint with invalid type, must be string'
      );
    this._token = newToken;
  }

  /**
   * Update manager and dataUri properties. dataUri can never be nulled. Manager
   * can never be nulled. Manager can be changed only for an un-deployed
   * contract (without address).
   * @param {AirlineOnChainDataInterface} newData
   */
  async setLocalData (newData: AirlineOnChainDataInterface): Promise<void> {
    const newEndpoint = await newData.endpoint;
    if (newEndpoint) {
      this.endpoint = newEndpoint;
    }
    const newManager = await newData.manager;
    if (newManager) {
      this.manager = newManager;
    }
    const newToken = await newData.token;
    if (newToken) {
      this.dataUri = newToken;
    }
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
   * @return {Promise<PreparedAirlineTransactionMetadataInterface>} resulting transaction metadata
   */
  async _editEndpointOnChain (transactionOptions: TransactionOptionsInterface): Promise<PreparedAirlineTransactionMetadataInterface> {
    const data = (await this._getContractInstance()).methods.editInfo(await this.endpoint).encodeABI();
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
   * @return {Promise<PreparedAirlineTransactionMetadataInterface>} Transaction data and metadata, including the freshly created airline instance.
   */
  async createOnChainData (transactionOptions: TransactionOptionsInterface): Promise<PreparedAirlineTransactionMetadataInterface> {
    // Create airline on-network
    const endpoint = await this.endpoint;
    const estimate = this.indexContract.methods.registerAirline(endpoint).estimateGas(transactionOptions);
    const data = this.indexContract.methods.registerAirline(endpoint).encodeABI();
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
   * @return {Promise<Array<PreparedAirlineTransactionMetadataInterface>>} List of transaction metadata
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
   * @return {Promise<PreparedAirlineTransactionMetadataInterface>} Transaction data and metadata, including the freshly created airline instance.
   *
   */
  async transferOnChainOwnership (newManager: string, transactionOptions: TransactionOptionsInterface): Promise<PreparedAirlineTransactionMetadataInterface> {
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
  async removeOnChainData (transactionOptions: TransactionOptionsInterface): Promise<PreparedAirlineTransactionMetadataInterface> {
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
