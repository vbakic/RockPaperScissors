// Import libraries we need.
import { default as Web3 } from 'web3'
import { default as contract } from 'truffle-contract'

// Import our contract artifacts and turn them into usable abstractions.
import ContractArtifact from '../../build/contracts/RockPaperScissors.json'
const Contract = contract(ContractArtifact)
const Promise = require("bluebird");
const assert = require('assert-plus');

const contractStates = ["Running", "Paused", "Killed"]
const possibleMoves = ["N/A", "Rock", "Paper", "Scissors"]
let accounts, player1, player2, instance, owner

window.addEventListener('load', function () {
  if (typeof window.web3 !== 'undefined') {
      // Don't lose an existing provider, like Mist or Metamask
      window.web3 = new Web3(web3.currentProvider);
  } else {
      // set the provider you want from Web3.providers
      window.web3 = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:8545'))
  }
  web3.eth.getTransactionReceiptMined = require("../../utils/getTransactionReceiptMined.js");
  // Promisify all functions of web3.eth and web3.version
  Promise.promisifyAll(web3.eth, { suffix: "Promise" });
  Promise.promisifyAll(web3.version, { suffix: "Promise" });
  App.start()
  window.App = App
  jQuery("#player1, #player2").change(() => {
    App.update();
  })
})

const App = {

  update: function() {
      console.log('update called!')
      player1 = accounts[jQuery("#player1").val()]
      player2 = accounts[jQuery("#player2").val()]
      this.refreshBalances()
  },

  start: async function () {
    const self = this

    // Bootstrap the Contract abstraction for Use.
    Contract.setProvider(web3.currentProvider)

    instance = await Contract.deployed()
    accounts = await web3.eth.getAccountsPromise()

    if (accounts.length < 5){
      throw new Error("No available accounts!");
    }
    else {
      player1 = accounts[0]
      player2 = accounts[1]
      self.refreshBalances()
    }

  },

  followUpTransaction: async function(txHash) {
    console.log("Your transaction is on the way, waiting to be mined!", txHash);
    let receipt = await web3.eth.getTransactionReceiptMined(txHash);
    assert.strictEqual(parseInt(receipt.status), 1);
    console.log("Your transaction executed successfully!");
    return true;
  },

  killContract: async function () {
    let txHash = await instance.killContract.sendTransaction({from: owner})
    let success = await this.followUpTransaction(txHash);
    if(success) {
      jQuery("#contractState").html("Killed");
    }
  },

  pauseContract: async function () {
    let txHash = await instance.pauseContract.sendTransaction({from: owner})
    let success = await this.followUpTransaction(txHash);
    if(success) {
      jQuery("#contractState").html("Paused");
    }
    return true;
  },

  resumeContract: async function () {
    let txHash = await instance.resumeContract.sendTransaction({from: owner})
    let success = await this.followUpTransaction(txHash);
    if(success) {
      jQuery("#contractState").html("Running");
    }
  },

  changeOwner: async function () {
    let index = jQuery("#ownerSelector").val()
    if(accounts[index] != owner) {
      let txHash = await instance.changeOwner.sendTransaction(accounts[index], {from: owner})
      let success = await this.followUpTransaction(txHash);
      if(success) {
        owner = accounts[index];
        this.refreshOwnerInfo()
      }
    } else {
      console.error("Already that owner")
    }
  },

  refreshOwnerInfo: async function () {
    owner = await instance.getOwner({from: owner})
    for (let [index, element] of accounts.entries()) {
      if(element == owner) {
        jQuery("#currentOwner").val(index)
      }
    }
  },

  refreshBalances: async function () {
    const self = this
    self.refreshOwnerInfo()
    self.refreshAccountBalances()
    self.refreshContractStakes()
    self.updateContractState()
    const balance = await web3.eth.getBalancePromise(instance.address)
    jQuery('#contract').val(convertToEther(balance))
  },

  updateContractState: async function () {
    let contractState = await instance.getState({from: owner})
    jQuery('#contractState').html(contractStates[contractState.toNumber()])
    let gameStatus = await instance.player1({from: owner});
    if(web3.toBigNumber(gameStatus).isZero()) {
        jQuery("#gameStatus").html("Game not started yet");
    } else {
        jQuery("#gameStatus").html("Game started, waiting for player 2...");
    }
  },

  refreshContractStakes: async function () {
    let player1Stake = await instance.balances(player1, {from: player1});
    jQuery("#player1Stake").val(convertToEther(player1Stake));
    let player2Stake = await instance.balances(player2, {from: player2});
    jQuery("#player2Stake").val(convertToEther(player2Stake));
  },

  refreshAccountBalances: async function () {
    const player1Balance = await web3.eth.getBalancePromise(player1);
    jQuery("#player1Balance").val(convertToEther(player1Balance));
    const player2Balance = await web3.eth.getBalancePromise(player2);
    jQuery("#player2Balance").val(convertToEther(player2Balance));
  },

  submitMove1: async function () {
    let hashedMove = await instance.encryptMove(jQuery("#move1").val(), { from: player1 });
    let txHash = await instance.submitMove.sendTransaction(hashedMove, { from: player1, value: convertToWei(jQuery("#stake1").val()), gas: 1800000 })
    let success = await this.followUpTransaction(txHash);
    if(success) {
      this.refreshBalances()
      console.log('success');
    }
  },

  submitMove2: async function () {
    let hashedMove = await instance.encryptMove(jQuery("#move2").val(), { from: player2 });
    let txHash = await instance.submitMove.sendTransaction(hashedMove, { from: player2, value: convertToWei(jQuery("#stake2").val()), gas: 1800000 })
    let success = await this.followUpTransaction(txHash);
    if(success) {
      this.refreshBalances()
      console.log('success');
    }
  },

  withdrawEther1: async function () {
    let txHash = await instance.withdrawEther.sendTransaction(convertToWei(jQuery("#amountToWithdraw1").val()), { from: player1 })
    let success = await this.followUpTransaction(txHash);
    if(success) {
      this.refreshBalances()
    }
  },

  withdrawEther2: async function () {
    let txHash = await instance.withdrawEther.sendTransaction(convertToWei(jQuery("#amountToWithdraw2").val()), { from: player2 })
    let success = await this.followUpTransaction(txHash);
    if(success) {
      this.refreshBalances()
    }
  }
}

function convertToEther(value) {
  return web3.fromWei(value.toString(10), "ether");
}

function convertToWei(value) {
  return web3.toWei(value, "ether");
}
