// @flow
import type { 
  WTIndexInterface, 
  PreparedTransactionMetadataInterface,
  AirlineOnChainDataInterface,
  AirlineInterface,
 } from '../interfaces';
import Utils from '../utils';
import Contracts from '../contracts';
import OnChainAirline from './on-chain-airline';

import { InputDataError, AirlineNotFoundError, AirlineNotInstantiableError, WTLibsError } from '../errors';

/**
 * Ethereum smart contract backed implementation of Winding Tree
 * index wrapper. It provides methods for working with airline
 * contracts.
 */
class WTIndex implements WTIndexInterface {
  address: string;
  web3Utils: Utils;
  web3Contracts: Contracts;
  deployedIndex: Object; // TODO get rid of Object type

  /**
   * Returns a configured instance of WTIndex
   * representing a Winding Tree index contract on a given `indexAddress`.
   */
  static createInstance (indexAddress: string, web3Utils: Utils, web3Contracts: Contracts): WTIndex {
    return new WTIndex(indexAddress, web3Utils, web3Contracts);
  }

  constructor (indexAddress: string, web3Utils: Utils, web3Contracts: Contracts) {
    this.address = indexAddress;
    this.web3Utils = web3Utils;
    this.web3Contracts = web3Contracts;
  }

  async _getDeployedIndex (): Promise<Object> {
    if (!this.deployedIndex) {
      this.deployedIndex = await this.web3Contracts.getIndexInstance(this.address);
    }
    return this.deployedIndex;
  }

  async _createAirlineInstance (address?: string): Promise<AirlineInterface> {
    return OnChainAirline.createInstance(this.web3Utils, this.web3Contracts, await this._getDeployedIndex(), address);
  }

  /**
   * Generates transaction data required for adding a totally new airline
   * and more metadata required for sucessful mining of that transaction.
   * Does not sign or send the transaction.
   *
   * @throws {InputDataError} When airlineData does not contain dataUri property.
   * @throws {InputDataError} When airlineData does not contain a manager property.
   * @throws {WTLibsError} When anything goes wrong during data preparation phase.
   */
  async addAirline (airlineData: AirlineOnChainDataInterface): Promise<PreparedTransactionMetadataInterface> {
    if (!await airlineData.dataUri) {
      throw new InputDataError('Cannot add airline: Missing dataUri');
    }
    const airlineManager = await airlineData.manager;
    if (!airlineManager) {
      throw new InputDataError('Cannot add airline: Missing manager');
    }
    const airline: AirlineInterface = await this._createAirlineInstance();
    await airline.setLocalData(airlineData);
    return airline.createOnChainData({
      from: airlineManager,
    }).catch((err) => {
      throw new WTLibsError('Cannot add airline: ' + err.message, err);
    });
  }

  /**
   * Generates a list of transaction data required for updating a airline
   * and more metadata required for sucessful mining of those transactions.
   * Does not sign or send any of the transactions.
   *
   * @throws {InputDataError} When airline does not have a manager field.
   * @throws {InputDataError} When airline does not contain a manager property.
   * @throws {WTLibsError} When anything goes wrong during data preparation phase.
   */
  async updateAirline (airline: AirlineInterface): Promise<Array<PreparedTransactionMetadataInterface>> {
    if (!airline.address) {
      throw new InputDataError('Cannot update airline without address.');
    }
    const airlineManager = await airline.manager;
    if (!airlineManager) {
      throw new InputDataError('Cannot update airline without manager.');
    }
    return airline.updateOnChainData({
      from: airlineManager,
    }).catch((err) => {
      throw new WTLibsError('Cannot update airline:' + err.message, err);
    });
  }

  /**
   * Generates transaction data required for removing a airline
   * and more metadata required for successful mining of that transaction.
   * Does not sign or send the transaction.
   *
   * @throws {InputDataError} When airline does not contain dataUri property.
   * @throws {InputDataError} When airline does not contain a manager property.
   * @throws {WTLibsError} When anything goes wrong during data preparation phase.
   */
  async removeAirline (airline: AirlineInterface): Promise<PreparedTransactionMetadataInterface> {
    if (!airline.address) {
      throw new InputDataError('Cannot remove airline without address.');
    }
    const airlineManager = await airline.manager;
    if (!airlineManager) {
      throw new InputDataError('Cannot remove airline without manager.');
    }
    return airline.removeOnChainData({
      from: airlineManager,
    }).catch((err) => {
      // invalid opcode -> non-existent airline
      // invalid opcode -> failed check for manager
      throw new WTLibsError('Cannot remove airline: ' + err.message, err);
    });
  }

  /**
   * Generates transaction data required for transferring a airline
   * ownership and more metadata required for successful mining of that
   * transactoin. Does not sign or send the transaction.
   *
   * @throws {InputDataError} When airline does not have an address.
   * @throws {InputDataError} When airline does not contain a manager property.
   * @throws {InputDataError} When the new manager address is the same as the old manager.
   * @throws {InputDataError} When the new manager address is not a valid address.
   * @throws {WTLibsError} When anything goes wrong during data preparation phase.
   */
  async transferAirlineOwnership (airline: AirlineInterface, newManager: string): Promise<PreparedTransactionMetadataInterface> {
    if (!airline.address) {
      throw new InputDataError('Cannot transfer airline without address.');
    }
    const airlineManager = await airline.manager;
    if (!airlineManager) {
      throw new InputDataError('Cannot transfer airline without manager.');
    }

    if (airlineManager.toLowerCase() === newManager.toLowerCase()) {
      throw new InputDataError('Cannot transfer airline to the same manager.');
    }

    if (this.web3Utils.isZeroAddress(newManager)) {
      throw new InputDataError('Cannot transfer airline to an invalid newManager address.');
    }

    return airline.transferOnChainOwnership(newManager, {
      from: airlineManager,
    }).catch((err) => {
      // invalid opcode -> non-existent airline
      // invalid opcode -> failed check for manager
      throw new WTLibsError('Cannot transfer airline: ' + err.message, err);
    });
  }

  /**
   * Gets airline representation of a airline on a given address. If airline
   * on such address is not registered through this Winding Tree index
   * instance, the method throws immediately.
   *
   * @throws {AirlineNotFoundError} When airline does not exist.
   * @throws {AirlineNotInstantiableError} When the airline class cannot be constructed.
   * @throws {WTLibsError} When something breaks in the network communication.
   */
  async getAirline (address: string): Promise<?AirlineInterface> {
    const index = await this._getDeployedIndex();
    let airlineIndex;
    try {
      // This returns strings
      airlineIndex = parseInt(await index.methods.airlinesIndex(address).call(), 10);
    } catch (err) {
      throw new WTLibsError('Cannot find airline at ' + address + ': ' + err.message, err);
    }
    // Zeroeth position is reserved as empty during index deployment
    if (!airlineIndex) {
      throw new AirlineNotFoundError(`Cannot find airline at ${address}: Not found in airline list`);
    } else {
      return this._createAirlineInstance(address).catch((err) => {
        throw new AirlineNotInstantiableError('Cannot find airline at ' + address + ': ' + err.message, err);
      });
    }
  }

  /**
   * Returns a list of all airlines. It will filter out
   * every airline that is inaccessible for any reason.
   *
   * Currently any inaccessible airline is silently ignored.
   * Subject to change.
   */
  async getAllAirlines(): Promise<Array<AirlineInterface>> {
    const index = await this._getDeployedIndex();
    const airlinesAddressList = await index.methods.getAirlines().call();
    let getAirlineDetails = airlinesAddressList
      // Filtering null addresses beforehand improves efficiency
      .filter((addr: string): boolean => !this.web3Utils.isZeroAddress(addr))
      .map((addr: string): Promise<?AirlineInterface> => {
        return this.getAirline(addr) // eslint-disable-line promise/no-nesting
          // We don't really care why the airline is inaccessible
          // and we need to catch exceptions here on each individual airline
          .catch((err: Error): null => { // eslint-disable-line
            return null;
          });
      });
    const airlineDetails: Array<?AirlineInterface> = await (Promise.all(getAirlineDetails): any); // eslint-disable-line flowtype/no-weak-types
    const airlineList: Array<AirlineInterface> = (airlineDetails.filter((a: ?AirlineInterface): boolean => a != null): any); // eslint-disable-line flowtype/no-weak-types
    return airlineList;
  }
}

export default WTIndex;
