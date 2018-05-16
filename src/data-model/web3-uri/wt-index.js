// @flow
import type { WTIndexInterface, HotelInterface, RemoteHotelInterface, AddHotelResponseInterface, WalletInterface } from '../../interfaces';
import Utils from './common/utils';
import Contracts from './common/contracts';
import HotelProviderFactory from './hotel-provider-factory';

/**
 * Ethereum smart contract backed implementation of Winding Tree
 * index wrapper. It provides methods for working with hotel
 * contracts. It cand decide by itself where it should look for
 * off-chain hotel data based on the protocol in hotel's `url` field.
 *
 * Supported protocols:
 *
 *   - json: `json://some-hash` - Looks up hotel data in in-memory storage under some-hash key
 */
class Web3UriWTIndexDataProvider implements WTIndexInterface {
  address: string;
  web3Utils: Utils;
  web3Contracts: Contracts;
  deployedIndex: Object; // TODO get rid of Object type
  hotelProviderFactory: HotelProviderFactory;

  /**
   * Returns a configured instance of Web3UriWTIndexDataProvider
   * representing a Winding Tree index contract on a given `address`.
   */
  static async createInstance (indexAddress: string, web3Utils: Utils, web3Contracts: Contracts, defaultDataStorage: string = 'json'): Promise<Web3UriWTIndexDataProvider> {
    return new Web3UriWTIndexDataProvider(indexAddress, web3Utils, web3Contracts, defaultDataStorage);
  }

  constructor (indexAddress: string, web3Utils: Utils, web3Contracts: Contracts, defaultDataStorage: string) {
    this.address = indexAddress;
    this.web3Utils = web3Utils;
    this.web3Contracts = web3Contracts;
    this.hotelProviderFactory = HotelProviderFactory.createInstance(defaultDataStorage, this.web3Utils, this.web3Contracts);
  }

  async __getDeployedIndex (): Promise<Object> {
    if (!this.deployedIndex) {
      this.deployedIndex = await this.web3Contracts.getIndexInstance(this.address);
    }
    return this.deployedIndex;
  }

  async __createHotelInstance (address?: string): Promise<RemoteHotelInterface> {
    return this.hotelProviderFactory.getHotelInstance(await this.__getDeployedIndex(), address);
  }

  /**
   * Adds a totally new hotel on chain. Does not wait for the transactions
   * to be mined, but as fast as possible returns a list of transaction IDs
   * and the new hotel on chain address. The new hotel uses `defaultDataStorage`
   * for storing information off-chain.
   *
   * @throws {Error} When anything goes wrong.
   */
  async addHotel (wallet: WalletInterface, hotelData: HotelInterface): Promise<AddHotelResponseInterface> {
    try {
      const hotel = await this.__createHotelInstance();
      await hotel.setLocalData(hotelData);
      const transactionIds = await hotel.createOnNetwork(wallet, {
        from: hotelData.manager,
        to: this.address,
      });
      return {
        address: await hotel.address,
        transactionIds: transactionIds,
      };
    } catch (err) {
      throw new Error('Cannot add hotel: ' + err.message);
    }
  }

  /**
   * Updates a hotel on chain. Does not wait for the transactions
   * to be mined, but as fast as possible returns a list of transaction
   * IDs so you can keep track of the progress.
   *
   * @throws {Error} When anything goes wrong.
   */
  async updateHotel (wallet: WalletInterface, hotel: HotelInterface): Promise<Array<string>> {
    try {
      // We need to separate calls to be able to properly catch exceptions
      const updatedHotel = await ((hotel: any): RemoteHotelInterface).updateOnNetwork(wallet, { // eslint-disable-line flowtype/no-weak-types
        from: await hotel.manager,
        to: this.address,
      });
      return updatedHotel;
    } catch (err) {
      throw new Error('Cannot update hotel:' + err.message);
    }
  }

  /**
   * Removes the hotel from chain. Does not wait for the transaction
   * to be mined, but as fast as possible returns a list of transaction
   * IDs so you can keep track of the progress.
   *
   * @throws {Error} When anything goes wrong such as
   *   - hotel does not exist
   *   - hotel does not belong to the calling manager
   *   - not enough gas
   */
  async removeHotel (wallet: WalletInterface, hotel: HotelInterface): Promise<Array<string>> {
    try {
      // We need to separate calls to be able to properly catch exceptions
      const result = await ((hotel: any): RemoteHotelInterface).removeFromNetwork(wallet, { // eslint-disable-line flowtype/no-weak-types
        from: await hotel.manager,
        to: this.address,
      });
      return result;
    } catch (err) {
      // invalid opcode -> non-existent hotel
      // invalid opcode -> failed check for manager
      throw new Error('Cannot remove hotel: ' + err.message);
    }
  }

  /**
   * Gets hotel representation of a hotel on a given address. If hotel
   * on such address is not registered through this Winding Tree index
   * instance, the method throws immediately.
   *
   * @throws {Error} When hotel does not exist.
   * @throws {Error} When schema cannot be detected from the hotel's `url` field.
   * @throws {Error} When something breaks in the network communication.
   */
  async getHotel (address: string): Promise<?HotelInterface> {
    const index = await this.__getDeployedIndex();
    try {
      // This returns strings
      const hotelIndex = parseInt(await index.methods.hotelsIndex(address).call(), 10);
      // Zeroeth position is reserved as empty during index deployment
      if (!hotelIndex) {
        throw new Error('Not found in hotel list');
      } else {
        return this.__createHotelInstance(address);
      }
    } catch (err) {
      throw new Error('Cannot find hotel at ' + address + ': ' + err.message);
    }
  }

  /**
   * Returns a list of all hotels. It will filter out
   * all inaccessible hotels.
   */
  async getAllHotels (): Promise<Array<HotelInterface>> {
    const index = await this.__getDeployedIndex();
    const hotelsAddressList = await index.methods.getHotels().call();
    let getHotelDetails = hotelsAddressList
      // Filtering null addresses beforehand improves efficiency
      .filter((addr: string): boolean => !this.web3Utils.isZeroAddress(addr))
      .map((addr: string): Promise<?HotelInterface> => {
        return this.getHotel(addr) // eslint-disable-line promise/no-nesting
          // We don't really care why the hotel is inaccessible
          // and we need to catch exceptions here on each individual hotel
          .catch((err: Error): null => {
            // TODO optional logging
            if (err) {}
            return null;
          });
      });
    const hotelDetails: Array<?HotelInterface> = await (Promise.all(getHotelDetails): any); // eslint-disable-line flowtype/no-weak-types
    const hotelList: Array<HotelInterface> = (hotelDetails.filter((a: ?HotelInterface): boolean => a != null): any); // eslint-disable-line flowtype/no-weak-types
    return hotelList;
  }
}

export default Web3UriWTIndexDataProvider;