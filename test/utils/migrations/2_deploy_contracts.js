const TruffleContract = require('truffle-contract');
const Web3 = require('web3');
const provider = new Web3.providers.HttpProvider('http://localhost:8545');

// dirty hack for web3@1.0.0 support for localhost ganache-cli, see
// https://github.com/trufflesuite/truffle-contract/issues/56#issuecomment-331084530
function hackInSendAsync (instance) {
  if (typeof instance.currentProvider.sendAsync !== 'function') {
    instance.currentProvider.sendAsync = function () {
      return instance.currentProvider.send.apply(
        instance.currentProvider, arguments
      );
    };
  }
  return instance;
}

function getContractWithProvider (metadata, provider) {
  let contract = new TruffleContract(metadata);
  contract.setProvider(provider);
  contract = hackInSendAsync(contract);
  return contract;
}

const LifTokenTest = getContractWithProvider(require('@windingtree/lif-token/build/contracts/LifTokenTest'), provider);
const WTIndex = getContractWithProvider(require('@windingtree/wt-contracts/build/contracts/WTIndex'), provider);

module.exports = function (deployer, network, accounts) {
  if (network === 'development') {
    let firstIndex, secondIndex,
      firstIndexAddress, secondIndexAddress;
    // First, we need the token contract with a faucet
    return deployer.deploy(LifTokenTest, { from: accounts[0], gas: 60000000 })
      .then(function () {
        // And then we setup the WTIndex
        return deployer.deploy(WTIndex, { from: accounts[0], gas: 60000000 });
      }).then(function () {
        firstIndexAddress = WTIndex.address;
        firstIndex = WTIndex.at(firstIndexAddress);
        return firstIndex.setLifToken(LifTokenTest.address, { from: accounts[0], gas: 60000000 });
      }).then(function (a) {
        return deployer.deploy(WTIndex, { from: accounts[0], gas: 60000000 });
      }).then(function () {
        secondIndexAddress = WTIndex.address;
        secondIndex = WTIndex.at(secondIndexAddress);
        return secondIndex.setLifToken(LifTokenTest.address, { from: accounts[0], gas: 60000000 });
      }).then(function () {
        return Promise.all([
          firstIndex.registerAirline('in-memory://urlone', { from: accounts[2], gas: 60000000 }),
          firstIndex.registerAirline('in-memory://urltwo', { from: accounts[1], gas: 60000000 }),
        ]);
      }).then(function () {
        return firstIndex.getAirlines();
      }).then(function (airlines) {
        console.log('========================================');
        console.log('    Index and token owner:', accounts[0]);
        console.log('    Wallet account:', accounts[1]);
        console.log('    LifToken with faucet:', LifTokenTest.address);
        console.log('    WTIndex:', firstIndexAddress);
        console.log('    Second WTIndex:', secondIndexAddress);
        console.log('    First airline', airlines[1]);
        console.log('    Second airline', airlines[2]);
        return true;
      });
  }
};
