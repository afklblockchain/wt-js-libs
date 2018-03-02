const assert = require('chai').assert;
const Web3 = require('web3');
const provider = new Web3.providers.HttpProvider('http://localhost:8545');
const web3 = new Web3(provider);

const help = require('./helpers/index');
const library = require('../dist/node/wt-js-libs');
const User = library.User;
const BookingData = library.BookingData;
const web3providerFactory = library.web3providerFactory;

describe('User', function () {
  let Manager;
  let token;
  let index;
  let accounts;
  let ownerAccount;
  let augusto;
  let wallet;
  let userOptions;
  let user;
  let hotelAddress;
  let unitAddress;
  let web3provider;
  let typeName;

  before(async function () {
    web3provider = web3providerFactory.getInstance(web3);
    accounts = await web3provider.web3.eth.getAccounts();
    ({
      index,
      token,
      wallet,
    } = await help.createWindingTreeEconomy(accounts, web3provider));

    ownerAccount = wallet['1'].address;
    augusto = wallet['2'].address;
  });

  describe('balanceCheck', function () {
    let user;

    beforeEach(async () => {
      userOptions = {
        account: augusto,
        tokenAddress: token.options.address,
        web3provider: web3provider,
      };
      user = new User(userOptions);
    });

    it('should return true if balance is greater than cost', async () => {
      const cost = 50;
      const canPay = await user.balanceCheck(cost);
      assert.isTrue(canPay);
    });

    it('should return false if balance is lower than cost', async () => {
      const cost = 5000;
      const canPay = await user.balanceCheck(cost);
      assert.isFalse(canPay);
    });
  });

  describe('book', function () {
    const fromDate = new Date('10/10/2020');
    const daysAmount = 5;
    let guestData, data, hotel;

    beforeEach(async function () {
      guestData = web3provider.web3.utils.toHex('guestData');
      ({
        Manager,
        hotelAddress,
        unitAddress,
        typeName,
      } = await help.generateCompleteHotel(index.options.address, ownerAccount, 1.5, web3provider));
      userOptions = {
        account: augusto,
        gasMargin: 1.5,
        web3provider: web3provider,
      };

      user = new User(userOptions);
      data = new BookingData({ web3provider: web3provider });
      hotel = web3provider.contracts.getHotelInstance(hotelAddress);

      await Manager.setRequireConfirmation(hotelAddress, true);
    });

    it('should initiate a booking: CallStarted event fired / Book event not fired', async () => {
      await user.book(
        hotelAddress,
        unitAddress,
        fromDate,
        daysAmount,
        guestData
      );

      const events = await hotel.getPastEvents('allEvents', { fromBlock: 0 });
      const CallStarted = events[0];

      assert.equal(events.length, 1);
      assert.equal(CallStarted.event, 'CallStarted');
      assert.equal(CallStarted.returnValues.from, augusto);
      assert.isString(CallStarted.returnValues.dataHash);
    });

    it('should fire Book & CallFinished events when manager confirms', async () => {
      await user.book(
        hotelAddress,
        unitAddress,
        fromDate,
        daysAmount,
        guestData
      );

      const callStartedEvents = await hotel.getPastEvents('CallStarted');
      const dataHash = callStartedEvents[0].returnValues.dataHash;

      await Manager.confirmBooking(hotelAddress, dataHash);

      const events = await hotel.getPastEvents('allEvents', { fromBlock: 0 });
      const bookEvents = events.filter(item => item.event === 'Book');
      const callFinishEvents = events.filter(item => item.event === 'CallFinish');

      assert.equal(bookEvents.length, 1);
      assert.equal(callFinishEvents.length, 1);
    });

    it('should make the reservation when manager confirms', async () => {
      // Pre booking request
      let isAvailable = await data.unitIsAvailable(hotelAddress, unitAddress, fromDate, daysAmount);
      assert.isTrue(isAvailable);

      await user.book(
        hotelAddress,
        unitAddress,
        fromDate,
        daysAmount,
        guestData
      );

      // Post booking request / pre-confirmation
      isAvailable = await data.unitIsAvailable(hotelAddress, unitAddress, fromDate, daysAmount);
      assert.isTrue(isAvailable);

      const callStartedEvents = await hotel.getPastEvents('CallStarted');
      const dataHash = callStartedEvents[0].returnValues.dataHash;
      await Manager.confirmBooking(hotelAddress, dataHash);

      // Post confirmation
      isAvailable = await data.unitIsAvailable(hotelAddress, unitAddress, fromDate, daysAmount);
      assert.isFalse(isAvailable);
    });
  });

  describe('bookWithLif: success cases', function () {
    const fromDate = new Date('10/10/2020');
    const daysAmount = 5;
    const price = 1;
    let guestData, data, hotel;

    beforeEach(async function () {
      guestData = web3provider.web3.utils.toHex('guestData');
      ({
        Manager,
        hotelAddress,
        unitAddress,
        typeName,
      } = await help.generateCompleteHotel(index.options.address, ownerAccount, 1.5, web3provider));

      userOptions = {
        account: augusto,
        gasMargin: 1.5,
        tokenAddress: token.options.address,
        web3provider: web3provider,
      };

      user = new User(userOptions);
      data = new BookingData({ web3provider: web3provider });
      hotel = web3provider.contracts.getHotelInstance(hotelAddress);

      await Manager.setDefaultLifPrice(hotelAddress, typeName, price);
    });

    it('should make a booking: event fired', async () => {
      await user.bookWithLif(
        hotelAddress,
        unitAddress,
        fromDate,
        daysAmount,
        guestData
      );

      const events = await hotel.getPastEvents('Book');
      const book = events[0].returnValues;
      assert.equal(book.from, augusto);
      assert.equal(book.unit, unitAddress);
      assert.equal(book.fromDay, web3provider.utils.formatDate(fromDate));
      assert.equal(book.daysAmount, daysAmount);
    });

    it('should make a booking: days reserved', async () => {
      let isAvailable = await data.unitIsAvailable(hotelAddress, unitAddress, fromDate, daysAmount);
      assert.isTrue(isAvailable);

      await user.bookWithLif(
        hotelAddress,
        unitAddress,
        fromDate,
        daysAmount,
        guestData
      );

      isAvailable = await data.unitIsAvailable(hotelAddress, unitAddress, fromDate, daysAmount);
      assert.isFalse(isAvailable);
    });

    it('should make a booking: tokens transferred', async () => {
      let augustoInitialBalance = await token.methods.balanceOf(augusto).call();
      let hotelInitialBalance = await token.methods.balanceOf(hotelAddress).call();
      let lifWeiCost = web3provider.utils.lif2LifWei(price * daysAmount);

      augustoInitialBalance = new web3provider.web3.utils.BN(augustoInitialBalance);
      hotelInitialBalance = new web3provider.web3.utils.BN(hotelInitialBalance);
      lifWeiCost = new web3provider.web3.utils.BN(lifWeiCost);

      await user.bookWithLif(
        hotelAddress,
        unitAddress,
        fromDate,
        daysAmount,
        guestData
      );

      let augustoFinalBalance = await token.methods.balanceOf(augusto).call();
      let hotelFinalBalance = await token.methods.balanceOf(hotelAddress).call();

      augustoFinalBalance = new web3provider.web3.utils.BN(augustoFinalBalance);
      hotelFinalBalance = new web3provider.web3.utils.BN(hotelFinalBalance);

      const augustoExpectedBalance = augustoInitialBalance.sub(lifWeiCost);
      const hotelExpectedBalance = hotelInitialBalance.add(lifWeiCost);

      assert(augustoExpectedBalance.eq(augustoFinalBalance));
      assert(hotelExpectedBalance.eq(hotelFinalBalance));
    });

    it('should reject if the Unit has already been booked for the range of dates', async () => {
      const firstDate = new Date('10/10/2020');
      const secondDate = new Date('10/11/2020');

      const args = [
        hotelAddress,
        unitAddress,
        firstDate,
        daysAmount,
        guestData,
      ];

      await user.bookWithLif(...args);
      args[2] = secondDate;

      try {
        await user.bookWithLif(...args);
        assert(false);
      } catch (e) {
        assert.isDefined(e);
      }
    });

    it('should reject if the Units active status is false', async () => {
      const firstDate = new Date('10/10/2020');
      const secondDate = new Date('10/10/2021'); // Different year

      const args = [
        hotelAddress,
        unitAddress,
        firstDate,
        daysAmount,
        guestData,
      ];

      await user.bookWithLif(...args);
      await Manager.setUnitActive(hotelAddress, unitAddress, false);
      args[2] = secondDate;

      try {
        await user.bookWithLif(...args);
        assert(false);
      } catch (e) {
        assert.isDefined(e);
      }
    });

    it('should reject if the users balance is insufficient', async () => {
      // Augusto's total balance is set to 500 in the before();
      // Total price for this booking will be 2500;
      const newPrice = 500;
      await Manager.setDefaultLifPrice(hotelAddress, typeName, newPrice);

      const args = [
        hotelAddress,
        unitAddress,
        fromDate,
        daysAmount,
        guestData,
      ];

      try {
        await user.bookWithLif(...args);
        assert(false);
      } catch (e) {
        assert.isDefined(e);
      }
    });
  });
});
