// @flow
import type { 
  WTIndexInterface, 
  HotelOnChainDataInterface, 
  HotelInterface, 
  PreparedTransactionMetadataInterface,
  AirlineOnChainDataInterface,
  AirlineInterface,
  PreparedAirlineTransactionMetadataInterface
 } from '../interfaces';
import Utils from '../utils';
import Contracts from '../contracts';
import OnChainHotel from './on-chain-hotel';

import { InputDataError, HotelNotFoundError, HotelNotInstantiableError, WTLibsError } from '../errors';

/**
 * Ethereum smart contract backed implementation of Winding Tree
 * index wrapper. It provides methods for working with hotel
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

  async _createHotelInstance (address?: string): Promise<HotelInterface> {
    return OnChainHotel.createInstance(this.web3Utils, this.web3Contracts, await this._getDeployedIndex(), address);
  }

  /**
   * Generates transaction data required for adding a totally new hotel
   * and more metadata required for sucessful mining of that transaction.
   * Does not sign or send the transaction.
   *
   * @throws {InputDataError} When hotelData does not contain dataUri property.
   * @throws {InputDataError} When hotelData does not contain a manager property.
   * @throws {WTLibsError} When anything goes wrong during data preparation phase.
   */
  async addHotel (hotelData: HotelOnChainDataInterface): Promise<PreparedTransactionMetadataInterface> {
    if (!await hotelData.dataUri) {
      throw new InputDataError('Cannot add hotel: Missing dataUri');
    }
    const hotelManager = await hotelData.manager;
    if (!hotelManager) {
      throw new InputDataError('Cannot add hotel: Missing manager');
    }
    const hotel: HotelInterface = await this._createHotelInstance();
    await hotel.setLocalData(hotelData);
    return hotel.createOnChainData({
      from: hotelManager,
    }).catch((err) => {
      throw new WTLibsError('Cannot add hotel: ' + err.message, err);
    });
  }

  /**
   * Generates a list of transaction data required for updating a hotel
   * and more metadata required for sucessful mining of those transactions.
   * Does not sign or send any of the transactions.
   *
   * @throws {InputDataError} When hotel does not have a manager field.
   * @throws {InputDataError} When hotel does not contain a manager property.
   * @throws {WTLibsError} When anything goes wrong during data preparation phase.
   */
  async updateHotel (hotel: HotelInterface): Promise<Array<PreparedTransactionMetadataInterface>> {
    if (!hotel.address) {
      throw new InputDataError('Cannot update hotel without address.');
    }
    const hotelManager = await hotel.manager;
    if (!hotelManager) {
      throw new InputDataError('Cannot update hotel without manager.');
    }
    return hotel.updateOnChainData({
      from: hotelManager,
    }).catch((err) => {
      throw new WTLibsError('Cannot update hotel:' + err.message, err);
    });
  }

  /**
   * Generates transaction data required for removing a hotel
   * and more metadata required for successful mining of that transaction.
   * Does not sign or send the transaction.
   *
   * @throws {InputDataError} When hotel does not contain dataUri property.
   * @throws {InputDataError} When hotel does not contain a manager property.
   * @throws {WTLibsError} When anything goes wrong during data preparation phase.
   */
  async removeHotel (hotel: HotelInterface): Promise<PreparedTransactionMetadataInterface> {
    if (!hotel.address) {
      throw new InputDataError('Cannot remove hotel without address.');
    }
    const hotelManager = await hotel.manager;
    if (!hotelManager) {
      throw new InputDataError('Cannot remove hotel without manager.');
    }
    return hotel.removeOnChainData({
      from: hotelManager,
    }).catch((err) => {
      // invalid opcode -> non-existent hotel
      // invalid opcode -> failed check for manager
      throw new WTLibsError('Cannot remove hotel: ' + err.message, err);
    });
  }

  /**
   * Generates transaction data required for transferring a hotel
   * ownership and more metadata required for successful mining of that
   * transactoin. Does not sign or send the transaction.
   *
   * @throws {InputDataError} When hotel does not have an address.
   * @throws {InputDataError} When hotel does not contain a manager property.
   * @throws {InputDataError} When the new manager address is the same as the old manager.
   * @throws {InputDataError} When the new manager address is not a valid address.
   * @throws {WTLibsError} When anything goes wrong during data preparation phase.
   */
  async transferHotelOwnership (hotel: HotelInterface, newManager: string): Promise<PreparedTransactionMetadataInterface> {
    if (!hotel.address) {
      throw new InputDataError('Cannot transfer hotel without address.');
    }
    const hotelManager = await hotel.manager;
    if (!hotelManager) {
      throw new InputDataError('Cannot transfer hotel without manager.');
    }

    if (hotelManager.toLowerCase() === newManager.toLowerCase()) {
      throw new InputDataError('Cannot transfer hotel to the same manager.');
    }

    if (this.web3Utils.isZeroAddress(newManager)) {
      throw new InputDataError('Cannot transfer hotel to an invalid newManager address.');
    }

    return hotel.transferOnChainOwnership(newManager, {
      from: hotelManager,
    }).catch((err) => {
      // invalid opcode -> non-existent hotel
      // invalid opcode -> failed check for manager
      throw new WTLibsError('Cannot transfer hotel: ' + err.message, err);
    });
  }

  /**
   * Gets hotel representation of a hotel on a given address. If hotel
   * on such address is not registered through this Winding Tree index
   * instance, the method throws immediately.
   *
   * @throws {HotelNotFoundError} When hotel does not exist.
   * @throws {HotelNotInstantiableError} When the hotel class cannot be constructed.
   * @throws {WTLibsError} When something breaks in the network communication.
   */
  async getHotel (address: string): Promise<?HotelInterface> {
    const index = await this._getDeployedIndex();
    let hotelIndex;
    try {
      // This returns strings
      hotelIndex = parseInt(await index.methods.hotelsIndex(address).call(), 10);
    } catch (err) {
      throw new WTLibsError('Cannot find hotel at ' + address + ': ' + err.message, err);
    }
    // Zeroeth position is reserved as empty during index deployment
    if (!hotelIndex) {
      throw new HotelNotFoundError(`Cannot find hotel at ${address}: Not found in hotel list`);
    } else {
      return this._createHotelInstance(address).catch((err) => {
        throw new HotelNotInstantiableError('Cannot find hotel at ' + address + ': ' + err.message, err);
      });
    }
  }

  /**
   * Returns a list of all hotels. It will filter out
   * every hotel that is inaccessible for any reason.
   *
   * Currently any inaccessible hotel is silently ignored.
   * Subject to change.
   */
  async getAllHotels (): Promise<Array<HotelInterface>> {
    const index = await this._getDeployedIndex();
    const hotelsAddressList = await index.methods.getHotels().call();
    let getHotelDetails = hotelsAddressList
      // Filtering null addresses beforehand improves efficiency
      .filter((addr: string): boolean => !this.web3Utils.isZeroAddress(addr))
      .map((addr: string): Promise<?HotelInterface> => {
        return this.getHotel(addr) // eslint-disable-line promise/no-nesting
          // We don't really care why the hotel is inaccessible
          // and we need to catch exceptions here on each individual hotel
          .catch((err: Error): null => { // eslint-disable-line
            return null;
          });
      });
    const hotelDetails: Array<?HotelInterface> = await (Promise.all(getHotelDetails): any); // eslint-disable-line flowtype/no-weak-types
    const hotelList: Array<HotelInterface> = (hotelDetails.filter((a: ?HotelInterface): boolean => a != null): any); // eslint-disable-line flowtype/no-weak-types
    return hotelList;
  }
}

export default WTIndex;
