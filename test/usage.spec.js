import { assert } from 'chai';
import WTLibs from '../src/index';
import jsonWallet from './utils/test-wallet';
import jsonWallet2 from './utils/test-wallet-2';
import testedDataModel from './utils/data-model-definition';
import OffChainDataClient from '../src/off-chain-data-client';

import { InputDataError, WTLibsError } from '../src/errors';

describe('WTLibs usage', () => {
  let libs, wallet, index, emptyIndex, minedTxHashes = [],
    airlineManager = '0xD39Ca7d186a37bb6Bf48AE8abFeB4c687dc8F906';

  beforeEach(() => {
    libs = WTLibs.createInstance(testedDataModel.withDataSource());
    index = libs.getWTIndex(testedDataModel.indexAddress);
    wallet = libs.createWallet(jsonWallet);
    emptyIndex = libs.getWTIndex(testedDataModel.emptyIndexAddress);
    wallet.unlock('test123');
  });

  afterEach(() => {
    wallet.destroy();
    OffChainDataClient._reset();
  });

  describe('addAirline', () => {
    it('should add airline', async () => {
      const jsonClient = libs.getOffChainDataClient('in-memory');
      const descUrl = await jsonClient.upload({
        name: 'Premium airline',
        description: 'Great airline',
        location: {
          latitude: 'lat',
          longitude: 'long',
        },
      });
      const dataUri = await jsonClient.upload({
        descriptionUri: descUrl,
      });
      const createAirline = await index.addAirline({
        manager: airlineManager,
        dataUri: dataUri,
      });
      const airline = createAirline.airline;
      const result = await wallet.signAndSendTransaction(createAirline.transactionData, createAirline.eventCallbacks);

      assert.isDefined(result);
      assert.isDefined(airline.address);
      assert.isDefined(result.transactionHash);

      // Prepare getTransactionsStatus test
      minedTxHashes.push(result.transactionHash);
      // Don't bother with checksummed address format
      assert.equal((await airline.manager), airlineManager);
      assert.equal((await airline.dataUri).toLowerCase(), dataUri);
      const dataIndex = await airline.dataIndex;
      const description = (await dataIndex.contents).descriptionUri;
      assert.equal((await description.contents).name, 'Premium airline');

      // We're removing the airline to ensure clean slate after this test is run.
      // It is too possibly expensive to re-set on-chain WTIndex after each test.
      const removeAirline = await index.removeAirline(airline);
      const removalResult = await wallet.signAndSendTransaction(removeAirline.transactionData, removeAirline.eventCallbacks);
      const removalTxResults = await libs.getTransactionsStatus([removalResult.transactionHash]);
      assert.equal(removalTxResults.meta.allPassed, true);
    });

    it('should throw when airline does not have a manager', async () => {
      try {
        await index.addAirline({
          dataUri: 'in-memory://some-data-hash',
        });
        throw new Error('should not have been called');
      } catch (e) {
        assert.match(e.message, /cannot add airline/i);
        assert.instanceOf(e, InputDataError);
      }
    });

    it('should throw when airline does not have a dataUri', async () => {
      try {
        await index.addAirline({
          manager: airlineManager,
        });
        throw new Error('should not have been called');
      } catch (e) {
        assert.match(e.message, /cannot add airline/i);
        assert.instanceOf(e, InputDataError);
      }
    });
  });

  describe('removeAirline', () => {
    it('should remove airline', async () => {
      const manager = airlineManager;
      const createAirline = await index.addAirline({
        dataUri: 'in-memory://some-data-hash',
        manager: manager,
      });
      const origAirline = createAirline.airline;
      await wallet.signAndSendTransaction(createAirline.transactionData, createAirline.eventCallbacks);
      assert.isDefined(origAirline.address);

      // Verify that it has been added
      let list = (await index.getAllAirlines());
      assert.equal(list.length, 3);
      assert.include(await Promise.all(list.map(async (a) => a.address)), origAirline.address);
      const airline = await index.getAirline(origAirline.address);
      // Remove
      const removeAirline = await index.removeAirline(airline);
      const removalResult = await wallet.signAndSendTransaction(removeAirline.transactionData, removeAirline.eventCallbacks);
      assert.isDefined(removalResult);
      // prepare getTransactionsStatus test
      minedTxHashes.push(removalResult.transactionHash);
      // Verify that it has been removed
      list = await index.getAllAirlines();
      assert.equal(list.length, 2);
      assert.notInclude(list.map(async (a) => a.address), await airline.address);
    });

    it('should throw if airline has no address', async () => {
      try {
        const airline = await index.getAirline('0xbf18b616ac81830dd0c5d4b771f22fd8144fe769');
        airline.address = undefined;
        await index.removeAirline(airline);
        throw new Error('should not have been called');
      } catch (e) {
        assert.match(e.message, /cannot remove airline/i);
        assert.match(e.message, /without address/i);
        assert.instanceOf(e, InputDataError);
      }
    });
  });

  describe('getAirline', () => {
    it('should get airline', async () => {
      const address = '0xbf18b616ac81830dd0c5d4b771f22fd8144fe769';
      const airline = await index.getAirline(address);
      assert.isNotNull(airline);
      assert.equal(await airline.dataUri, 'in-memory://urlone');
      assert.equal(await airline.address, address);
    });

    it('should provide an initialized dataIndex', async () => {
      const address = '0xbf18b616ac81830dd0c5d4b771f22fd8144fe769';
      const airline = await index.getAirline(address);
      assert.isNotNull(airline);
      const airlineDataIndex = await airline.dataIndex;
      assert.equal(airlineDataIndex.ref, await airline.dataUri);
      assert.isDefined(airlineDataIndex.contents);
      const airlineDataContents = (await airlineDataIndex.contents);
      const descriptionContents = airlineDataContents.descriptionUri;
      assert.isDefined(descriptionContents.contents);
      assert.isDefined(descriptionContents.ref);
      assert.equal((await descriptionContents.contents).name, 'First airline');
      assert.equal(descriptionContents.ref, 'in-memory://descriptionone');
      const ratePlanContents = airlineDataContents.ratePlansUri;
      assert.isDefined(ratePlanContents.contents);
      assert.isDefined(ratePlanContents.ref);
      assert.equal((await ratePlanContents.contents)['rate-plan'].name, 'Basic');
      assert.equal(ratePlanContents.ref, 'in-memory://rateplansone');
    });

    it('should provide a toPlainObject method', async () => {
      const airline = await index.getAirline('0xbf18b616ac81830dd0c5d4b771f22fd8144fe769');
      assert.isNotNull(airline);
      assert.isDefined(airline.toPlainObject);
      const plainAirline = await airline.toPlainObject();
      assert.isUndefined(plainAirline.toPlainObject);
      assert.equal(plainAirline.address, await airline.address);
      assert.equal(plainAirline.manager, await airline.manager);
      assert.isDefined(plainAirline.dataUri.contents.descriptionUri);
      assert.isDefined(plainAirline.dataUri.contents.descriptionUri.contents);
      assert.isDefined(plainAirline.dataUri.contents.descriptionUri.contents.location);
      assert.equal(plainAirline.dataUri.contents.descriptionUri.contents.name, 'First airline');
      assert.isDefined(plainAirline.dataUri.contents.ratePlansUri);
      assert.isDefined(plainAirline.dataUri.contents.ratePlansUri.contents);
      assert.equal(plainAirline.dataUri.contents.ratePlansUri.contents['rate-plan-2'].name, 'More expensive');
    });

    it('should throw if no airline is found on given address', async () => {
      try {
        await index.getAirline('0x96eA4BbF71FEa3c9411C1Cefc555E9d7189695fA');
        throw new Error('should not have been called');
      } catch (e) {
        assert.match(e.message, /cannot find airline/i);
        assert.instanceOf(e, WTLibsError);
      }
    });
  });

  describe('updateAirline', () => {
    const airlineAddress = '0xbf18b616ac81830dd0c5d4b771f22fd8144fe769';

    it('should update airline', async () => {
      const newUri = 'in-memory://another-url';
      const airline = await index.getAirline(airlineAddress);
      const oldUri = await airline.dataUri;
      airline.dataUri = newUri;
      // Change the data
      const updateAirlineSet = await index.updateAirline(airline);
      let updateResult;
      for (let updateAirline of updateAirlineSet) {
        updateResult = await wallet.signAndSendTransaction(updateAirline.transactionData, updateAirline.eventCallbacks);
        assert.isDefined(updateResult);
      }
      // Verify
      const airline2 = await index.getAirline(airlineAddress);
      assert.equal(await airline2.dataUri, newUri);
      // Change it back to keep data in line
      airline.dataUri = oldUri;
      const updateAirlineSet2 = await index.updateAirline(airline);
      for (let updateAirline of updateAirlineSet2) {
        updateResult = await wallet.signAndSendTransaction(updateAirline.transactionData, updateAirline.eventCallbacks);
        assert.isDefined(updateResult);
      }
      // Verify it changed properly
      const airline3 = await index.getAirline(airlineAddress);
      assert.equal(await airline3.dataUri, oldUri);
    });

    it('should throw if airline has no address', async () => {
      try {
        const newUri = 'in-memory://another-random-hash';
        const airline = await index.getAirline(airlineAddress);
        airline.dataUri = newUri;
        airline.address = undefined;
        await index.updateAirline(airline);
        throw new Error('should not have been called');
      } catch (e) {
        assert.match(e.message, /cannot update airline/i);
        assert.match(e.message, /without address/i);
        assert.instanceOf(e, InputDataError);
      }
    });

    it('should throw if airline has no dataUri', async () => {
      try {
        const airline = await index.getAirline(airlineAddress);
        airline.dataUri = undefined;
        await index.updateAirline(airline);
        throw new Error('should not have been called');
      } catch (e) {
        assert.match(e.message, /cannot update airline/i);
        assert.match(e.message, /cannot set dataUri when it is not provided/i);
        assert.instanceOf(e, InputDataError);
      }
    });

    it('should throw if airline does not exist on network', async () => {
      try {
        const airline = {
          address: '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826',
          dataUri: 'in-memory://another-random-hash',
        };
        await index.updateAirline(airline);
        throw new Error('should not have been called');
      } catch (e) {
        assert.match(e.message, /cannot update airline/i);
        assert.instanceOf(e, WTLibsError);
      }
    });
  });

  describe('transferAirlineOwnership', () => {
    const airlineAddress = '0xBF18B616aC81830dd0C5D4b771F22FD8144fe769',
      newAirlineOwner = '0x04e46F24307E4961157B986a0b653a0D88F9dBd6';

    it('should transfer airline', async () => {
      const airline = await index.getAirline(airlineAddress);
      const airlineContract = await airline._getContractInstance();

      assert.equal(await airline.manager, airlineManager);
      assert.equal(await airlineContract.methods.manager().call(), airlineManager);
      
      const updateAirline = await index.transferAirlineOwnership(airline, newAirlineOwner);
      await wallet.signAndSendTransaction(updateAirline.transactionData, updateAirline.eventCallbacks);
      // Verify
      const airline2 = await index.getAirline(airlineAddress);
      const airline2Contract = await airline2._getContractInstance();
      assert.equal(await airline2.manager, newAirlineOwner);
      assert.equal(await airline2Contract.methods.manager().call(), newAirlineOwner);
      
      // Change it back to keep data in line
      const updateAirline2 = await index.transferAirlineOwnership(airline, airlineManager);
      const wallet2 = libs.createWallet(jsonWallet2);
      wallet2.unlock('test123');
      await wallet2.signAndSendTransaction(updateAirline2.transactionData, updateAirline2.eventCallbacks);
      // Verify
      const airline3 = await index.getAirline(airlineAddress);
      const airline3Contract = await airline3._getContractInstance();
      assert.equal(await airline3.manager, airlineManager);
      assert.equal(await airline3Contract.methods.manager().call(), airlineManager);
    });
  });

  describe('getAllAirliness', () => {
    it('should get all airlines', async () => {
      const airlines = await index.getAllAirlines();
      assert.equal(airlines.length, 2);
      for (let airline of airlines) {
        assert.isDefined(airline.toPlainObject);
        assert.isDefined((await airline.dataIndex).ref);
        const plainAirline = await airline.toPlainObject();
        assert.equal(plainAirline.address, await airline.address);
        assert.equal(plainAirline.manager, await airline.manager);
        assert.isDefined(plainAirline.dataUri.ref);
        assert.isDefined(plainAirline.dataUri.contents);
      }
    });

    it('should get empty list if no airlines are set', async () => {
      const airline = await emptyIndex.getAllAirlines();
      assert.equal(airline.length, 0);
    });
  });

  describe('getTransactionsStatus', () => {
    // This unfortunately depends on other tests - to
    // make this isolated, we would have to run some transactions
    // beforehand
    it('should return transaction status', async () => {
      let result = await libs.getTransactionsStatus(minedTxHashes);
      assert.isDefined(result.meta);
      assert.equal(result.meta.total, minedTxHashes.length);
      assert.equal(result.meta.processed, minedTxHashes.length);
      assert.equal(result.meta.allPassed, true);
      for (let hash of minedTxHashes) {
        assert.isDefined(result.results[hash]);
        assert.isDefined(result.results[hash].transactionHash);
        assert.isDefined(result.results[hash].from);
        assert.isDefined(result.results[hash].to);
        assert.isDefined(result.results[hash].blockAge);
        assert.isDefined(result.results[hash].decodedLogs);
        assert.isDefined(result.results[hash].raw);
      }
    });

    it('should return nothing if transactions do not exist', async () => {
      let result = await libs.getTransactionsStatus(['random-tx', 'another-random-tx']);
      assert.isDefined(result.meta);
      assert.equal(result.meta.total, 2);
      assert.equal(result.meta.processed, 0);
      assert.equal(result.meta.allPassed, false);
      assert.deepEqual(result.results, {});
    });
  });
});
