import { assert } from 'chai';
import sinon from 'sinon';
import Web3 from 'web3';
import Contracts from '../../src/contracts';
import { SmartContractInstantiationError } from '../../src/errors';

describe('WTLibs.Contracts', () => {
  let contracts, getCodeStub, ContractStub;

  beforeEach(() => {
    getCodeStub = sinon.stub().resolves('0x01');
    ContractStub = sinon.spy();
    let web3 = new Web3();
    web3.eth.getCode = getCodeStub;
    web3.eth.Contract = ContractStub;
    contracts = Contracts.createInstance(web3);
  });

  it('should throw on an invalid address', async () => {
    sinon.stub(contracts.web3.utils, 'isAddress').returns(false);
    try {
      await contracts._getInstance('some', {}, 'address');
      throw new Error('should not have been called');
    } catch (e) {
      assert.match(e.message, /at an invalid address/i);
      assert.instanceOf(e, SmartContractInstantiationError);
    }
    contracts.web3.utils.isAddress.restore();
  });

  it('should throw if no code exists on the address', async () => {
    contracts.web3.eth.getCode = sinon.stub().returns('0x0');
    try {
      await contracts._getInstance('some', {}, '0x36bbf6b87d1a770edd5d64145cc617385c66885d');
      throw new Error('should not have been called');
    } catch (e) {
      assert.match(e.message, /address with no code/i);
      assert.instanceOf(e, SmartContractInstantiationError);
    }
  });

  it('should get airline instance', async () => {
    await contracts.getIndexInstance('0x0C4c734F0Ecb92270D1ebE7b04aEC4440EB05CAa');
    assert.equal(ContractStub.calledWithNew(), true);
  });

  it('should get index instance', async () => {
    await contracts.getAirlineInstance('0x8C2373842D5EA4Ce4Baf53f4175e5e42a364c59C');
    assert.equal(ContractStub.calledWithNew(), true);
  });

  it('should not panic on empty logs', async () => {
    assert.isEmpty(await contracts.decodeLogs([]));
    assert.isEmpty(await contracts.decodeLogs([{}]));
    assert.isEmpty(await contracts.decodeLogs([{ topics: [] }]));
  });

  it('should work properly for real anonymous events', async () => {
    const decodedLogs = await contracts.decodeLogs([{ logIndex: 0,
      transactionIndex: 0,
      transactionHash: '0x3cf69467de98fd4e4ee6a5e837aea30f1b51c5a3283e376759e09915cf0369fa',
      blockHash: '0x0fc47cc61156908e96691b07e762b4ede74dc3fa27a78520e639c64dce4fd2e1',
      blockNumber: 10,
      address: '0x8C2373842D5EA4Ce4Baf53f4175e5e42a364c59C',
      data: '0x0000000000000000000000000c4c734f0ecb92270d1ebe7b04aec4440eb05caa00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003',
      topics:
       [ '0x48ef5bfc00516d6bf1a7f158974c1fba6bf24e304f11694183817750fb6f0b82' ],
      type: 'mined',
      id: 'log_c1dc1e3f' }]);
    assert.equal(decodedLogs.length, 1);
    assert.equal(decodedLogs[0].event, 'AirlineRegistered');
    assert.equal(decodedLogs[0].address, '0x8C2373842D5EA4Ce4Baf53f4175e5e42a364c59C');
    assert.equal(decodedLogs[0].attributes.length, 3);
    assert.equal(decodedLogs[0].attributes[0].name, 'airline');
    assert.equal(decodedLogs[0].attributes[1].name, 'managerIndex');
    assert.equal(decodedLogs[0].attributes[2].name, 'allIndex');
    assert.equal(decodedLogs[0].attributes[0].type, 'address');
    assert.equal(decodedLogs[0].attributes[1].type, 'uint256');
    assert.equal(decodedLogs[0].attributes[2].type, 'uint256');
    assert.equal(decodedLogs[0].attributes[0].value, '0x0C4c734F0Ecb92270D1ebE7b04aEC4440EB05CAa');
    assert.equal(decodedLogs[0].attributes[1].value, '1');
    assert.equal(decodedLogs[0].attributes[2].value, '3');
  });
});
