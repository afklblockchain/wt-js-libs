import { assert } from 'chai';
import sinon from 'sinon';
import WTIndexDataProvider from '../../../src/data-model/wt-index';
import Web3UriDataModel from '../../../src/data-model/';
import testedDataModel from '../../utils/data-model-definition';

import { SmartContractInstantiationError, AirlineNotInstantiableError, AirlineNotFoundError, WTLibsError, RemoteDataReadError, InputDataError } from '../../../src/errors';

describe('WTLibs.data-models.WTIndexDataProvider', () => {
  let dataModel, indexDataProvider;

  beforeEach(async function () {
    dataModel = Web3UriDataModel.createInstance(testedDataModel.withDataSource().dataModelOptions);
    indexDataProvider = dataModel.getWindingTreeIndex(testedDataModel.indexAddress);
  });

  it('should throw when we want index from a bad address', async () => {
    const customIndexDataProvider = WTIndexDataProvider.createInstance('0x96eA4BbF71FEa3c9411C1Cefc555E9d7189695fA', dataModel.web3Utils, dataModel.web3Contracts);
    try {
      await customIndexDataProvider._getDeployedIndex();
      throw new Error('should not have been called');
    } catch (e) {
      assert.match(e.message, /cannot get index instance/i);
      assert.instanceOf(e, SmartContractInstantiationError);
    }
  });

  describe('getAirline', () => {
    it('should throw if address is malformed', async () => {
      try {
        await indexDataProvider.getAirline('random-address');
        throw new Error('should not have been called');
      } catch (e) {
        assert.match(e.message, /cannot find airline/i);
        assert.instanceOf(e, WTLibsError);
      }
    });

    it('should throw if no airline exists on that address', async () => {
      try {
        await indexDataProvider.getAirline('0x96eA4BbF71FEa3c9411C1Cefc555E9d7189695fA');
        throw new Error('should not have been called');
      } catch (e) {
        assert.match(e.message, /cannot find airline/i);
        assert.instanceOf(e, AirlineNotFoundError);
      }
    });

    it('should throw if airline contract cannot be instantiated', async () => {
      try {
        sinon.stub(indexDataProvider, '_createAirlineInstance').rejects();
        await indexDataProvider.getAirline('0xbf18b616ac81830dd0c5d4b771f22fd8144fe769');
        throw new Error('should not have been called');
      } catch (e) {
        assert.match(e.message, /cannot find airline/i);
        assert.instanceOf(e, AirlineNotInstantiableError);
      } finally {
        indexDataProvider._createAirlineInstance.restore();
      }
    });

    it('should throw if accessing off-chain data without resolved on-chain pointer and on-chain pointer cannot be downloaded', async () => {
      // pre-heat the contract so we can stub it later
      await indexDataProvider._getDeployedIndex();
      sinon.stub(indexDataProvider.deployedIndex.methods, 'airlinesIndex').returns({
        call: sinon.stub().resolves('7'),
      });
      // There is not a valid airline on this address
      const address = '0x994afd347b160be3973b41f0a144819496d175e9';
      const airline = await indexDataProvider.getAirline(address);
      
      try {
        await airline.dataIndex;
        throw new Error('should not have been called');
      } catch (e) {
        assert.match(e.message, /cannot sync remote data/i);
        assert.instanceOf(e, RemoteDataReadError);
      } finally {
        indexDataProvider.deployedIndex.methods.airlinesIndex.restore();
      }
    });
  });

  describe('addAirline', () => {
    it('should throw generic error when something does not work during tx data preparation', async () => {
      try {
        sinon.stub(indexDataProvider, '_createAirlineInstance').resolves({
          setLocalData: sinon.stub().resolves(),
          createOnChainData: sinon.stub().rejects(),
        });
        await indexDataProvider.addAirline({ manager: 'b', dataUri: 'aaa' });
        throw new Error('should not have been called');
      } catch (e) {
        assert.match(e.message, /cannot add airline/i);
        assert.instanceOf(e, WTLibsError);
      }
    });
  });

  describe('updateAirline', () => {
    it('should throw generic error when something does not work during tx data preparation', async () => {
      try {
        const airline = await indexDataProvider.getAirline('0xbf18b616ac81830dd0c5d4b771f22fd8144fe769');
        sinon.stub(airline, 'updateOnChainData').rejects('some original error');
        await indexDataProvider.updateAirline(airline);
        throw new Error('should not have been called');
      } catch (e) {
        assert.match(e.message, /cannot update airline/i);
        assert.instanceOf(e, WTLibsError);
        assert.isDefined(e.originalError);
        assert.equal(e.originalError.name, 'some original error');
      }
    });
  });

  describe('transferAirlineOwnership', () => {
    it('should throw generic error when something does not work during tx data preparation', async () => {
      try {
        const airline = await indexDataProvider.getAirline('0xbf18b616ac81830dd0c5d4b771f22fd8144fe769');
        sinon.stub(airline, 'transferOnChainOwnership').rejects('some original error');
        await indexDataProvider.transferAirlineOwnership(airline, '0xbf18b616ac81830dd0c5d4b771f22fd8144fe769');
        throw new Error('should not have been called');
      } catch (e) {
        assert.match(e.message, /cannot transfer airline/i);
        assert.instanceOf(e, WTLibsError);
        assert.isDefined(e.originalError);
        assert.equal(e.originalError.name, 'some original error');
      }
    });

    it('should throw when trying to transfer to an invalid address', async () => {
      try {
        const airline = await indexDataProvider.getAirline('0xbf18b616ac81830dd0c5d4b771f22fd8144fe769');
        await indexDataProvider.transferAirlineOwnership(airline, 'random-string-that-is-not-address');
        throw new Error('should not have been called');
      } catch (e) {
        assert.match(e.message, /cannot transfer airline/i);
        assert.instanceOf(e, InputDataError);
      }
    });

    it('should throw when trying to transfer a airline without a manager', async () => {
      try {
        const airline = await indexDataProvider.getAirline('0xbf18b616ac81830dd0c5d4b771f22fd8144fe769');
        airline._manager = null;
        await indexDataProvider.transferAirlineOwnership(airline, '0xbf18b616ac81830dd0c5d4b771f22fd8144fe769');
        throw new Error('should not have been called');
      } catch (e) {
        assert.match(e.message, /cannot transfer airline/i);
        assert.instanceOf(e, InputDataError);
      }
    });

    it('should throw when transferring to the same manager', async () => {
      try {
        const airline = await indexDataProvider.getAirline('0xbf18b616ac81830dd0c5d4b771f22fd8144fe769');
        await indexDataProvider.transferAirlineOwnership(airline, await airline.manager);
        throw new Error('should not have been called');
      } catch (e) {
        assert.match(e.message, /cannot transfer airline/i);
        assert.match(e.message, /same manager/i);
        assert.instanceOf(e, InputDataError);
      }
    });
  });

  describe('removeAirline', () => {
    it('should throw generic error when something does not work during tx data preparation', async () => {
      try {
        const airline = await indexDataProvider.getAirline('0xbf18b616ac81830dd0c5d4b771f22fd8144fe769');
        sinon.stub(airline, 'removeOnChainData').rejects();
        await indexDataProvider.removeAirline(airline);
        throw new Error('should not have been called');
      } catch (e) {
        assert.match(e.message, /cannot remove airline/i);
        assert.instanceOf(e, WTLibsError);
      }
    });

    it('should throw error when trying to remove a airline without manager', async () => {
      try {
        const airline = await indexDataProvider.getAirline('0xbf18b616ac81830dd0c5d4b771f22fd8144fe769');
        airline._manager = null;
        await indexDataProvider.removeAirline(airline);
        throw new Error('should not have been called');
      } catch (e) {
        assert.match(e.message, /cannot remove airline/i);
        assert.instanceOf(e, WTLibsError);
      }
    });
  });

  describe('getAllAirlines', () => {
    it('should not panic when one of many airlines is missing on-chain', async () => {
      // pre-heat the contract so we can stub it later
      await indexDataProvider._getDeployedIndex();
      const getAirlineSpy = sinon.spy(indexDataProvider, 'getAirline');
      sinon.stub(indexDataProvider.deployedIndex.methods, 'getAirlines').returns({
        call: sinon.stub().resolves([
          '0x0000000000000000000000000000000000000000', // This is an empty address
          '0xBF18B616aC81830dd0C5D4b771F22FD8144fe769',
          '0x96eA4BbF71FEa3c9411C1Cefc555E9d7189695fA', // This is not an address of a airline
        ]),
      });
      const airlines = await indexDataProvider.getAllAirlines();
      // Attempting to get two hotels for two valid addresses
      assert.equal(getAirlineSpy.callCount, 2);
      // But we know there's only one actual hotel
      assert.equal(airlines.length, 1);
      indexDataProvider.deployedIndex.methods.getAirlines.restore();
      getAirlineSpy.restore();
    });
  });
});
