import WTIndexContractMetadata from '@windingtree/wt-contracts/build/contracts/AbstractWTIndex.json';
import HotelContractMetadata from '@windingtree/wt-contracts/build/contracts/AbstractHotel.json';
import { SmartContractInstantiationError } from './errors';
import AirlineContractMetadata from '';

/**
 * Wrapper class for work with Winding Tree's Ethereum
 * smart contracts.
 */
class Contracts {
  /**
   * Returns an initialized instance
   *
   * @param  {Web3} web3 instance created by `new Web3(provider)`
   * @return {Contracts}
   */
  static createInstance (web3) {
    return new Contracts(web3);
  }

  constructor (web3) {
    this.web3 = web3;
  }

  /**
   * Generic method for getting an instance of `web3.eth.Contract`
   *
   * @param  {string} name of contract, used in errors
   * @param  {Object} abi specification of contract
   * @param  {string} address on which we should look for the contract
   * @throws {SmartContractInstantiationError} When address is invalid
   * @throws {SmartContractInstantiationError} When no code is deployed on given address
   * @return {web3.eth.Contract} Resulting wrapper contract
   */
  async _getInstance (name, abi, address) {
    if (!this.web3.utils.isAddress(address)) {
      throw new SmartContractInstantiationError('Cannot get ' + name + ' instance at an invalid address ' + address);
    }
    const deployedCode = await this.web3.eth.getCode(address);
    if (deployedCode === '0x0') {
      throw new SmartContractInstantiationError('Cannot get ' + name + ' instance at an address with no code on ' + address);
    }
    return new this.web3.eth.Contract(abi, address);
  }

  /**
   * Returns a representation of <a href="https://github.com/windingtree/wt-contracts/blob/v0.2.0/contracts/WTIndex.sol">WTIndex.sol</a>.
   *
   * @param  {string} address
   * @return {web3.eth.Contract} Instance of an Index
   */
  async getIndexInstance (address) {
    return this._getInstance('index', WTIndexContractMetadata.abi, address);
  }

  /**
   * Returns a representation of <a href="https://github.com/windingtree/wt-contracts/blob/v0.2.0/contracts/hotel/Hotel.sol">Hotel.sol</a>.
   *
   * @param  {string} address
   * @return {web3.eth.Contract} Instance of a Hotel
   */
  async getHotelInstance (address) {
    return this._getInstance('hotel', HotelContractMetadata.abi, address);
  }

    /**
     * TODO
   * Returns a representation of <a href="airline.sol">Airline.sol</a>.
   *
   * @param  {string} address
   * @return {web3.eth.Contract} Instance of an Airline
   */
  async getAirlineInstance (address) {
    return this._getInstance('airline', AirlineContractMetadata.abi, address);
  }

  _initEventRegistry () {
    function generateEventSignatures (abi, web3) {
      const events = abi.filter((m) => m.type === 'event');
      let indexedEvents = {};
      for (let event of events) {
        // kudos https://github.com/ConsenSys/abi-decoder/blob/master/index.js#L19
        const signature = web3.utils.sha3(event.name + '(' + event.inputs.map(function (input) { return input.type; }).join(',') + ')');
        indexedEvents[signature] = event;
      }
      return indexedEvents;
    }
    if (!this.eventRegistry) {
      this.eventRegistry = Object.assign(
        {},
        generateEventSignatures(WTIndexContractMetadata.abi, this.web3),
        generateEventSignatures(HotelContractMetadata.abi, this.web3),
        generateEventSignatures(AirlineContractMetadata.abi, this.web3)
      );
    }
    return this.eventRegistry;
  }

  /**
   * Decodes ethereum transaction log values. Currently supports
   * events from Index, Airline or Hotel smart contracts.
   *
   * @param  {Array<RawLogRecordInterface>} logs in a raw format
   * @return {Array<DecodedLogRecordInterface>} Decoded logs
   */
  decodeLogs (logs) {
    const result = [];
    const eventRegistry = this._initEventRegistry();
    for (let log of logs) {
      if (log.topics && log.topics[0] && eventRegistry[log.topics[0]]) {
        const eventAbi = eventRegistry[log.topics[0]];
        let topics = log.topics;
        // @see https://web3js.readthedocs.io/en/1.0/web3-eth-abi.html#id22
        if (!eventAbi.anonymous) {
          topics = log.topics.slice(1);
        }
        const decoded = this.web3.eth.abi.decodeLog(eventAbi.inputs, log.data, topics);
        let parsedAttributes = eventAbi.inputs.map((input) => {
          return {
            name: input.name,
            type: input.type,
            value: decoded[input.name],
          };
        });
        result.push({
          event: eventAbi.name,
          address: log.address,
          attributes: parsedAttributes,
        });
      }
    }
    return result;
  }
}
export default Contracts;
