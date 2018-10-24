/**
 * Generic WT Libs error.
 */
export class WTLibsError extends Error {
  constructor (message, originalError) {
    super(message);
    this.name = this.constructor.name;
    this.originalError = originalError;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * A smart contract abstraction could not have been created.
 */
export class SmartContractInstantiationError extends WTLibsError {}

/**
 * Some error occurred in the wallet abstraction.
 */
export class WalletError extends WTLibsError {}

/**
 * Thrown when a wallet cannot be decrypted by web3 due to its format
 * or bad parameters.
 */
export class MalformedWalletError extends WalletError {}

/**
 * Thrown when an operation is performed with a wallet
 * that can not be currently done due to its internal state.
 */
export class WalletStateError extends WalletError {}

/**
 * Wallet cannot be decrypted because of a bad password.
 */
export class WalletPasswordError extends WalletError {}

/**
 * Error occured during signing a transaction, that might
 * mean that the wallet can't sign the transaction data,
 * because tx.from does not match the wallet's address.
 */
export class WalletSigningError extends WalletError {}

/**
 * Generic error that happens when no special case is
 * detected during transaction mining error throw by web3.js
 */
export class TransactionMiningError extends WTLibsError {}

/**
 * Transaction supposedly ran out of gas and was not mined.
 * This depends on how precisely the error is reported by EVM
 * and subsequently web3.js
 */
export class OutOfGasError extends TransactionMiningError {}

/**
 * Transaction supposedly was not mined because the originating
 * account does not have enough funds.
 * This depends on how precisely the error is reported by EVM
 * and subsequently web3.js
 */
export class InsufficientFundsError extends TransactionMiningError {}

/**
 * Transaction was supposedly reverted and was not mined.
 * This depends on how precisely the error is reported by EVM
 * and subsequently web3.js
 */
export class TransactionRevertedError extends TransactionMiningError {}

/**
 * There was a problem with getting a transaction receipt (network issue,
 * timeout, small gasPrice). It does not necessarily mean that the
 * transaction was not mined. You should probably check for it by other means.
 * This depends on how precisely the error is reported by EVM
 * and subsequently web3.js
 */
export class NoReceiptError extends TransactionMiningError {}

/**
 * There was a problem with communicating with the Ethereum node.
 * The library has literally zero idea about what really happened with the
 * transaction.
 */
export class InaccessibleEthereumNodeError extends TransactionMiningError {}

/**
 * Input data has a wrong format or some data is missing.
 */
export class InputDataError extends WTLibsError {}

/**
 * Generic error related to off-chain stored data.
 */
export class OffChainDataError extends WTLibsError {}

/**
 * An error occurred during a configuration of off-chain data storages.
 */
export class OffChainDataConfigurationError extends OffChainDataError {}

/**
 * An error occurred during an attempt to use off-chain data storage.
 */
export class OffChainDataRuntimeError extends OffChainDataError {}

/**
 * An error occurred when working with a StoragePointer.
 */
export class StoragePointerError extends WTLibsError {}

/**
 * Generic error that occurrs during any work with RemotelyBackedDataset.
 */
export class RemotelyBackedDatasetError extends WTLibsError {}

/**
 * It is impossible to access remote data (i. e. the data is in bad state).
 */
export class RemoteDataAccessError extends RemotelyBackedDatasetError {}

/**
 * It is impossible to read from remote data (i. e. the connection might have been lost).
 */
export class RemoteDataReadError extends RemotelyBackedDatasetError {}

/**
 * Hotel is not found in WTIndex for some reason.
 */
export class HotelNotFoundError extends WTLibsError {}

/**
 * Hotel abstraction instance cannot be created for some reason.
 */
export class HotelNotInstantiableError extends WTLibsError {}

/**
 * Airline is not found in WTIndex for some reason.
 */
export class AirlineNotFoundError extends WTLibsError {}

/**
 * Airline abstraction instance cannot be created for some reason.
 */
export class AirlineNotInstantiableError extends WTLibsError {}